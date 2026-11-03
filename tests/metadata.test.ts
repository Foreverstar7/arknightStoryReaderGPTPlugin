import { CacheCoordinator } from '../src/storage/cache-coordinator.js';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import {
  PrtsMetadata,
  parseActivityCover,
  parseAprilCover,
} from '../src/data/prts-metadata.js';
import { PrtsResources } from '../src/data/prts-resources.js';
import { ReaderError } from '../src/shared/errors.js';

const sourceUrl = 'https://prts.wiki/w/Original';
const activity =
  '{{活动信息|名称=原创测试|标题图文件名=原创题图.png|公告=[[原创/公告|公告]]}}';
const isCode = (code: ReaderError['code']) => (error: unknown) =>
  error instanceof ReaderError && error.code === code;
async function temporary(run: (root: string) => Promise<void>) {
  const base = path.resolve('.ai/local/test-data');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, 'metadata-'));
  try {
    await run(root);
  } finally {
    new CacheCoordinator(root).close();
    await rm(root, { recursive: true, force: true });
  }
}

test('only the activity title field supplies cover art, including inline fields and nested unrelated parameters', () => {
  assert.equal(
    parseActivityCover(activity, sourceUrl).filename,
    '原创题图.png',
  );
  const nested =
    '{{活动信息|公告={{引用|标题图文件名=不是封面.png}}|标题图文件名=真实字段.png}}';
  assert.equal(
    parseActivityCover(`<!--${activity}-->${nested}`, sourceUrl).filename,
    '真实字段.png',
  );
  for (const wiki of [
    '{{活动信息|名称=无标题图}}',
    '{{活动信息|标题图文件名= }}',
  ])
    assert.throws(
      () => parseActivityCover(wiki, sourceUrl),
      isCode('resource_missing'),
    );
  assert.throws(
    () => parseActivityCover('|标题图文件名=任意其他模板.png', sourceUrl),
    isCode('unsupported'),
  );
  for (const wiki of [
    '{{活动信息|标题图文件名=未闭合.png',
    '{{活动信息|标题图文件名={{动态文件名}}}}',
    '{{活动信息|标题图文件名=甲.png|标题图文件名=乙.png}}',
    activity + activity,
  ])
    assert.throws(() => parseActivityCover(wiki, sourceUrl), isCode('parse'));
  for (const ext of ['jpg', 'JPEG', 'png', 'WebP', 'gif'])
    assert.equal(
      parseActivityCover(`{{活动信息|标题图文件名=原始标题.${ext}}}`, sourceUrl)
        .filename,
      `原始标题.${ext}`,
    );
  assert.throws(
    () =>
      parseActivityCover('{{活动信息|标题图文件名=尚未支持.svg}}', sourceUrl),
    isCode('unsupported'),
  );
});

test('grouped names, redirect provenance and legacy empty/positive caches are revalidated without touching reading data', async () =>
  temporary(async (root) => {
    const calls: string[] = [];
    const wiki = async (title: string) => {
      calls.push(title);
      return title === '原创活动' ? '#REDIRECT [[原始活动页]]' : activity;
    };
    const metadata = new PrtsMetadata(root, wiki);
    await mkdir(path.join(root, 'reading'), { recursive: true });
    const record = path.join(root, 'reading', 'record-sentinel');
    await writeFile(record, '独立阅读记录');
    for (const old of [
      {},
      { filename: '旧版本.png' },
      {
        parserVersion: 2,
        filename: '旧PNG.png',
        sourceUrl,
        method: 'activity-title-field',
      },
    ]) {
      await metadata.cache.put('cover:原创活动', old);
      const cover = await metadata.cover(
        { title: '集成战略 · 原创活动', type: '集成战略' },
        7,
      );
      assert.equal(cover.filename, '原创题图.png');
      assert.equal(
        cover.sourceUrl,
        'https://prts.wiki/w/' + encodeURIComponent('原始活动页'),
      );
    }
    assert.deepEqual(calls, [
      '原创活动',
      '原始活动页',
      '原创活动',
      '原始活动页',
      '原创活动',
      '原始活动页',
    ]);
    assert.equal(
      (await metadata.cover({ title: '特殊 · 原创活动', type: '特殊' }, 7))
        .filename,
      '原创题图.png',
    );
    const restarted = new PrtsMetadata(root, async () => {
      throw new Error('offline');
    });
    assert.equal(
      (await restarted.cover({ title: '原创活动', type: '支线' }, 7)).filename,
      '原创题图.png',
    );
    await metadata.clear();
    assert.equal(await readFile(record, 'utf8'), '独立阅读记录');
  }));

