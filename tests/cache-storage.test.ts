import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { z } from 'zod';
import { FixtureSource } from '../src/data/fixture.js';
import {
  CacheCoordinator,
  CacheStorageError,
  type CacheScope,
} from '../src/storage/cache-coordinator.js';
import { ContentCache } from '../src/storage/files.js';
import { JsonCache } from '../src/storage/json-cache.js';
import { ReadingStore } from '../src/storage/reading-store.js';

async function temporary(run: (root: string) => Promise<void>) {
  const base = path.resolve('.ai/local/test-data');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, 'cache-storage-'));
  try {
    await run(root);
  } finally {
    new CacheCoordinator(root).close();
    await rm(root, { recursive: true, force: true });
  }
}
async function legacy(
  root: string,
  scope: CacheScope,
  key: string,
  data: object,
) {
  const name =
    scope === 'prts'
      ? 'catalog'
      : createHash('sha256').update(key).digest('hex');
  const file = path.join(root, 'cache', scope, `${name}.json`);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data));
  return file;
}

test('legacy text/catalog/metadata/mapping/image files import on demand without rename, survive restart and expire by last use without resurrecting', async () =>
  temporary(async (root) => {
    let now = 1_000_000;
    const chapter = await new FixtureSource().chapter('fixture-mist/1');
    const text = await legacy(root, 'text', chapter.id, {
      chapter,
      lastUsedAt: now,
    });
    const original = await readFile(text, 'utf8');
    await chmod(text, 0o444);
    try {
      assert.deepEqual(
        await new ContentCache(root, () => now).get(chapter.id, 7),
        chapter,
      );
      const revised = { ...chapter, revision: 'new-cached-revision' };
      await new ContentCache(root, () => now).put(revised);
      assert.equal(await readFile(text, 'utf8'), original);
      new CacheCoordinator(root).close();
      assert.deepEqual(
        await new ContentCache(root, () => now).get(chapter.id, 7),
        revised,
      );
    } finally {
      await chmod(text, 0o666);
    }
    for (const scope of ['metadata', 'mapping', 'images'] as const) {
      await legacy(root, scope, 'asset', { value: 'old', lastUsedAt: now });
      const cache = new JsonCache(root, scope, () => now);
      assert.equal(await cache.get('asset', z.string(), 7), 'old');
      await cache.put('asset', 'new');
      assert.equal(await cache.get('asset', z.string(), 7), 'new');
    }
    const catalog = {
      rootWiki: 'original root',
      navigationWiki: 'original navigation',
    };
    await legacy(root, 'prts', 'catalog', { ...catalog, lastUsedAt: now });
    assert.deepEqual(
      await new JsonCache(root, 'prts', () => now).get(
        'catalog',
        z.object({ rootWiki: z.string(), navigationWiki: z.string() }),
        7,
      ),
      catalog,
    );
    const cache = new JsonCache(root, 'mapping', () => now);
    now += 6 * 86_400_000;
    assert.equal(await cache.get('asset', z.string(), 7), 'new');
    now += 6 * 86_400_000;
    await cache.expire(7);
    assert.equal(await cache.get('asset', z.string(), 7), 'new');
    now += 8 * 86_400_000;
    await cache.expire(7);
    assert.equal(await cache.get('asset', z.unknown(), 7), null);
    // A stale legacy copy left by an interrupted upgrade cannot revive an expired row.
    await legacy(root, 'mapping', 'asset', {
      value: 'obsolete',
      lastUsedAt: now,
    });
    new CacheCoordinator(root).close();
    assert.equal(
      await new JsonCache(root, 'mapping', () => now).get(
        'asset',
        z.unknown(),
        7,
      ),
      null,
    );
    const records = await new ReadingStore(root).read();
    await cache.clear();
    await legacy(root, 'mapping', 'another', {
      value: 'obsolete',
      lastUsedAt: now,
    });
    assert.equal(await cache.get('another', z.string(), 7), null);
    assert.deepEqual(await new ReadingStore(root).read(), records);
  }));

test('failed cache replacement rolls back atomically and exposes original SQLite cause without putting internals on the wire', async () =>
  temporary(async (root) => {
    const cache = new JsonCache(root, 'images');
    await cache.put('asset', 'retained');
    const db = new DatabaseSync(path.join(root, 'cache/content.sqlite'));
    try {
      db.exec(
        "CREATE TRIGGER reject_update BEFORE UPDATE OF value ON entries BEGIN SELECT RAISE(ABORT, 'injected cache failure'); END",
      );
      await assert.rejects(
        () => cache.put('asset', 'replacement'),
        (error: unknown) => {
          assert.ok(error instanceof CacheStorageError);
          assert.equal(error.operation, 'images.put');
          assert.equal(error.phase, 'operation');
          assert.ok(error.cause instanceof Error);
          assert.match(error.cause.message, /injected cache failure/u);
          assert.equal(
            JSON.stringify(error.toFailure()).includes('injected'),
            false,
          );
          return true;
        },
      );
      assert.equal(await cache.get('asset', z.string(), 7), 'retained');
      db.exec('DROP TRIGGER reject_update');
      await cache.put('asset', 'replacement');
      assert.equal(await cache.get('asset', z.string(), 7), 'replacement');
    } finally {
      db.close();
    }
  }));

test('a real SQLite writer lock and a filesystem path failure remain distinguishable and neither is silently retried', async () =>
  temporary(async (root) => {
    const cache = new JsonCache(root, 'images');
    await cache.put('asset', 'retained');
    const blocker = new DatabaseSync(path.join(root, 'cache/content.sqlite'));
    try {
      blocker.exec('BEGIN IMMEDIATE');
      await assert.rejects(
        () => cache.put('asset', 'blocked'),
        (error: unknown) => {
          assert.ok(error instanceof CacheStorageError);
          assert.equal(error.phase, 'begin');
          assert.ok(error.cause instanceof Error && 'errcode' in error.cause);
          assert.equal(error.cause.errcode, 5);
          return true;
        },
      );
    } finally {
      blocker.exec('ROLLBACK');
      blocker.close();
    }
    assert.equal(await cache.get('asset', z.string(), 7), 'retained');
    const blockedRoot = path.join(root, 'filesystem');
    await mkdir(blockedRoot);
    await writeFile(path.join(blockedRoot, 'cache'), 'not a directory');
    await assert.rejects(
      () => new JsonCache(blockedRoot, 'images').put('asset', 'blocked'),
      (error: unknown) => {
        assert.ok(error instanceof CacheStorageError);
        assert.equal(error.phase, 'mkdir');
        assert.ok(error.cause instanceof Error && 'code' in error.cause);
        assert.ok(['EEXIST', 'ENOTDIR'].includes(String(error.cause.code)));
        return true;
      },
    );
  }));
