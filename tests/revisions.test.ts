import { CacheCoordinator } from '../src/storage/cache-coordinator.js';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import {
  migrateRecord,
  readingLayout,
  wordsAt,
} from '../src/domain/revisions.js';
import { chapterProgress } from '../src/domain/reading.js';
import type { Block, Chapter, ReadingRecord } from '../src/shared/contracts.js';
import { ReaderService } from '../src/server/service.js';
import { ReaderError } from '../src/data/source.js';

const chapter = (revision: string, blocks: Block[]): Chapter => ({
  id: 'original/1',
  storyId: 'original',
  title: '原创修订样例',
  source: 'fixture',
  revision,
  blocks,
});
const lines = (prefix = ''): Block[] =>
  ['初始记录。', '站台上的回信。', '钟楼的消息。', '旅程暂告结束。'].map(
    (text, index) => ({ id: `${prefix}${index}`, kind: 'narration', text }),
  );
function record(body: Chapter): ReadingRecord {
  const layout = readingLayout(body);
  const last = { blockId: body.blocks[1]?.id ?? '', fraction: 0.4 };
  const furthest = { blockId: body.blocks.at(-1)?.id ?? '', fraction: 0.6 };
  return {
    chapterId: body.id,
    storyId: body.storyId,
    revision: body.revision,
    last,
    furthest,
    layout,
    totalWords: layout.totalWords,
    furthestWords: wordsAt(layout, furthest),
    complete: false,
    updatedAt: '2026-11-01T00:00:00.000Z',
  };
}

test('revision migration independently relocates last/furthest by full body fingerprints and retains original history ordering', () => {
  const old = chapter('v1', lines());
  const previous = record(old);
  const next = readingLayout(
    chapter('v2', [
      { id: 'insert', kind: 'narration', text: '新增序言。' },
      ...lines('new-'),
    ]),
  );
  const migrated = migrateRecord(previous, next);
  assert.deepEqual(migrated.last, { blockId: 'new-1', fraction: 0.4 });
  assert.deepEqual(migrated.furthest, { blockId: 'new-3', fraction: 0.6 });
  assert.equal(
    migrated.furthestWords,
    wordsAt(next, migrated.furthest ?? migrated.last),
  );
  assert.equal(migrated.updatedAt, previous.updatedAt);
  assert.equal(
    migrated.migration?.previous.furthestWords,
    previous.furthestWords,
  );
  assert.equal(migrated.progressKnown, true);
});

test('changed later speech paragraphs and repeated occurrence IDs never masquerade as unchanged anchors', () => {
  const old = chapter('v1', [
    lines()[0] ?? { id: 'a', kind: 'narration', text: '前言' },
    {
      id: 'speech',
      kind: 'speech',
      name: '记录员',
      paragraphs: ['开头相同。', '旧的后续。'],
    },
    ...lines().slice(2),
  ]);
  const previous = record(old);
  const changed = structuredClone(old);
  changed.revision = 'v2';
  changed.blocks[1] = {
    id: 'speech',
    kind: 'speech',
    name: '记录员',
    paragraphs: ['开头相同。', '改写了后续的正文。'],
  };
  const migrated = migrateRecord(previous, readingLayout(changed));
  assert.deepEqual(migrated.last, { blockId: '0', fraction: 1 });
  assert.equal(migrated.migration?.position, 'preceding');
  const repeated = chapter('r1', [
    { id: 'a', kind: 'narration', text: '唯一前言' },
    { id: 'repeat-1', kind: 'narration', text: '重复句' },
    { id: 'repeat-2', kind: 'narration', text: '重复句' },
  ]);
  const saved = {
    ...record(repeated),
    last: { blockId: 'repeat-2', fraction: 0.5 },
  };
  const more = chapter('r2', [
    { id: 'repeat-1', kind: 'narration', text: '重复句' },
    ...repeated.blocks.map((block) => ({
      ...block,
      id: `${block.id}-shifted`,
    })),
  ]);
  assert.deepEqual(migrateRecord(saved, readingLayout(more)).last, {
    blockId: 'a-shifted',
    fraction: 1,
  });
});

