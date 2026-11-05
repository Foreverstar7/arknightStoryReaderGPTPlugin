import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { FixtureSource } from '../src/data/fixture.js';
import { ReaderError } from '../src/data/source.js';
import { ReaderService } from '../src/server/service.js';
import { CacheCoordinator } from '../src/storage/cache-coordinator.js';
import { chapterWords, storyProgress } from '../src/domain/reading.js';
import { applyChapterCount, mergeStoryCounts } from '../src/ui/story-counts.js';
import type { Chapter } from '../src/shared/contracts.js';
import { deferred } from './helpers/deferred.js';

async function setup() {
  const base = path.resolve('.ai/local/preparation-tests');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, 'counts-'));
  const fixture = new FixtureSource();
  const catalog = async () =>
    (await fixture.catalog()).map((story) => ({
      ...story,
      chapters: story.chapters.map((chapter) => ({
        ...chapter,
        wordCount: null,
      })),
    }));
  return {
    root,
    fixture,
    catalog,
    close: async () => {
      new CacheCoordinator(root).close();
      await rm(root, { recursive: true, force: true });
    },
  };
}

test('story text prefetch supplies a durable complete denominator without reading, images, other stories, or history/cache coupling', async () => {
  const ctx = await setup();
  const fetched: string[] = [];
  let offline = false;
  const source = {
    label: 'isolated original fixture',
    catalog: ctx.catalog,
    chapter: async (id: string) => {
      fetched.push(id);
      if (offline) throw new ReaderError('network', 'offline');
      return ctx.fixture.chapter(id);
    },
    image: async () => {
      throw new Error('Prefetch must not ask for images');
    },
  };
  let service = new ReaderService(source, ctx.root);
  try {
    const before = await service.records.read();
    const story = (await service.snapshot()).stories[0];
    assert.ok(story);
    for (const meta of story.chapters) await service.prepareChapter(meta.id);
    assert.deepEqual(
      fetched,
      story.chapters.map((chapter) => chapter.id),
    );
    assert.deepEqual(await service.records.read(), before);
    const prepared = (await service.snapshot()).stories[0];
    assert.ok(prepared);
    assert.equal(storyProgress(prepared, before.records), 0);
    for (const meta of prepared.chapters) {
      assert.equal(
        meta.wordCount,
        chapterWords(await ctx.fixture.chapter(meta.id)),
      );
      assert.ok(await service.cache.get(meta.id, 7));
    }
    offline = true;
    service = new ReaderService(source, ctx.root);
    await service.prepareChapter(story.chapters[0]?.id ?? '');
    assert.equal(fetched.length, story.chapters.length);
    await service.call('reader_clear_cache', { scope: 'all' });
    const afterClear = await service.snapshot();
    assert.deepEqual(afterClear.stories, (await service.snapshot()).stories);
    assert.equal(
      afterClear.stories[0]?.chapters[0]?.wordCount,
      prepared.chapters[0]?.wordCount,
    );
    assert.equal(await service.cache.get(story.chapters[0]?.id ?? '', 7), null);
    assert.deepEqual(afterClear.state, before);
    await service.call('reader_clear_history', {});
    assert.deepEqual((await service.snapshot()).stories, afterClear.stories);
  } finally {
    await ctx.close();
  }
});

