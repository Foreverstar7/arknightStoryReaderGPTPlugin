import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BrowserDemoTransport,
  DEMO_STORAGE_KEY,
} from '../website/demo/browser-transport.js';
import { FixtureSource } from '../src/data/fixture.js';
import {
  blockWords,
  chapterWords,
  storyProgress,
} from '../src/domain/reading.js';

function storage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

test('browser demo presets use real fixture word weights and are isolated from unrelated storage', async () => {
  const saved = storage();
  saved.setItem('unrelated-records', 'leave this alone');
  const demo = await BrowserDemoTransport.create(saved);
  const snapshot = await demo.call('reader_snapshot', {});
  assert.equal(
    snapshot.stories.every((story) => story.source === 'fixture'),
    true,
  );
  assert.deepEqual(
    snapshot.stories
      .filter((story) => ['fixture-mist', 'fixture-lights'].includes(story.id))
      .map((story) => storyProgress(story, snapshot.state.records)),
    [40, 32],
  );
  assert.equal(snapshot.state.recentChapterId, 'fixture-mist/3');
  assert.equal(saved.getItem('unrelated-records'), 'leave this alone');
  assert.equal(saved.values.size, 2);
});

test('opening/preparing never marks a chapter read; rewind preserves furthest while reload preserves last', async () => {
  const saved = storage();
  const demo = await BrowserDemoTransport.create(saved);
  const chapter = await demo.call('reader_chapter', {
    chapterId: 'fixture-road/1',
  });
  const count = await demo.call('reader_prepare_chapter', {
    chapterId: chapter.id,
  });
  assert.equal(count.wordCount, chapterWords(chapter));
  assert.equal(
    (await demo.call('reader_snapshot', {})).state.records[chapter.id],
    undefined,
  );
  const second = chapter.blocks[1];
  const first = chapter.blocks[0];
  assert.ok(second && first);
  const input = {
    chapterId: chapter.id,
    revision: chapter.revision,
    historyToken: chapter.historyToken,
    atEnd: false,
  };
  await demo.call('reader_record', {
    ...input,
    last: { blockId: second.id, fraction: 0.5 },
  });
  await demo.call('reader_record', {
    ...input,
    last: { blockId: first.id, fraction: 0 },
  });
  const record = (
    await (await BrowserDemoTransport.create(saved)).call('reader_snapshot', {})
  ).state.records[chapter.id];
  assert.equal(
    record?.furthestWords,
    blockWords(first) + Math.floor(blockWords(second) * 0.5),
  );
  assert.deepEqual(record?.last, { blockId: first.id, fraction: 0 });
  assert.equal(record?.complete, false);
});

test('only the actual body end completes a chapter, and changing preferences/clearing cache keeps records', async () => {
  const demo = await BrowserDemoTransport.create(storage());
  const chapter = await demo.call('reader_chapter', {
    chapterId: 'fixture-road/1',
  });
  const first = chapter.blocks[0];
  const last = chapter.blocks.at(-1);
  assert.ok(first && last);
  const input = {
    chapterId: chapter.id,
    revision: chapter.revision,
    historyToken: chapter.historyToken,
    atEnd: true,
  };
  const early = await demo.call('reader_record', {
    ...input,
    last: { blockId: first.id, fraction: 1 },
  });
  assert.equal(early.records[chapter.id]?.complete, false);
  const completed = await demo.call('reader_record', {
    ...input,
    last: { blockId: last.id, fraction: 1 },
  });
  await demo.call('reader_settings', {
    theme: 'dark',
    retentionDays: 7,
    autoImages: false,
  });
  await demo.call('reader_clear_cache', { scope: 'all' });
  const state = (await demo.call('reader_snapshot', {})).state;
  assert.deepEqual(state.records, completed.records);
  assert.equal(state.settings.theme, 'dark');
  assert.equal(state.records[chapter.id]?.complete, true);
});

test('scoped clear preserves other samples and fences delayed saves from an old open', async () => {
  const demo = await BrowserDemoTransport.create(storage());
  const chapter = await demo.call('reader_chapter', {
    chapterId: 'fixture-mist/3',
  });
  const state = await demo.call('reader_clear_history', {
    storyId: 'fixture-mist',
  });
  assert.ok(state.records['fixture-lights/1']);
  assert.equal(
    Object.values(state.records).some(
      (record) => record.storyId === 'fixture-mist',
    ),
    false,
  );
  assert.equal(state.recentChapterId, 'fixture-lights/1');
  await assert.rejects(
    demo.call('reader_record', {
      chapterId: chapter.id,
      revision: chapter.revision,
      historyToken: chapter.historyToken,
      last: { blockId: 'arrival', fraction: 0 },
      atEnd: false,
    }),
    /已清除/u,
  );
  const opened = await demo.call('reader_chapter', { chapterId: chapter.id });
  await demo.call('reader_record', {
    chapterId: opened.id,
    revision: opened.revision,
    historyToken: opened.historyToken,
    last: { blockId: 'arrival', fraction: 0 },
    atEnd: false,
  });
});

test('malformed storage and denied writes are explicit errors, never a silent in-memory fallback', async () => {
  const saved = storage();
  saved.setItem(DEMO_STORAGE_KEY, '{broken');
  await assert.rejects(BrowserDemoTransport.create(saved), /无法读取/u);
  assert.equal(saved.getItem(DEMO_STORAGE_KEY), '{broken');
  const denied = {
    getItem: () => null,
    setItem: () => {
      throw new Error('denied');
    },
    removeItem: () => undefined,
  };
  await assert.rejects(BrowserDemoTransport.create(denied), /无法读取/u);
});

test('sample chapters and unknown IDs remain the real fixture contract', async () => {
  const demo = await BrowserDemoTransport.create(storage());
  const chapter = await demo.call('reader_chapter', {
    chapterId: 'fixture-road/1',
  });
  const fixture = await new FixtureSource().chapter(chapter.id);
  assert.deepEqual(chapter.blocks, fixture.blocks);
  await assert.rejects(
    demo.call('reader_chapter', { chapterId: 'prts-real-story' }),
    /未找到/u,
  );
  await assert.rejects(
    demo.call('reader_image', { kind: 'cover', storyId: 'fixture-road' }),
    /没有游戏图片/u,
  );
});

test('initial seeding is one atomic storage write and a failed save keeps the prior reading state', async () => {
  const saved = storage();
  let writes = 0;
  let fail = false;
  const demo = await BrowserDemoTransport.create({
    ...saved,
    setItem(key, value) {
      writes++;
      if (fail) throw new Error('Quota exceeded');
      saved.setItem(key, value);
    },
  });
  assert.equal(writes, 1);
  const before = await demo.call('reader_snapshot', {});
  const chapter = await demo.call('reader_chapter', {
    chapterId: 'fixture-road/1',
  });
  fail = true;
  await assert.rejects(
    demo.call('reader_record', {
      chapterId: chapter.id,
      revision: chapter.revision,
      historyToken: chapter.historyToken,
      last: { blockId: 'arrival', fraction: 0.5 },
      atEnd: false,
    }),
    /未能保存/u,
  );
  assert.deepEqual(
    (await demo.call('reader_snapshot', {})).state,
    before.state,
  );
});
