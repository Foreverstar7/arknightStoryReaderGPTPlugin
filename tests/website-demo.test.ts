import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { imageSize } from 'image-size';
import {
  BrowserDemoTransport,
  DEMO_STORAGE_KEY,
} from '../website/demo/browser-transport.js';
import { WebsiteDemoSource } from '../website/demo/data.js';
import type { DemoImageLoader } from '../website/demo/assets.js';
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

test('preset story search and directory intro use only demo metadata and preserve stored reading records', async () => {
  const saved = storage();
  const demo = await BrowserDemoTransport.create(saved);
  const before = saved.getItem(DEMO_STORAGE_KEY);
  const result = await demo.call('reader_search', {
    by: 'story',
    queries: ['孤星'],
  });
  assert.equal(result.total, 1);
  assert.equal(result.results[0]?.id, 'fixture-mist');
  assert.equal('summary' in (result.results[0] ?? {}), false);
  assert.ok(
    (
      await demo.call('reader_story_info', { storyId: 'fixture-mist' })
    ).summary?.includes('不对应原作剧情'),
  );
  assert.equal(saved.getItem(DEMO_STORAGE_KEY), before);
});

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

test('placeholder content stays separate from game content and only known image targets resolve', async () => {
  const demo = await BrowserDemoTransport.create(storage());
  const chapter = await demo.call('reader_chapter', {
    chapterId: 'fixture-road/1',
  });
  const source = new WebsiteDemoSource();
  assert.deepEqual(chapter.blocks, (await source.chapter(chapter.id)).blocks);
  assert.equal(chapter.imagesAvailable, true);
  assert.match(chapter.title, /占位符/u);
  await assert.rejects(
    demo.call('reader_chapter', { chapterId: 'prts-real-story' }),
    /未找到/u,
  );
  await assert.rejects(
    demo.call('reader_image', {
      kind: 'cg',
      chapterId: chapter.id,
      blockId: 'arrival',
    }),
    /没有对应图片/u,
  );
});

test('all six local covers, inline scenes and named/branch portraits load only when requested; anonymous names stay neutral', async () => {
  const loaded: string[] = [];
  const loader: DemoImageLoader = async (asset) => {
    loaded.push(asset.id);
    const bytes = await readFile(new URL(asset.url));
    const { width, height } = imageSize(bytes);
    return {
      width,
      height,
      dataUrl: `data:image/webp;base64,${bytes.toString('base64')}`,
    };
  };
  const demo = await BrowserDemoTransport.create(storage(), loader);
  const snapshot = await demo.call('reader_snapshot', {});
  assert.equal(snapshot.stories.length, 6);
  assert.deepEqual(loaded, []);
  for (const story of snapshot.stories) {
    if (story.id === 'fixture-mist') assert.equal(story.title, '孤星');
    else assert.match(story.title, /占位符/u);
    const cover = await demo.call('reader_image', {
      kind: 'cover',
      storyId: story.id,
    });
    assert.equal(cover.width, 1560);
    assert.equal(cover.height, 500);
    const layer = cover.layers[0];
    assert.ok(layer);
    assert.ok(layer.x >= 0 && layer.y >= 0);
    assert.ok(layer.x + layer.width <= cover.width);
    assert.ok(layer.y + layer.height <= cover.height);
    const scene = await demo.call('reader_image', {
      kind: 'cg',
      chapterId: `${story.id}/1`,
      blockId: 'city',
    });
    assert.equal(scene.resource, cover.resource);
    assert.equal(scene.sourceLabel, '演示素材原图');
  }
  for (const blockId of ['report', 'reply', 'tower', 'safety']) {
    const portrait = await demo.call('reader_image', {
      kind: 'portrait',
      chapterId: 'fixture-mist/1',
      blockId,
    });
    assert.equal(portrait.resource, 'website-demo:animal-rabbit');
    assert.equal(portrait.layers.length, 1);
  }
  const count = loaded.length;
  const anonymous = await demo.call('reader_image', {
    kind: 'portrait',
    chapterId: 'fixture-mist/1',
    blockId: 'anonymous',
  });
  assert.equal(anonymous.portrait?.status, 'placeholder');
  assert.deepEqual(anonymous.layers, []);
  assert.equal(loaded.length, count);
});

test('placeholder revision uses separate storage without overwriting the earlier demo', async () => {
  const saved = storage();
  saved.setItem('arknights-reader.website-demo.v1', 'earlier-demo-state');
  await BrowserDemoTransport.create(saved);
  assert.equal(
    saved.getItem('arknights-reader.website-demo.v1'),
    'earlier-demo-state',
  );
  assert.ok(saved.getItem(DEMO_STORAGE_KEY));
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