test('failed chapter is never counted as zero; retry fills only missing body and leaves unread chapters unread', async () => {
  const ctx = await setup();
  let fail = true;
  const fetched: string[] = [];
  const source = {
    label: ctx.fixture.label,
    catalog: ctx.catalog,
    chapter: async (id: string) => {
      fetched.push(id);
      if (fail && id === 'fixture-mist/2')
        throw new ReaderError('network', 'isolated failure');
      return ctx.fixture.chapter(id);
    },
  };
  const service = new ReaderService(source, ctx.root);
  try {
    const story = (await ctx.catalog())[0];
    assert.ok(story);
    for (const chapter of story.chapters) {
      if (chapter.id === 'fixture-mist/2')
        await assert.rejects(
          service.prepareChapter(chapter.id),
          /isolated failure/,
        );
      else await service.prepareChapter(chapter.id);
    }
    const chapter = await service.chapter('fixture-mist/1');
    const end = chapter.blocks.at(-1);
    assert.ok(end);
    const state = await service.record({
      chapterId: chapter.id,
      revision: chapter.revision,
      last: { blockId: end.id, fraction: 1 },
      atEnd: true,
    });
    const partial = (await service.snapshot()).stories[0];
    assert.ok(partial);
    assert.equal(storyProgress(partial, state.records), null);
    fail = false;
    const beforeRetry = fetched.length;
    for (const chapter of story.chapters)
      await service.prepareChapter(chapter.id);
    assert.deepEqual(fetched.slice(beforeRetry), ['fixture-mist/2']);
    const complete = (await service.snapshot()).stories[0];
    assert.ok(complete);
    const total = complete.chapters.reduce(
      (sum, chapter) => sum + (chapter.wordCount ?? 0),
      0,
    );
    assert.equal(
      storyProgress(complete, state.records),
      Math.floor((chapterWords(chapter) / total) * 100),
    );
    assert.deepEqual(Object.keys((await service.records.read()).records), [
      'fixture-mist/1',
    ]);
  } finally {
    await ctx.close();
  }
});

test('prefetch of a revised chapter preserves reading state and defers migration until actual open', async () => {
  const ctx = await setup();
  let current = await ctx.fixture.chapter('fixture-mist/1');
  const service = new ReaderService(
    {
      label: ctx.fixture.label,
      catalog: ctx.catalog,
      chapter: async (id) =>
        id === current.id ? structuredClone(current) : ctx.fixture.chapter(id),
    },
    ctx.root,
  );
  try {
    const first = await service.chapter(current.id);
    const end = first.blocks.at(-1);
    assert.ok(end);
    await service.record({
      chapterId: first.id,
      revision: first.revision,
      last: { blockId: end.id, fraction: 1 },
      atEnd: true,
    });
    const before = await service.records.read();
    await service.call('reader_clear_cache', { scope: 'all' });
    current = {
      ...current,
      revision: 'new-body',
      blocks: [
        ...current.blocks,
        { id: 'added', kind: 'narration', text: '新加入的段落。' },
      ],
    };
    await service.prepareChapter(current.id);
    assert.deepEqual(await service.records.read(), before);
    const story = (await service.snapshot()).stories[0];
    assert.ok(story);
    assert.equal(storyProgress(story, before.records), null);
    await service.chapter(current.id);
    const after = await service.records.read();
    assert.equal(after.records[current.id]?.revision, 'new-body');
    assert.equal(after.records[current.id]?.complete, false);
    assert.equal(after.recentChapterId, before.recentChapterId);
    assert.equal(
      after.records[current.id]?.updatedAt,
      before.records[current.id]?.updatedAt,
    );
  } finally {
    await ctx.close();
  }
});

test('late prefetch cannot replace refreshed counts or refill a cleared cache', async () => {
  const ctx = await setup();
  const original = await ctx.fixture.chapter('fixture-mist/1');
  let resolve: (chapter: Chapter) => void = () => {};
  let started: () => void = () => {};
  let ready = new Promise<void>((r) => {
    started = r;
  });
  let delayed = true;
  const current = {
    ...original,
    revision: 'new-version',
    blocks: [
      ...original.blocks,
      { id: 'new', kind: 'narration' as const, text: '追加正文' },
    ],
  };
  const source = {
    label: ctx.fixture.label,
    catalog: ctx.catalog,
    chapter: async () => {
      if (!delayed) return current;
      started();
      return new Promise<Chapter>((r) => {
        resolve = r;
      });
    },
  };
  const service = new ReaderService(source, ctx.root);
  try {
    const pending = service.prepareChapter(original.id);
    await ready;
    delayed = false;
    await service.chapter(original.id, true);
    resolve(original);
    await assert.rejects(pending, /另一窗口已更新本篇字数/);
    assert.equal(
      (await service.cache.get(original.id, 7))?.revision,
      current.revision,
    );
    await service.call('reader_clear_cache', { scope: 'all' });
    delayed = true;
    ready = new Promise<void>((r) => {
      started = r;
    });
    const clearing = service.prepareChapter(original.id);
    await ready;
    await service.call('reader_clear_cache', { scope: 'all' });
    resolve(current);
    await assert.rejects(clearing, /内容缓存已在另一操作中清理/);
    assert.equal(await service.cache.get(original.id, 7), null);
  } finally {
    await ctx.close();
  }
});

