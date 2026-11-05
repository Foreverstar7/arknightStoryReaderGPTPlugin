import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import {
  PrtsResources,
  portraitReference,
  resolvePortrait,
} from '../src/data/prts-resources.js';
import {
  CHARACTER_MAP,
  STORY_VARIABLES,
  resolvePortraitPlan,
  placeholderPortrait,
  matchSpeakerPortrait,
} from '../src/data/prts-portrait.js';
import { parseOperatorIdentity } from '../src/data/prts-metadata.js';
import { parsePrtsChapter } from '../src/data/prts-script.js';
import { cgItem, tiledCg } from '../src/data/prts-cg.js';
import { imageResultSchema } from '../src/shared/contracts.js';
import { CacheCoordinator } from '../src/storage/cache-coordinator.js';
import { chapterWords } from '../src/domain/reading.js';
import { ReaderError } from '../src/shared/errors.js';
import { readingLayout, migrateRecord } from '../src/domain/revisions.js';

const modern = {
  Unit: {
    array: [
      { name: 'smile', body: 1, index: 4, group: -1, image: 'unit/smile' },
      {
        name: 'normal',
        body: 1,
        index: 0,
        group: -1,
        image: 'unit/body2-default',
      },
      {
        name: 'normal1',
        body: 0,
        index: 0,
        group: -1,
        image: 'unit/body1-default',
      },
    ],
  },
};
const legacy = {
  link: { old: { array: [{ name: 'old-2$1' }, { name: 'old-1$1' }] } },
  images: new Map([
    ['old-2$1', 'https://media.prts.wiki/old-exact.png'],
    ['old-1$1', 'https://media.prts.wiki/old-default.png'],
  ]),
};
test('case/grammar whitespace recover exact resources; colliding keys and duplicate matches fail without guessed identity', () => {
  assert.equal(
    resolvePortrait(modern, ' UNIT #5 $ 2 ')[0]?.url,
    'https://torappu.prts.wiki/assets/avg/characters/unit/smile.png',
  );
  assert.equal(portraitReference(['unit#5$2', ' UNIT #5 $2 ']), 'unit#5$2');
  assert.throws(() => resolvePortrait(modern, 'u nit#5$2'), /不支持/u);
  assert.throws(
    () => resolvePortrait({ ...modern, unit: modern.Unit }, 'unit'),
    /大小写冲突/u,
  );
  assert.throws(
    () =>
      resolvePortrait(
        { unit: { array: [...modern.Unit.array, ...modern.Unit.array] } },
        'unit#5$2',
      ),
    /歧义/u,
  );
  assert.throws(() => portraitReference(['unit', 'old']), /无法确认/u);
});
test('exact legacy beats default; fallback uses explicit same-body index zero, never arbitrary first entries', () => {
  const old = resolvePortraitPlan(modern, 'old#2', legacy);
  assert.equal(old?.portrait.status, 'original');
  assert.equal(old?.portrait.reason, 'legacy_exact');
  const recoveredOriginal = resolvePortraitPlan(
    modern,
    'unit#5$2',
    {
      link: { unit: { array: [{ name: 'unit-5$2' }] } },
      images: new Map([
        ['unit-5$2', 'https://media.prts.wiki/old-original.png'],
      ]),
    },
    'legacy',
  );
  assert.equal(recoveredOriginal?.portrait.status, 'original');
  assert.throws(
    () =>
      resolvePortraitPlan(
        {
          unit: {
            array: [
              { name: 'x', group: 0, body: 0, index: 0, face: 'unit/face' },
            ],
            groups: [{ mode: 'unknown' }],
          },
        },
        'unit',
        legacy,
      ),
    /组合格式尚不兼容/u,
  );
  const fallback = resolvePortraitPlan(modern, 'unit#99$2', legacy);
  assert.equal(fallback?.portrait.status, 'default');
  assert.match(fallback?.layers[0]?.url ?? '', /body2-default/u);
  assert.equal(
    resolvePortraitPlan(
      { unit: { array: [{ name: 'random', image: 'unrelated' }] } },
      'unit#99',
      legacy,
    ),
    null,
  );
  assert.equal(resolvePortraitPlan(modern, 'unknown#1', legacy), null);
  assert.equal(resolvePortraitPlan(modern, 'unit#99$3', legacy), null);
  assert.equal(
    imageResultSchema.parse(placeholderPortrait('', 'no_scene', '没有场景'))
      .layers.length,
    0,
  );
  assert.equal(
    imageResultSchema.safeParse({
      width: 1,
      height: 1,
      layers: [],
      resource: 'x',
      sourceUrl: CHARACTER_MAP,
    }).success,
    false,
  );
});
test('variables, originals, missing images and network failures remain distinguishable across cached retry', async () => {
  const base = path.resolve('.ai/local/test-data');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, 'body-images-'));
  const calls: string[] = [];
  let status = 200;
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
    'base64',
  );
  const source = new PrtsResources(
    root,
    async (title) =>
      title === 'Widget:Data_Link'
        ? JSON.stringify(legacy.link)
        : [...legacy.images].map(([k, v]) => `${k},${v}`).join('\n'),
    async (input) => {
      const url = String(input);
      calls.push(url);
      if (url === CHARACTER_MAP) return Response.json(modern);
      if (url === STORY_VARIABLES)
        return Response.json({ explicit: 'Unit#5$2', cycle: '$cycle' });
      if (url.endsWith('smile.png') && status !== 200)
        return new Response('', { status });
      return new Response(png, { headers: { 'content-type': 'image/png' } });
    },
  );
  try {
    assert.equal(
      (await source.portrait('$explicit', 7)).portrait?.status,
      'original',
    );
    assert.ok(
      (await source.portrait('$explicit', 7)).portrait?.evidence.includes(
        STORY_VARIABLES,
      ),
    );
    assert.equal(
      (await source.portrait('$cycle', 7)).portrait?.status,
      'placeholder',
    );
    assert.equal(
      (await source.portrait('unknown', 7)).portrait?.status,
      'placeholder',
    );
    status = 503;
    await assert.rejects(
      () => source.portrait('unit#5$2', 7, true),
      (e: unknown) => e instanceof ReaderError && e.code === 'network',
    );
    status = 404;
    assert.equal(
      (await source.portrait('unit#5$2', 7, true)).portrait?.status,
      'default',
    );
    status = 200;
    assert.equal(
      (await source.portrait('unit#5$2', 7, true)).portrait?.status,
      'original',
    );
    const before = calls.length;
    await source.portrait('$explicit', 7);
    assert.equal(calls.length, before);
  } finally {
    new CacheCoordinator(root).close();
    await rm(root, { recursive: true, force: true });
  }
});
const meta = {
  id: 'prts:原创/NBT',
  storyId: 'prts:原创',
  title: '原创',
  pageTitle: '原创/NBT',
};
const parse = (script: string) =>
  parsePrtsChapter(
    `{{剧情模拟器|文本路径=original/images|剧情分组=原创|文本数据=\n${script}\n}}\n{{剧情导航}}`,
    meta,
  );

