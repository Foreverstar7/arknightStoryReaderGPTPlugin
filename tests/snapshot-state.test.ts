import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FixtureSource } from '../src/data/fixture.js';
import { initialState, type Snapshot } from '../src/shared/contracts.js';
import { readerSnapshotReducer as reduce } from '../src/ui/snapshot-state.js';

async function snapshot(): Promise<Snapshot> {
  return {
    stories: await new FixtureSource().catalog(),
    state: initialState(),
    sourceLabel: 'original fixture',
  };
}

test('late public refresh and navigation snapshots retain their separate authorities', async () => {
  const original = await snapshot();
  const first = original.stories[0];
  assert.ok(first);
  const fresh = {
    ...original,
    stories: [
      {
        ...first,
        title: '更新目录名称',
        chapters: [
          ...first.chapters,
          { id: 'new', code: 'new', title: '新增篇目', wordCount: null },
        ],
      },
    ],
  };
  const saved = {
    ...original.state,
    recentChapterId: 'fixture-mist/1',
    records: {
      'fixture-mist/1': {
        chapterId: 'fixture-mist/1',
        storyId: 'fixture-mist',
        revision: 'fixture-v1',
        last: { blockId: 'report', fraction: 0.4 },
        furthestWords: 100,
        complete: false,
        updatedAt: '2026-11-05T00:00:00.000Z',
      },
    },
  };
  const changed = reduce(original, { type: 'reading', state: saved });
  const refreshed = reduce(changed, { type: 'catalog', data: fresh });
  assert.equal(refreshed?.state, saved);
  assert.deepEqual(refreshed?.stories, fresh.stories);
  // A delayed ordinary snapshot can bring newer private state, but cannot
  // resurrect a removed story or remove the newly added unknown denominator.
  const dark = {
    ...saved,
    settings: { ...saved.settings, theme: 'dark' as const },
  };
  const navigated = reduce(refreshed, {
    type: 'snapshot',
    data: { ...original, state: dark },
  });
  assert.equal(navigated?.state, dark);
  assert.deepEqual(navigated?.stories, fresh.stories);
  const cleared = {
    ...dark,
    records: {},
    recentChapterId: null,
    historyEpoch: 1,
  };
  const afterClear = reduce(navigated, { type: 'reading', state: cleared });
  const lateRefresh = reduce(afterClear, { type: 'catalog', data: fresh });
  assert.equal(lateRefresh?.state, cleared);
  assert.equal(lateRefresh?.stories[0]?.chapters.at(-1)?.wordCount, null);
});

test('both startup response orders retain verified counts through later snapshots and ignore foreign counts', async () => {
  const cached = await snapshot();
  const first = cached.stories[0];
  const chapter = first?.chapters[0];
  assert.ok(first && chapter);
  const fresh = { ...cached, stories: [{ ...first, title: '新目录' }] };
  const count = {
    storyId: first.id,
    chapterId: chapter.id,
    revision: 'new-text',
    wordCount: 500,
    verifiedAt: 200,
  };
  for (const order of ['cached-first', 'fresh-first']) {
    let current =
      order === 'cached-first'
        ? reduce(reduce(null, { type: 'initialize', data: cached }), {
            type: 'catalog',
            data: fresh,
          })
        : reduce(reduce(null, { type: 'catalog', data: fresh }), {
            type: 'initialize',
            data: cached,
          });
    current = reduce(current, { type: 'count', count });
    const verified = current;
    current = reduce(current, {
      type: 'count',
      count: { ...count, revision: 'old-text', wordCount: 50, verifiedAt: 100 },
    });
    current = reduce(current, { type: 'snapshot', data: cached });
    current = reduce(current, { type: 'catalog', data: fresh });
    current = reduce(current, {
      type: 'count',
      count: { ...count, storyId: 'foreign', wordCount: 999 },
    });
    assert.deepEqual(current, verified);
    assert.equal(current?.stories[0]?.title, '新目录');
    assert.equal(current?.stories[0]?.chapters[0]?.wordCount, 500);
  }
});