test('late UI snapshots and count responses retain newer per-chapter totals', async () => {
  const ctx = await setup();
  try {
    const stories = await ctx.catalog();
    const newer = applyChapterCount(stories, {
      chapterId: 'fixture-mist/1',
      storyId: 'fixture-mist',
      revision: 'new',
      wordCount: 500,
      verifiedAt: 200,
    });
    const stale = applyChapterCount(newer, {
      chapterId: 'fixture-mist/1',
      storyId: 'fixture-mist',
      revision: 'old',
      wordCount: 100,
      verifiedAt: 100,
    });
    assert.deepEqual(stale, newer);
    assert.deepEqual(mergeStoryCounts(stories, newer), newer);
  } finally {
    await ctx.close();
  }
});

test('invalid bodies preserve cached text, public counts and records in both preparation and opening', async () => {
  const ctx = await setup();
  const original = await ctx.fixture.chapter('fixture-mist/1');
  let response = original;
  const service = new ReaderService(
    {
      label: ctx.fixture.label,
      catalog: ctx.catalog,
      chapter: async () => response,
    },
    ctx.root,
  );
  try {
    await service.chapter(original.id);
    const before = await service.snapshot();
    for (const invalid of [
      { ...original, id: 'wrong-chapter' },
      { ...original, blocks: [] },
    ]) {
      response = invalid;
      await assert.rejects(service.chapter(original.id, true), {
        code: 'parse',
      });
      assert.deepEqual(await service.snapshot(), before);
      assert.deepEqual(await service.cache.get(original.id, 7), original);
      await service.call('reader_clear_cache', { scope: 'all' });
      await assert.rejects(service.prepareChapter(original.id), {
        code: 'parse',
        message: '来源正文不完整，未将缺失篇目计为零字数。',
      });
      assert.deepEqual(await service.snapshot(), before);
      assert.equal(await service.cache.get(original.id, 7), null);
      await service.cache.put(original);
    }
  } finally {
    await ctx.close();
  }
});

test('opening rejected by a history clear keeps the previous body until a new open succeeds', async () => {
  const ctx = await setup();
  const original = await ctx.fixture.chapter('fixture-mist/1');
  const changed = { ...original, revision: 'after-clear' };
  const started = deferred();
  const release = deferred();
  const service = new ReaderService(
    {
      label: ctx.fixture.label,
      catalog: ctx.catalog,
      chapter: async () => {
        started.resolve();
        await release.promise;
        return changed;
      },
    },
    ctx.root,
  );
  try {
    await service.cache.put(original);
    const first = await service.chapter(original.id);
    const pending = service.chapter(original.id, true);
    await started.promise;
    const cleared = await service.call('reader_clear_history', {});
    release.resolve();
    await assert.rejects(pending, {
      code: 'conflict',
      message: '阅读记录已清除，请重新打开篇目后继续。',
    });
    assert.deepEqual(await service.cache.get(original.id, 7), original);
    assert.deepEqual(await service.records.read(), cleared);
    const reopened = await service.chapter(original.id);
    assert.equal(reopened.revision, changed.revision);
    assert.notEqual(reopened.historyToken, first.historyToken);
    assert.equal(
      (await service.cache.get(original.id, 7))?.revision,
      changed.revision,
    );
  } finally {
    release.resolve();
    await ctx.close();
  }
});