test('CG source coordinates and tile dimensions reject missing, excess and non-finite values at the boundary', () => {
  for (const pto of ['1', '1,2,3', 'no,2', 'Infinity,2'])
    assert.throws(() => cgItem({ image: 'original', pto }), /坐标格式/u);
  assert.equal(cgItem({ image: 'original' }).item.x, 640);
  assert.equal(cgItem({ image: 'original', pto: ',' }).item.y, 360);
  for (const [command, args] of [
    ['verticalbg', { cggroup: 'a/b', solidwidth: '10', solidheight: '5' }],
    ['verticalbg', { cggroup: 'a/b', solidwidth: '10/20', solidheight: '5/7' }],
    ['verticalbg', { cggroup: 'a/b', solidwidth: '10', solidheight: '5/7/9' }],
    ['verticalbg', { cggroup: 'a//b', solidwidth: '10', solidheight: '5/6/7' }],
    ['verticalbg', { cggroup: 'a/b', solidwidth: '10', solidheight: '5/NaN' }],
    ['largebg', { cggroup: 'a/b', solidwidth: '8/12', solidheight: '0' }],
    ['largebg', { cggroup: 'a', solidwidth: '8', solidheight: '9' }],
  ] as const)
    assert.throws(() => tiledCg(command, args), /图片数/u);
});
test('CGItem composites retain key order/alpha, isolate branch state and preserve anonymous speech and word counts', () => {
  const chapter = parse(
    `[cgitem(image="base")]\n[Decision(options="甲;乙",values="1;2")]\n[Predicate(references="1")]\n[cgitem(image="left",pto="-20,30",sto=0.5)]\n[name="？？？"]左。\n[Predicate(references="2")]\n[cgitem(image="right")]\n[name="？？？"]右。\n[Predicate]\n[cgitem(image="top")]\n[name="？？？"]共同。\n[hidecgitem(image="base")]\n[cgitem(image="last",afrom=1,ato=0)]\n[name="？？？"]完。`,
  );
  const leaves = chapter.blocks.flatMap((b) =>
    b.kind === 'choices'
      ? [
          ...b.options.flatMap((o) => o.blocks),
          ...(b.shared?.flatMap((g) => g.blocks) ?? []),
        ]
      : [b],
  );
  const cgs = leaves.filter((b) => b.kind === 'cg');
  assert.deepEqual(
    cgs.map((b) => b.composition?.layers.map((l) => l.resource)),
    [
      ['base'],
      ['base', 'left'],
      ['base', 'right'],
      ['base', 'top'],
      ['top', 'last'],
    ],
  );
  assert.deepEqual(cgs[1]?.composition?.layers[1], {
    resource: 'left',
    kind: 'image',
    centered: true,
    x: 620,
    y: 390,
    scale: 0.5,
    rotation: 0,
    opacity: 1,
  });
  assert.equal(
    leaves.filter((b) => b.kind === 'speech').every((b) => b.name === '？？？'),
    true,
  );
  assert.equal(chapterWords(chapter), 11);
});
test('CG groups stitch by explicit solid sizes, ignore ordinary backgrounds and retain text anchors', () => {
  const chapter = parse(
    '[background(image="plain")]\n[verticalbg(imagegroup="bg1/bg2",solidwidth=10,solidheight="5/5")]\n[verticalbg(cggroup="top/bottom",solidwidth=10,solidheight="5/7")]\n[name="甲"]正文。\n[largebg(cggroup="left/right",solidwidth="8/12",solidheight=9)]',
  );
  const cgs = chapter.blocks.filter((b) => b.kind === 'cg');
  assert.equal(cgs.length, 2);
  assert.deepEqual(cgs[0]?.composition, {
    width: 10,
    height: 12,
    description: 'CG 纵向完整拼接',
    layers: [
      { resource: 'top', kind: 'image', x: 0, y: 0, width: 10, height: 5 },
      { resource: 'bottom', kind: 'image', x: 0, y: 5, width: 10, height: 7 },
    ],
  });
  assert.equal(cgs[1]?.composition?.layers[1]?.x, 8);
  assert.throws(
    () =>
      tiledCg('largebg', {
        cggroup: 'left/right',
        solidwidth: '8',
        solidheight: '9',
      }),
    /不匹配/u,
  );
  assert.equal(chapterWords(chapter), 3);
  assert.equal(
    chapter.blocks.find((b) => b.kind === 'speech')?.id,
    parse('[name="甲"]正文。').blocks[0]?.id,
  );
});

