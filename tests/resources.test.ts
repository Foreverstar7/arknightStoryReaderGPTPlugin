import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { z } from 'zod';
import { parsePrtsCatalog } from '../src/data/prts-catalog.js';
import { parseStageSummary } from '../src/data/prts-metadata.js';
import {
  CHARACTER_MAP,
  PrtsResources,
  portraitReference,
  resolvePortrait,
  parseImageIndex,
  MAX_IMAGE_BYTES,
  limitedBytes,
} from '../src/data/prts-resources.js';
import { PublicCache } from '../src/storage/public-cache.js';
import { imageResultSchema } from '../src/shared/contracts.js';
import { ReaderError } from '../src/shared/errors.js';
import {
  coverPresentation,
  textCoverTitle,
} from '../src/shared/cover-policy.js';

// Original asset metadata, with the formats observed in PRTS's current player.
test('20 MB raster budget accepts the exact boundary, rejects streamed overflow, and retries without caching failure', async () =>
  temporary(async (root) => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
      'base64',
    );
    const bytes = Buffer.alloc(MAX_IMAGE_BYTES);
    png.copy(bytes);
    let overflow = true;
    let requests = 0;
    const source = new PrtsResources(
      root,
      async () => 'large,https://media.prts.wiki/original-large.png',
      async () => {
        requests++;
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(bytes);
              if (overflow) controller.enqueue(new Uint8Array([0]));
              controller.close();
            },
          }),
          { headers: { 'content-type': 'image/png' } },
        );
      },
    );
    await assert.rejects(
      () => source.cg('large', 7),
      (error: unknown) =>
        error instanceof ReaderError &&
        error.code === 'parse' &&
        error.message.includes('取数上限'),
    );
    overflow = false;
    const image = imageResultSchema.parse(await source.cg('large', 7, true));
    assert.equal(
      Buffer.from(image.layers[0]?.dataUrl.split(',')[1] ?? '', 'base64')
        .length,
      20_000_000,
    );
    assert.equal(requests, 2);
    const offline = new PrtsResources(
      root,
      async () => {
        throw new Error('offline');
      },
      async () => {
        throw new Error('offline');
      },
    );
    assert.deepEqual(await offline.cg('large', 7), image);
    // JSON and mapping callers still supply their own, smaller byte budgets.
    await assert.rejects(
      () => limitedBytes(new Response(Buffer.alloc(100_001)), 100_000),
      /取数上限/u,
    );
  }));

test('cover display admits only approved shapes and text covers use source IDs, not the duplicate display title', () => {
  const image = {
    width: 512,
    height: 512,
    layers: [],
    resource: '',
    sourceUrl: 'https://prts.wiki/w/test',
  };
  assert.equal(coverPresentation(image), 'deferred');
  assert.equal(
    coverPresentation({ ...image, width: 1560, height: 500 }),
    'banner',
  );
  assert.equal(
    coverPresentation({
      ...image,
      attribution: { method: 'main-chapter-index', sourceUrl: image.sourceUrl },
    }),
    'contain',
  );
  assert.equal(
    coverPresentation({
      ...image,
      width: 463,
      height: 121,
      attribution: { method: 'contingency-logo', sourceUrl: image.sourceUrl },
    }),
    'contain',
  );
  assert.equal(
    coverPresentation({
      ...image,
      width: 513,
      attribution: { method: 'main-chapter-index', sourceUrl: image.sourceUrl },
    }),
    'deferred',
  );
  assert.equal(
    textCoverTitle({ source: 'prts', id: 'prts:主线剧情/特殊 · 剧情' }),
    '主线补充剧情',
  );
  assert.equal(
    textCoverTitle({ source: 'prts', id: 'prts:活动剧情/特殊 · 剧情' }),
    '活动补充剧情',
  );
  assert.equal(
    textCoverTitle({ source: 'fixture', id: 'prts:主线剧情/特殊 · 剧情' }),
    undefined,
  );
  assert.equal(
    textCoverTitle({ source: 'prts', id: '特殊 · 剧情' }),
    undefined,
  );
});