test('appended or rewritten body needs a new end observation; deletion and scene-only revisions retain completed progress', () => {
  const original = chapter('v1', lines());
  const previous = {
    ...record(original),
    complete: true,
    furthestWords: readingLayout(original).totalWords,
    furthest: { blockId: '3', fraction: 1 },
  };
  const appended = migrateRecord(
    previous,
    readingLayout(
      chapter('v2', [
        ...lines(),
        { id: 'append', kind: 'narration', text: '尚未读过的后记。' },
      ]),
    ),
  );
  assert.equal(appended.complete, false);
  assert.equal(appended.furthest?.blockId, '3');
  assert.ok(appended.furthestWords < (appended.totalWords ?? 0));
  assert.equal(
    migrateRecord(previous, readingLayout(chapter('v3', lines().slice(1))))
      .complete,
    true,
  );
  assert.equal(
    migrateRecord(previous, readingLayout(chapter('v4', lines()))).complete,
    true,
  );
});

test('legacy records use matching old cached layouts; absent/fully replaced source stays explicitly unknown with the old record retained', () => {
  const old = chapter('v1', lines());
  const legacy = record(old);
  delete legacy.layout;
  delete legacy.furthest;
  const next = readingLayout(chapter('v2', lines('changed-id')));
  assert.equal(
    migrateRecord(legacy, next, readingLayout(old)).last.blockId,
    'changed-id1',
  );
  const unknown = migrateRecord(legacy, next);
  assert.equal(unknown.progressKnown, false);
  assert.equal(unknown.migration?.previous.complete, legacy.complete);
  assert.deepEqual(unknown.migration?.previous.last, legacy.last);
  assert.equal(unknown.migration?.position, 'start');
  const story = {
    id: 'original',
    title: '原创',
    type: '原创',
    category: '原创',
    coverLabel: '原创',
    source: 'fixture' as const,
    chapters: [
      { id: old.id, title: old.title, code: '1', wordCount: next.totalWords },
    ],
  };
  assert.equal(chapterProgress(story, old.id, { [old.id]: unknown }), null);
});

test('refresh migrates only this chapter; stale windows/fetches cannot overwrite a newer revision and post-clear saves need no source', async () => {
  const base = path.resolve('.ai/local/test-data');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, 'revision-'));
  try {
    let current = chapter('v1', lines());
    let fetches = 0;
    const source = {
      label: '原创修订测试',
      catalog: async () => [],
      chapter: async () => {
        fetches++;
        return structuredClone(current);
      },
    };
    const first = new ReaderService(source, root);
    const old = await first.chapter(current.id);
    await first.record({
      chapterId: old.id,
      revision: old.revision,
      last: { blockId: '3', fraction: 0.8 },
      atEnd: false,
    });
    await first.record({
      chapterId: old.id,
      revision: old.revision,
      last: { blockId: '1', fraction: 0.4 },
      atEnd: false,
    });
    const other = new ReaderService(source, root);
    await other.chapter(old.id);
    current = chapter('v2', [
      { id: 'new', kind: 'narration', text: '新的前言。' },
      ...lines(),
    ]);
    await first.chapter(old.id, true);
    const migrated = await first.records.read();
    assert.equal(migrated.records[old.id]?.last.blockId, '1');
    assert.equal(migrated.records[old.id]?.furthest?.blockId, '3');
    await assert.rejects(
      () =>
        other.record({
          chapterId: old.id,
          revision: old.revision,
          last: { blockId: '0', fraction: 0 },
          atEnd: false,
        }),
      (error: unknown) =>
        error instanceof ReaderError && error.code === 'conflict',
    );
    assert.deepEqual(await first.records.read(), migrated);
    await other.call('reader_clear_cache', { scope: 'all' });
    const restarted = new ReaderService(
      {
        ...source,
        chapter: async () => {
          throw new Error('must not fetch');
        },
      },
      root,
    );
    await restarted.record({
      chapterId: old.id,
      revision: 'v2',
      last: { blockId: '1', fraction: 0 },
      atEnd: false,
    });
    assert.equal(fetches, 2);
    assert.equal(
      (await restarted.records.read()).records[old.id]?.furthest?.blockId,
      '3',
    );
    // Simulate a response for v2 arriving after a separate reader accepted v3.
    let release = () => {};
    let started = () => {};
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const slow = new ReaderService(
      {
        ...source,
        chapter: async () => {
          started();
          await gate;
          return current;
        },
      },
      root,
    );
    const pending = slow.chapter(old.id, true);
    await ready;
    await new ReaderService(
      { ...source, chapter: async () => chapter('v3', lines()) },
      root,
    ).chapter(old.id, true);
    release();
    await assert.rejects(pending, /未覆盖较新的记录/u);
    assert.equal((await first.records.read()).records[old.id]?.revision, 'v3');
    assert.equal((await first.cache.get(old.id, 7))?.revision, 'v3');
  } finally {
    new CacheCoordinator(root).close();
    await rm(root, { recursive: true, force: true });
  }
});