test('same-source v3 to v4 image additions preserve saved branch fractions, furthest words and completion', () => {
  const chapter = parse(
    '[Decision(options="甲;乙",values="1;2")]\n[Predicate(references="1")]\n[cgitem(image="one")]\n[name="甲"]前行。\n[Predicate(references="2")]\n[name="乙"]等候。\n[Predicate]\n[name="甲"]结束。',
  );
  const next = readingLayout(chapter);
  const before = readingLayout({
    ...chapter,
    revision: chapter.revision.replace('v4:', 'v3:'),
    blocks: chapter.blocks.map((block) =>
      block.kind === 'choices'
        ? {
            ...block,
            options: block.options.map((option) => ({
              ...option,
              blocks: option.blocks.filter((leaf) => leaf.kind !== 'cg'),
            })),
          }
        : block,
    ),
  });
  const last = { blockId: before.blocks[0]?.id ?? '', fraction: 0.6 };
  const record = {
    chapterId: chapter.id,
    storyId: chapter.storyId,
    revision: before.revision,
    last,
    furthest: last,
    furthestWords: 4,
    totalWords: before.totalWords,
    complete: false,
    updatedAt: '2026-11-04T12:00:00.000Z',
    layout: before,
  };
  const migrated = migrateRecord(record, next);
  assert.deepEqual(migrated.last, last);
  assert.equal(migrated.furthestWords, 4);
  assert.equal(
    migrateRecord({ ...record, complete: true }, next).complete,
    true,
  );
});