const mapping = {
  unit: {
    array: [
      { name: 'happy', body: 0, index: 0, group: -1, image: 'unit/smile' },
      {
        name: 'calm',
        alias: 'quiet',
        body: 0,
        index: 1,
        group: -1,
        image: 'unit/calm',
      },
    ],
    groups: [],
  },
  layered: {
    array: [
      { name: '6$1', body: 0, index: 5, group: 0, face: 'layered/face1' },
      { name: '6$2', body: 1, index: 5, group: 1, face: 'layered/face2' },
    ],
    groups: [
      {
        mode: 'face_overlay',
        base: 'layered/shield',
        faceRect: { x: 4, y: 8, w: 12, h: 12 },
      },
      {
        mode: 'face_overlay',
        base: 'layered/plain',
        faceRect: { x: 6, y: 8, w: 12, h: 12 },
      },
    ],
  },
};
async function temporary(run: (root: string) => Promise<void>) {
  const base = path.resolve('.ai/local/test-data');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, 'resources-'));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('exact hub expressions, body groups and face overlays resolve; multiple scene resources never use focus to guess', () => {
  assert.match(
    resolvePortrait(mapping, 'unit#1')[0]?.url ?? '',
    /unit\/smile\.png$/u,
  );
  assert.match(
    resolvePortrait(mapping, 'unit@quiet')[0]?.url ?? '',
    /unit\/calm\.png$/u,
  );
  assert.match(
    resolvePortrait(mapping, 'unit-calm')[0]?.url ?? '',
    /unit\/calm\.png$/u,
  );
  const shield = resolvePortrait(mapping, 'layered#6$1');
  const plain = resolvePortrait(mapping, 'layered#6$2');
  assert.match(shield[0]?.url ?? '', /shield/u);
  assert.match(plain[0]?.url ?? '', /plain/u);
  assert.equal(shield[1]?.x, 4);
  assert.equal(plain[1]?.x, 6);
  assert.throws(() => resolvePortrait(mapping, 'unit#99'), /不存在或有歧义/u);
  assert.throws(
    () => resolvePortrait(mapping, 'unit@missing'),
    /不存在或有歧义/u,
  );
  assert.equal(portraitReference(['unit#2', 'unit#2']), 'unit#2');
  assert.throws(() => portraitReference(['unit', 'layered']), /无法确认姓名/u);
  assert.throws(() => portraitReference([]), /没有可确认/u);
});

test('catalog retains body rows, categories, inherited special groups and exact order without footer duplication', () => {
  const source = `{|\n! [[剧情一览|主线剧情一览]]\n|-\n! rowspan="1"|特殊\n! 剧情\n| [[EP09/ENTRY|EP09 序曲]]\n|-\n! width="120px"|测试主线\n! width="40px"|主线\n| [[1-1 原创/NBT|1-1 原创]]\n|}\n{|\n! [[剧情一览|活动剧情一览]]\n|-\n! rowspan="2"|集成战略\n! 测试甲\n| [[RO1-BEG/NBT|序章]]\n|-\n! 测试乙\n| [[RO2-BEG/NBT|序章]]\n|}\n{{Navbox|[[不要访问/BEG|页脚]]}}`;
  const stories = parsePrtsCatalog('{{剧情导航}}', source);
  assert.deepEqual(
    stories.map((story) => [story.title, story.type]),
    [
      ['特殊 · 剧情', '特殊'],
      ['测试主线', '主线'],
      ['集成战略 · 测试甲', '集成战略'],
      ['集成战略 · 测试乙', '集成战略'],
    ],
  );
  assert.deepEqual(
    stories.map((story) => story.chapters[0]?.id),
    [
      'prts:EP09/ENTRY',
      'prts:1-1 原创/NBT',
      'prts:RO1-BEG/NBT',
      'prts:RO2-BEG/NBT',
    ],
  );
});

test('stage summaries preserve source prose and omit battle modifiers; incompatible markup fails', () => {
  assert.equal(
    parseStageSummary(
      '|关卡描述=荒野中的[[甲地|旧路]]。<br/>无法携带某角色\n|消耗=9',
    ),
    '荒野中的旧路。',
  );
  assert.equal(parseStageSummary('没有描述字段'), undefined);
  assert.throws(
    () => parseStageSummary('|关卡描述={{新模板|未知}}'),
    /Wiki 标记/u,
  );
  assert.throws(
    () => parseImageIndex('cg,https://evil.example/test.png'),
    /图片索引/u,
  );
});

