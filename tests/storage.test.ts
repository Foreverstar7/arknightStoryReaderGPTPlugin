import { CacheCoordinator } from '../src/storage/cache-coordinator.js';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { FixtureSource } from '../src/data/fixture.js';
import { ReaderError, type StorySource } from '../src/data/source.js';
import { ReaderService } from '../src/server/service.js';
import { ContentCache } from '../src/storage/files.js';
import { ReadingStore } from '../src/storage/reading-store.js';
import { initialState } from '../src/shared/contracts.js';

async function temporary(run: (root: string) => Promise<void>) {
  const base = path.resolve('.ai/local/test-data');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, 'run-'));
  try {
    await run(root);
  } finally {
    new CacheCoordinator(root).close();
    await rm(root, { recursive: true, force: true });
  }
}

test('restart restores last position; rereading cannot reduce furthest progress; unopened chapters stay unread', async () =>
  temporary(async (root) => {
    const service = new ReaderService(new FixtureSource(), root);
    const chapter = await service.chapter('fixture-mist/1');
    const end = chapter.blocks.at(-1);
    const start = chapter.blocks[0];
    assert.ok(end && start);
    await service.record({
      chapterId: chapter.id,
      revision: chapter.revision,
      last: { blockId: end.id, fraction: 1 },
      atEnd: true,
    });
    await service.record({
      chapterId: chapter.id,
      revision: chapter.revision,
      last: { blockId: start.id, fraction: 0 },
      atEnd: false,
    });
    const nextProcess = new ReaderService(new FixtureSource(), root);
    const state = (await nextProcess.snapshot()).state;
    assert.equal(state.records[chapter.id]?.complete, true);
    assert.equal(state.records[chapter.id]?.last.blockId, start.id);
    assert.equal(Object.keys(state.records).length, 1);
    assert.ok((state.records[chapter.id]?.furthestWords ?? 0) > 0);
    await nextProcess.call('reader_clear_cache', { scope: 'all' });
    assert.deepEqual(
      (await nextProcess.snapshot()).state.records,
      state.records,
    );
  }));

test('serialized updates retain concurrent chapter records', async () =>
  temporary(async (root) => {
    const service = new ReaderService(new FixtureSource(), root);
    await Promise.all(
      ['fixture-mist/1', 'fixture-mist/3'].map(async (chapterId) => {
        const chapter = await service.chapter(chapterId);
        await service.record({
          chapterId,
          revision: chapter.revision,
          last: { blockId: 'report', fraction: 0.5 },
          atEnd: false,
        });
      }),
    );
    const state = (await service.snapshot()).state;
    assert.equal(Object.keys(state.records).length, 2);
    assert.equal(state.records['fixture-mist/2'], undefined);
  }));

test('cache expiry uses last access; corrupt or expired content is replaceable', async () =>
  temporary(async (root) => {
    let now = 1_000_000;
    const cache = new ContentCache(root, () => now);
    const chapter = await new FixtureSource().chapter('fixture-mist/1');
    await cache.put(chapter);
    now += 6 * 86_400_000;
    assert.ok(await cache.get(chapter.id, 7));
    now += 6 * 86_400_000;
    assert.ok(await cache.get(chapter.id, 7));
    now += 8 * 86_400_000;
    assert.equal(await cache.get(chapter.id, 7), null);
  }));

test('available cache survives source outage; explicit refresh reports network failure and retains cache', async () =>
  temporary(async (root) => {
    const source = new FixtureSource();
    await new ReaderService(source, root).chapter('fixture-mist/1');
    const offline: StorySource = {
      label: 'offline',
      catalog: () => source.catalog(),
      chapter: async () => {
        throw new ReaderError('network', '源站不可达，请重试。');
      },
    };
    const service = new ReaderService(offline, root);
    assert.equal(
      (await service.chapter('fixture-mist/1')).id,
      'fixture-mist/1',
    );
    await assert.rejects(
      () => service.chapter('fixture-mist/1', true),
      /源站不可达/,
    );
    assert.equal(
      (await service.chapter('fixture-mist/1')).id,
      'fixture-mist/1',
    );
  }));

test('invalid persistent records fail visibly without silently resetting the original file', async () =>
  temporary(async (root) => {
    const file = path.join(root, 'reading/state.json');
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, '{broken');
    await assert.rejects(() => new ReadingStore(root).read(), /原文件已保留/);
    assert.equal(await readFile(file, 'utf8'), '{broken');
  }));

test('saving without a validated local index never fetches a chapter, including legacy records after content clearing', async () =>
  temporary(async (root) => {
    let downloads = 0;
    const fixture = new FixtureSource();
    const service = new ReaderService(
      {
        label: fixture.label,
        catalog: () => fixture.catalog(),
        chapter: async (id) => {
          downloads++;
          return fixture.chapter(id);
        },
      },
      root,
    );
    const input = {
      chapterId: 'fixture-mist/1',
      revision: 'original-fixture-v1',
      last: { blockId: 'report', fraction: 0.5 },
      atEnd: false,
    };
    await assert.rejects(() => service.record(input), /缺少可验证/u);
    await service.records.change((state) => ({
      ...state,
      records: {
        [input.chapterId]: {
          chapterId: input.chapterId,
          storyId: 'fixture-mist',
          revision: input.revision,
          last: input.last,
          furthestWords: 100,
          complete: false,
          updatedAt: '2026-11-01T00:00:00.000Z',
        },
      },
    }));
    const original = await service.records.read();
    await service.call('reader_clear_cache', { scope: 'all' });
    await assert.rejects(() => service.record(input), /缺少可验证/u);
    assert.equal(downloads, 0);
    assert.deepEqual(await service.records.read(), original);
  }));

test('legacy JSON migrates once without deleting its original or rolling back later database changes', async () =>
  temporary(async (root) => {
    const file = path.join(root, 'reading/state.json');
    await mkdir(path.dirname(file), { recursive: true });
    const legacy = initialState();
    legacy.settings.retentionDays = 14;
    await writeFile(file, JSON.stringify(legacy));
    const store = new ReadingStore(root);
    assert.equal((await store.read()).settings.retentionDays, 14);
    await store.change((state) => ({
      ...state,
      settings: { ...state.settings, retentionDays: 30 },
    }));
    assert.equal(
      (await new ReadingStore(root).read()).settings.retentionDays,
      30,
    );
    assert.equal(
      JSON.parse(await readFile(file, 'utf8')).settings.retentionDays,
      14,
    );
  }));