test('only exact sourced operator identity can disambiguate a whole scene resource ID', () => {
  const url = 'https://prts.wiki/w/原创角色';
  const wiki =
    '{{CharinfoV2|干员名=原创角色|干员id=char_900_reader|说明={{例子|干员id=char_901_other}}}}';
  assert.equal(parseOperatorIdentity(wiki, '原创角色', url), 'char_900_reader');
  assert.equal(parseOperatorIdentity(wiki, '？？？', url), null);
  assert.equal(
    parseOperatorIdentity(
      '|干员名=原创角色|干员id=char_900_reader',
      '原创角色',
      url,
    ),
    null,
  );
  assert.throws(
    () => parseOperatorIdentity(wiki + wiki, '原创角色', url),
    /多组/u,
  );
  assert.throws(
    () =>
      parseOperatorIdentity(
        '{{CharinfoV2|干员名=原创角色|干员id=char_900_reader|干员id=char_901_other}}',
        '原创角色',
        url,
      ),
    /重复/u,
  );
  assert.equal(
    matchSpeakerPortrait(
      ['char_901_other', ' CHAR_900_READER_1#5$2 '],
      'char_900_reader',
    ),
    ' CHAR_900_READER_1#5$2 ',
  );
  assert.equal(
    matchSpeakerPortrait(
      ['char_900_readerx', 'char_901_other'],
      'char_900_reader',
    ),
    null,
  );
  assert.equal(
    matchSpeakerPortrait(
      ['char_900_reader#1', 'char_900_reader#2'],
      'char_900_reader',
    ),
    null,
  );
  assert.equal(
    matchSpeakerPortrait(
      ['char_900_reader#1', ' CHAR_900_READER#1 '],
      'char_900_reader',
    ),
    ' CHAR_900_READER#1 ',
  );
});

test('speaker matching preserves original expression and explicit default fallback, caches identity and retains network errors', async () => {
  const base = path.resolve('.ai/local/test-data');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, 'speaker-images-'));
  const wikiCalls: string[] = [];
  let offline = false;
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
    'base64',
  );
  const source = new PrtsResources(
    root,
    async (title) => {
      wikiCalls.push(title);
      if (offline) throw new ReaderError('network', '注入断网');
      if (title === '原创角色')
        return '{{CharinfoV2|干员名=原创角色|干员id=char_900_reader}}';
      if (title === 'Widget:Data_Link') return JSON.stringify(legacy.link);
      if (title === 'Widget:Data_Char')
        return [...legacy.images].map(([k, v]) => k + ',' + v).join('\n');
      throw new ReaderError('not_found', '没有干员资料');
    },
    async (input) => {
      if (offline) throw new ReaderError('network', '注入断网');
      if (String(input) === CHARACTER_MAP)
        return Response.json({ char_900_reader: modern.Unit });
      return new Response(png, { headers: { 'content-type': 'image/png' } });
    },
  );
  try {
    const refs = ['char_901_other', 'char_900_reader#5$2'];
    const image = await source.speakerPortrait(refs, '原创角色', 7);
    assert.equal(image?.portrait?.status, 'original');
    assert.equal(image?.resource, 'char_900_reader#5$2');
    assert.match(image?.layers[0]?.sourceUrl ?? '', /smile/u);
    assert.ok(
      image?.portrait?.evidence.includes(
        'https://prts.wiki/w/%E5%8E%9F%E5%88%9B%E8%A7%92%E8%89%B2',
      ),
    );
    const fallback = await source.speakerPortrait(
      ['char_901_other', 'char_900_reader#99$2'],
      '原创角色',
      7,
    );
    assert.equal(fallback?.portrait?.status, 'default');
    assert.match(fallback?.layers[0]?.sourceUrl ?? '', /body2-default/u);
    assert.equal(await source.speakerPortrait(refs, '？？？', 7), null);
    assert.equal(await source.speakerPortrait(refs, '无资料的人', 7), null);
    assert.equal(await source.speakerPortrait(refs, '无资料的人', 7), null);
    assert.equal(wikiCalls.filter((x) => x === '无资料的人').length, 1);
    assert.equal(wikiCalls.filter((x) => x === '原创角色').length, 1);
    const before = wikiCalls.length;
    offline = true;
    assert.equal(
      (await source.speakerPortrait(refs, '原创角色', 7))?.portrait?.status,
      'original',
    );
    assert.equal(wikiCalls.length, before);
    await assert.rejects(
      () => source.speakerPortrait(refs, '原创角色', 7, true),
      (error: unknown) =>
        error instanceof ReaderError && error.code === 'network',
    );
  } finally {
    new CacheCoordinator(root).close();
    await rm(root, { recursive: true, force: true });
  }
});