test('image bytes and mapping requests coalesce, cache across restart, fail retryably, and clear independently', async () =>
  temporary(async (root) => {
    const requests: string[] = [];
    let offline = false;
    let fail = true;
    // A real tiny original RGBA PNG, decoded by browser checks separately.
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
      'base64',
    );
    const request: typeof fetch = async (input) => {
      const url = String(input);
      requests.push(url);
      if (offline) throw new Error('offline');
      if (url === CHARACTER_MAP) return Response.json(mapping);
      if (fail) return new Response('unavailable', { status: 503 });
      return new Response(png, { headers: { 'content-type': 'image/png' } });
    };
    const resources = new PrtsResources(
      root,
      async () => 'scene,https://media.prts.wiki/a/ab/Avg_scene.png',
      request,
    );
    assert.equal(requests.length, 0);
    await assert.rejects(() => resources.portrait('unit', 7), /HTTP 503/u);
    fail = false;
    const images = await Promise.all([
      resources.portrait('unit', 7),
      resources.portrait('unit', 7),
    ]);
    assert.equal(images[0]?.width, 1);
    assert.equal(requests.filter((url) => url === CHARACTER_MAP).length, 1);
    assert.equal(requests.filter((url) => url.endsWith('smile.png')).length, 2); // One failed and one shared retry.
    offline = true;
    const restarted = new PrtsResources(
      root,
      async () => {
        throw new Error('offline');
      },
      request,
    );
    assert.equal(
      (await restarted.portrait('unit', 7)).layers[0]?.dataUrl,
      images[0]?.layers[0]?.dataUrl,
    );
    const before = requests.length;
    await restarted.clear('images');
    assert.equal(requests.length, before);
    await assert.rejects(() => restarted.portrait('unit', 7), /连接失败/u);
    assert.equal(requests.filter((url) => url === CHARACTER_MAP).length, 1);
  }));

test('resource expiry slides with use and removes expired images without touching reading data', async () =>
  temporary(async (root) => {
    let now = 0;
    const cache = new PublicCache(root, 'images', () => now);
    await cache.put('one', 'public');
    now += 6 * 86_400_000;
    assert.equal(await cache.get('one', z.string(), 7), 'public');
    now += 6 * 86_400_000;
    await cache.expire(7);
    assert.equal(await cache.get('one', z.string(), 7), 'public');
    now += 8 * 86_400_000;
    await cache.expire(7);
    assert.equal(await cache.get('one', z.string(), 7), null);
  }));

test('original JPEG/WebP/GIF and legacy alpha PNG retain bytes, MIME and dimensions across transport and offline restart; MIME mismatches fail retryably', async () =>
  temporary(async (root) => {
    // Original 2x3 colour swatches generated with Edge canvas; no PRTS art bundled.
    const swatches = z
      .record(z.string(), z.string())
      .parse(JSON.parse(await readFile('tests/fixtures/raster.json', 'utf8')));
    const samples = [
      {
        mime: 'image/jpeg',
        data: swatches['image/jpeg'] ?? '',
        width: 2,
        height: 3,
      },
      {
        mime: 'image/webp',
        data: swatches['image/webp'] ?? '',
        width: 2,
        height: 3,
      },
      {
        mime: 'image/gif',
        data: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
        width: 1,
        height: 1,
      },
      {
        mime: 'image/png',
        data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
        width: 1,
        height: 1,
      },
    ];
    for (const [index, sample] of samples.entries()) {
      let calls = 0;
      let wrongMime = true;
      const url = `https://media.prts.wiki/original-${index}`;
      const filename = `original-${index}`;
      const resources = new PrtsResources(
        root,
        async () => '',
        async (input) => {
          calls++;
          if (String(input).includes('/api.php'))
            return Response.json({
              query: { pages: { '1': { imageinfo: [{ url }] } } },
            });
          return new Response(
            Buffer.from(sample.data.split(',')[1] ?? '', 'base64'),
            {
              headers: {
                'content-type': wrongMime
                  ? 'text/html'
                  : `${sample.mime}; charset=binary`,
              },
            },
          );
        },
      );
      await assert.rejects(
        () => resources.fileImage(filename, 7),
        (error: unknown) =>
          error instanceof ReaderError && error.code === 'parse',
      );
      wrongMime = false;
      const image = imageResultSchema.parse(
        await resources.fileImage(filename, 7),
      );
      assert.equal(image.layers[0]?.dataUrl, sample.data);
      assert.equal(image.width, sample.width);
      assert.equal(image.height, sample.height);
      const before = calls;
      const restarted = new PrtsResources(
        root,
        async () => {
          throw new Error('offline');
        },
        async () => {
          calls++;
          throw new Error('offline');
        },
      );
      assert.deepEqual(await restarted.fileImage(filename, 7), image);
      assert.equal(calls, before);
      // Old image entries had exactly dataUrl/width/height and no format version.
      await resources.images.put(url, {
        dataUrl: sample.data,
        width: sample.width,
        height: sample.height,
      });
      assert.deepEqual(await restarted.fileImage(filename, 7), image);
    }
    const jpeg = samples[0];
    assert.ok(jpeg);
    const mismatch = new PrtsResources(
      root,
      async () => 'scene,https://media.prts.wiki/mismatch.png',
      async () =>
        new Response(Buffer.from(jpeg.data.split(',')[1] ?? '', 'base64'), {
          headers: { 'content-type': 'image/png' },
        }),
    );
    await assert.rejects(
      () => mismatch.cg('scene', 7),
      (error: unknown) =>
        error instanceof ReaderError && error.code === 'parse',
    );
  }));