test('April index links follow the APF year even with minigame chapters, never the display title or unrelated portraits', async () =>
  temporary(async (root) => {
    const aprilUrl = 'https://prts.wiki/w/' + encodeURIComponent('愚人节活动');
    const wiki = `<div class="apr-entry">[[文件:原始年份入口.webp|120px|link=愚人节活动#2022]]<br>[[文件:干员头像.png|link=其他页面]]</div>`;
    assert.equal(
      parseAprilCover(wiki, '2022', aprilUrl).filename,
      '原始年份入口.webp',
    );
    assert.throws(
      () => parseAprilCover(wiki + wiki, '2022', aprilUrl),
      isCode('parse'),
    );
    assert.throws(
      () => parseAprilCover(wiki, '2021', aprilUrl),
      isCode('parse'),
    );
    assert.throws(
      () => parseAprilCover('结构变化', '2022', aprilUrl),
      isCode('parse'),
    );
    const metadata = new PrtsMetadata(root, async (title) => {
      assert.equal(title, '愚人节活动');
      return wiki;
    });
    const chapter = { code: 'STORY', title: '原创', wordCount: null };
    const story = {
      id: 'stable-april-id',
      title: '四月辑录 · 变更后的显示名',
      type: '四月辑录',
      chapters: [
        { ...chapter, id: 'prts:APF-2022/NBT' },
        { ...chapter, id: 'prts:迷你游戏/剧情' },
      ],
    };
    assert.equal(
      (await metadata.cover(story, 7)).sourceUrl,
      `${aprilUrl}#2022`,
    );
    await assert.rejects(
      () => metadata.cover({ ...story, id: 'no-year', chapters: [] }, 7),
      isCode('unsupported'),
    );
    await assert.rejects(
      () =>
        metadata.cover(
          {
            ...story,
            id: 'two-years',
            chapters: [
              ...story.chapters,
              { ...chapter, id: 'prts:APF-2021/NBT' },
            ],
          },
          7,
        ),
      isCode('unsupported'),
    );
  }));

test('main-story title logos remain unsupported with index evidence; missing pages and request failures never become negative cache hits', async () =>
  temporary(async (root) => {
    let fail = true;
    const calls: string[] = [];
    const metadata = new PrtsMetadata(root, async (title) => {
      calls.push(title);
      if (title === '关卡一览/主题曲')
        return '{{锚点|EP00}}\n{|\n!<big>序章 <big>原创主线</big></big>\n|[[文件:章节名称 序章.png]]\n|}';
      if (title === '原创主线' || title === '不存在')
        throw new ReaderError('not_found', 'HTTP 404');
      if (fail) throw new ReaderError('network', 'temporary');
      return activity;
    });
    await assert.rejects(
      () => metadata.cover({ title: '原创主线', type: '主线' }, 7),
      (error: unknown) =>
        isCode('unsupported')(error) &&
        error instanceof ReaderError &&
        error.sourceUrl?.endsWith('#EP00') === true,
    );
    await assert.rejects(
      () => metadata.cover({ title: '不存在', type: '支线' }, 7),
      isCode('not_found'),
    );
    await assert.rejects(
      () => metadata.cover({ title: '可重试活动', type: '支线' }, 7),
      isCode('network'),
    );
    fail = false;
    assert.equal(
      (await metadata.cover({ title: '可重试活动', type: '支线' }, 7, true))
        .filename,
      '原创题图.png',
    );
    assert.equal(calls.filter((title) => title === '可重试活动').length, 2);
  }));

test('MediaWiki explicit missing flag differs from incompatible imageinfo, and refreshing only this asset replaces cached bytes', async () =>
  temporary(async (root) => {
    let mode: 'missing' | 'malformed' | 'bad-png' | 'success' = 'missing';
    let requests = 0;
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
      'base64',
    );
    const resources = new PrtsResources(
      root,
      async () => '',
      async (input) => {
        requests++;
        if (String(input).includes('/api.php')) {
          const page =
            mode === 'missing'
              ? { missing: '' }
              : mode === 'malformed'
                ? {}
                : {
                    imageinfo: [
                      { url: 'https://media.prts.wiki/original.png' },
                    ],
                  };
          return Response.json({ query: { pages: { '1': page } } });
        }
        return new Response(mode === 'bad-png' ? png.subarray(0, 24) : png, {
          headers: { 'content-type': 'image/png' },
        });
      },
    );
    await assert.rejects(
      () => resources.fileImage('原创.png', 7),
      isCode('resource_missing'),
    );
    mode = 'malformed';
    await assert.rejects(
      () => resources.fileImage('原创.png', 7),
      isCode('parse'),
    );
    mode = 'bad-png';
    const invalid = await resources.fileImage('原创.png', 7);
    mode = 'success';
    const before = requests;
    assert.equal(
      (await resources.fileImage('原创.png', 7)).layers[0]?.dataUrl,
      invalid.layers[0]?.dataUrl,
    );
    assert.equal(requests, before);
    const refreshed = await resources.fileImage('原创.png', 7, true);
    assert.notEqual(refreshed.layers[0]?.dataUrl, invalid.layers[0]?.dataUrl);
    assert.equal(requests, before + 2);
  }));
