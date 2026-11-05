import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { initialState } from '../src/shared/contracts.js';
import { ReaderError } from '../src/shared/errors.js';
import { ReadingStore } from '../src/storage/reading-store.js';
import { WordCountStore } from '../src/storage/word-counts.js';

async function temporary(run: (root: string) => Promise<void>) {
  const base = path.resolve('.ai/local/test-data');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, 'reading-boundary-'));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('old JSON and SQLite normalize missing guards while retaining private records, preferences and the original source', async () =>
  temporary(async (root) => {
    const legacy = {
      ...initialState(),
      recentChapterId: 'original/1',
      records: {
        'original/1': {
          chapterId: 'original/1',
          storyId: 'original',
          revision: 'original-v1',
          last: { blockId: 'paragraph', fraction: 0.25 },
          furthestWords: 70,
          complete: false,
          updatedAt: '2026-11-01T00:00:00.000Z',
        },
      },
      settings: { autoImages: true, retentionDays: 30, theme: 'dark' },
    };
    const original = JSON.stringify(legacy);
    for (const format of ['json', 'sqlite']) {
      const location = path.join(root, format);
      await mkdir(path.join(location, 'reading'), { recursive: true });
      const file = path.join(location, 'reading/state.json');
      await writeFile(file, original);
      const db = new DatabaseSync(
        path.join(location, 'reading/records.sqlite'),
      );
      try {
        db.exec(
          'CREATE TABLE reading_state (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL)',
        );
        if (format === 'sqlite')
          db.prepare('INSERT INTO reading_state VALUES (1, ?)').run(original);
        const store = new ReadingStore(location);
        const state = await store.read();
        assert.deepEqual(state, {
          ...legacy,
          chapterRevisions: {},
          historyEpoch: 0,
          storyHistoryEpochs: {},
        });
        if (format === 'sqlite')
          assert.equal(
            db.prepare('SELECT data FROM reading_state').get()?.data,
            original,
            'reading existing rows does not rewrite them',
          );
        await store.change((current) => ({
          ...current,
          historyEpoch: 3,
          storyHistoryEpochs: { original: 2 },
          chapterRevisions: { 'original/1': 'original-v1' },
        }));
        const restarted = await new ReadingStore(location).read();
        assert.equal(restarted.historyEpoch, 3);
        assert.deepEqual(restarted.storyHistoryEpochs, { original: 2 });
        assert.deepEqual(restarted.chapterRevisions, {
          'original/1': 'original-v1',
        });
        assert.deepEqual(restarted.records, legacy.records);
        assert.deepEqual(restarted.settings, legacy.settings);
        assert.equal(await readFile(file, 'utf8'), original);
      } finally {
        db.close();
      }
    }
  }));

test('invalid stored guards and malformed SQLite JSON remain visible and recover after external repair without falling back to legacy JSON', async () =>
  temporary(async (root) => {
    const store = new ReadingStore(root);
    const good = await store.read();
    await writeFile(
      path.join(root, 'reading/state.json'),
      JSON.stringify(initialState()),
    );
    const db = new DatabaseSync(path.join(root, 'reading/records.sqlite'));
    try {
      const update = db.prepare(
        'UPDATE reading_state SET data = ? WHERE id = 1',
      );
      for (const raw of [
        '{broken',
        JSON.stringify({ ...good, historyEpoch: -1 }),
        JSON.stringify({ ...good, storyHistoryEpochs: { original: null } }),
      ]) {
        update.run(raw);
        await assert.rejects(
          () => store.read(),
          (error: unknown) => {
            assert.ok(error instanceof ReaderError);
            assert.equal(error.code, 'storage');
            assert.match(error.message, /原文件已保留/u);
            return true;
          },
        );
        assert.equal(
          db.prepare('SELECT data FROM reading_state').get()?.data,
          raw,
        );
      }
      update.run(JSON.stringify(good));
      assert.deepEqual(await store.read(), good);
    } finally {
      db.close();
    }
  }));

test('failed private writes preserve the committed state, retain the SQLite cause privately and allow a later retry', async () =>
  temporary(async (root) => {
    const store = new ReadingStore(root);
    const before = await store.read();
    const db = new DatabaseSync(path.join(root, 'reading/records.sqlite'));
    try {
      db.exec(
        "CREATE TRIGGER reject_update BEFORE UPDATE ON reading_state BEGIN SELECT RAISE(ABORT, 'injected private write failure'); END",
      );
      const change = () =>
        store.change((state) => ({ ...state, historyEpoch: 1 }));
      await assert.rejects(change, (error: unknown) => {
        assert.ok(error instanceof ReaderError);
        assert.equal(error.code, 'storage');
        assert.ok(error.cause instanceof Error);
        assert.match(error.cause.message, /injected private write failure/u);
        assert.equal(
          JSON.stringify(error.toFailure()).includes('injected'),
          false,
        );
        return true;
      });
      assert.deepEqual(await store.read(), before);
      db.exec('DROP TRIGGER reject_update');
      assert.equal((await change()).historyEpoch, 1);
      assert.equal((await new ReadingStore(root).read()).historyEpoch, 1);
    } finally {
      db.close();
    }
  }));

test('reading directory failures are classified as storage errors, preserve the path and permit recovery', async () =>
  temporary(async (root) => {
    const file = path.join(root, 'reading');
    await writeFile(file, 'original sentinel');
    const store = new ReadingStore(root);
    await assert.rejects(
      () => store.read(),
      (error: unknown) => {
        assert.ok(error instanceof ReaderError);
        assert.equal(error.code, 'storage');
        assert.ok(error.cause instanceof Error);
        return true;
      },
    );
    assert.equal(await readFile(file, 'utf8'), 'original sentinel');
    await rm(file);
    assert.deepEqual((await store.read()).records, {});
  }));

test('word-count reads and CAS writes reject the same corrupt disk row and do not overwrite it', async () =>
  temporary(async (root) => {
    const store = new WordCountStore(root);
    const count = {
      chapterId: 'original/1',
      storyId: 'original',
      revision: 'v1',
      wordCount: 12,
      contentKind: 'text' as const,
    };
    const good = store.put(count, undefined);
    const db = new DatabaseSync(path.join(root, 'index/word-counts.sqlite'));
    try {
      const update = db.prepare('UPDATE counts SET data = ? WHERE id = ?');
      for (const raw of [
        '{broken',
        JSON.stringify({ ...good, wordCount: -1 }),
      ]) {
        update.run(raw, count.chapterId);
        for (const read of [
          () => store.all(),
          () => store.put({ ...count, revision: 'v2' }, 'v1'),
        ])
          assert.throws(
            read,
            (error: unknown) =>
              error instanceof ReaderError && error.code === 'storage',
          );
        assert.equal(db.prepare('SELECT data FROM counts').get()?.data, raw);
      }
      update.run(JSON.stringify(good), count.chapterId);
      assert.deepEqual(store.put(count, 'v1'), good);
      assert.equal(
        store.put({ ...count, revision: 'v2' }, 'v1').revision,
        'v2',
      );
      assert.throws(
        () => store.put(count, 'v1'),
        (error: unknown) =>
          error instanceof ReaderError && error.code === 'conflict',
      );
    } finally {
      db.close();
    }
  }));
