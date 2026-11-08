import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { PrtsSource } from '../src/data/prts.js';
import { resolvePortraitView } from '../src/data/prts-portrait-view.js';
import { CHARACTER_MAP } from '../src/data/prts-portrait.js';
import { ReaderError, type ImageTarget } from '../src/data/source.js';
import { imageResultSchema } from '../src/shared/contracts.js';
import { CacheCoordinator } from '../src/storage/cache-coordinator.js';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
  'base64',
);
const map = Object.fromEntries(
  ['a', 'b'].map((name) => [
    `avg_actor_${name}`,
    {
      array: [
        {
          name: 'normal',
          body: 0,
          index: 0,
          group: -1,
          image: `actor-${name}/default`,
        },
        {
          name: 'angry',
          body: 0,
          index: 1,
          group: -1,
          image: `actor-${name}/angry`,
        },
      ],
    },
  ]),
);
async function withSource(run: (source: PrtsSource) => Promise<void>) {
  const base = path.resolve('.ai/local/test-data');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, 'portrait-views-'));
  assert.ok(root.startsWith(base + path.sep));
  const source = new PrtsSource(
    root,
    async (title) => {
      if (title === 'Widget:Data_Link') return '{}';
      if (title === 'Widget:Data_Char')
        return 'unused,https://media.prts.wiki/unused.png';
      throw new ReaderError('not_found', '没有角色身份资料');
    },
    async (input) =>
      String(input) === CHARACTER_MAP
        ? Response.json(map)
        : new Response(png, { headers: { 'content-type': 'image/png' } }),
  );
  try {
    await run(source);
  } finally {
    new CacheCoordinator(root).close();
    await rm(root, { recursive: true, force: true });
  }
}
const input = {
  kind: 'portrait',
  chapterId: 'prts:原创测试',
  blockId: 'test',
} as const;

test('mismatched scene remains inspectable while the automatic and default views show the confirmed speaker', async () => {
  await withSource(async (source) => {
    const target: ImageTarget = {
      kind: 'portrait',
      resources: ['avg_actor_a#2'],
      speaker: '访客',
      speakerBinding: {
        reference: 'avg_actor_b',
        default: false,
        evidenceBlocks: ['independent'],
        absentFromScene: true,
      },
    };
    const automatic = imageResultSchema.parse(
      await source.image(input, target, 7),
    );
    assert.match(automatic.layers[0]?.sourceUrl ?? '', /actor-b\/default/u);
    assert.equal(automatic.portrait?.views?.selected, 'default');
    assert.equal(automatic.portrait?.views?.sceneRelation, 'mismatch');
    const scene = imageResultSchema.parse(
      await source.image({ ...input, portraitView: 'scene' }, target, 7),
    );
    assert.match(scene.layers[0]?.sourceUrl ?? '', /actor-a\/angry/u);
    assert.equal(scene.portrait?.views?.selected, 'scene');
    assert.equal(scene.portrait?.views?.sceneRelation, 'mismatch');
    assert.match(scene.portrait?.message ?? '', /与发言人不一致/u);
    const normal = await source.image(
      { ...input, portraitView: 'default' },
      target,
      7,
    );
    assert.match(normal.layers[0]?.sourceUrl ?? '', /actor-b\/default/u);
  });
});

test('unconfirmed speakers cannot get guessed defaults; explicit scene inspection keeps every candidate and the uncertainty', async () => {
  await withSource(async (source) => {
    const target: ImageTarget = {
      kind: 'portrait',
      resources: ['avg_actor_a#2', 'avg_actor_b'],
      speaker: '未知人物',
    };
    const automatic = await source.image(input, target, 7);
    assert.equal(automatic.portrait?.status, 'placeholder');
    assert.equal(automatic.portrait?.views?.defaultAvailable, false);
    assert.equal(automatic.portrait?.views?.sceneAvailable, true);
    const normal = await source.image(
      { ...input, portraitView: 'default' },
      target,
      7,
    );
    assert.equal(normal.layers.length, 0);
    assert.equal(normal.portrait?.reason, 'default_unconfirmed');
    const scene = imageResultSchema.parse(
      await source.image({ ...input, portraitView: 'scene' }, target, 7),
    );
    assert.equal(scene.layers.length, 2);
    assert.equal(scene.portrait?.views?.sceneRelation, 'unconfirmed');
    assert.equal(scene.portrait?.views?.defaultAvailable, false);
    assert.match(scene.portrait?.message ?? '', /尚未确认/u);
    assert.equal(scene.width, 2);
    assert.equal(scene.layers[1]?.x, 1);
  });
});

test('default view uses the same character and costume; scene view preserves the requested expression', async () => {
  await withSource(async (source) => {
    const target: ImageTarget = {
      kind: 'portrait',
      resources: ['avg_actor_a#2'],
      speaker: '值班人员',
    };
    const automatic = await source.image(input, target, 7);
    assert.match(automatic.layers[0]?.sourceUrl ?? '', /angry/u);
    const normal = await source.image(
      { ...input, portraitView: 'default' },
      target,
      7,
    );
    assert.match(normal.layers[0]?.sourceUrl ?? '', /default/u);
    assert.equal(normal.portrait?.views?.selected, 'default');
    const scene = await source.image(
      { ...input, portraitView: 'scene' },
      target,
      7,
    );
    assert.match(scene.layers[0]?.sourceUrl ?? '', /angry/u);
    assert.equal(scene.portrait?.views?.selected, 'scene');
    const absent: ImageTarget = {
      ...target,
      resources: [],
      speakerBinding: {
        reference: 'avg_actor_a',
        default: false,
        evidenceBlocks: ['single'],
        absentFromScene: true,
      },
    };
    const missing = await source.image(
      { ...input, portraitView: 'scene' },
      absent,
      7,
    );
    assert.equal(missing.portrait?.views?.sceneAvailable, false);
    assert.equal(missing.portrait?.views?.sceneRelation, 'absent');
    assert.doesNotMatch(missing.portrait?.message ?? '', /不一致/u);
  });
});

test('an independently confirmed default remains available without loading a failed scene expression', async () => {
  await withSource(async (source) => {
    const target: ImageTarget = {
      kind: 'portrait',
      resources: ['avg_actor_a#2', 'avg_actor_b'],
      speaker: '值班人员',
      speakerBinding: {
        reference: 'avg_actor_a#2',
        default: false,
        evidenceBlocks: ['single'],
      },
    };
    const normal = await source.image(
      { ...input, portraitView: 'default' },
      target,
      7,
    );
    const image = await resolvePortraitView(
      { ...input, portraitView: 'default' },
      target,
      async () => {
        throw new ReaderError('network', '场景表情当前无法读取');
      },
      async () => {
        if (!normal.portrait) throw new Error('Missing portrait metadata');
        return { ...normal, portrait: normal.portrait };
      },
    );
    assert.equal(image.portrait.views?.selected, 'default');
    assert.match(image.layers[0]?.sourceUrl ?? '', /actor-a\/default/u);
  });
});
