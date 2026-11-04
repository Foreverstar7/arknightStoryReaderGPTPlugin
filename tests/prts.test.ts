import { CacheCoordinator } from '../src/storage/cache-coordinator.js';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import {
  parsePrtsCatalog,
  PRTS_STORY_ID,
  chapterIdForPage,
} from '../src/data/prts-catalog.js';
import { parsePrtsChapter } from '../src/data/prts-script.js';
import { readPrtsWiki } from '../src/data/prts-client.js';
import { PrtsSource } from '../src/data/prts.js';
import { ReaderError } from '../src/data/source.js';
import {
  chapterProgress,
  chapterWords,
  countText,
  storyProgress,
} from '../src/domain/reading.js';
import { ReaderService } from '../src/server/service.js';
import { PrtsCatalogCache } from '../src/storage/prts-catalog.js';

// Original test prose; syntax based on the public samples documented in docs/prts-s2.md.
const rootWiki = '{{剧情导航|nocat=yes}}';
const pages = ['GT-1 取样/BEG', 'GT-1 取样/END'];
const navigationWiki = `{| class="wikitable"
! [[剧情一览|活动剧情一览]]
|-
! width="120px"|骑兵与猎人
! width="40px"|支线
| ${pages.map((page) => `[[${page}|${page.replace('/BEG', ' 行动前').replace('/END', ' 行动后')}]]`).join('{{dot}}')}
|}
{{Navbox|重复页脚|[[错误入口/BEG|不要重复收录]]}}`;
const meta = {
  id: chapterIdForPage(pages[0] ?? ''),
  storyId: PRTS_STORY_ID,
  title: '原创语法测试',
  pageTitle: pages[0] ?? '',
  group: '骑兵与猎人',
};
function wiki(script: string) {
  return `{{剧情模拟器|图片数据={{Widget:Data_Image}}|文本路径=original/parser-test|剧情类型=支线|剧情分组=骑兵与猎人|文本数据=\n${script}\n}}\n{{剧情导航}}`;
}
async function temporary(run: (root: string) => Promise<void>) {
  const base = path.resolve('.ai/local/test-data');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, 'prts-'));
  try {
    await run(root);
  } finally {
    new CacheCoordinator(root).close();
    await rm(root, { recursive: true, force: true });
  }
}

test('catalog uses the body row in source order, excludes footer duplication, and never invents denominators', () => {
  const story = parsePrtsCatalog(rootWiki, navigationWiki)[0];
  assert.ok(story);
  assert.deepEqual(
    story.chapters.map((chapter) => chapter.id),
    pages.map(chapterIdForPage),
  );
  assert.ok(
    story.chapters.every(
      (chapter) =>
        chapter.wordCount === null &&
        chapter.sourceUrl?.startsWith('https://prts.wiki/w/'),
    ),
  );
  assert.equal(storyProgress(story, {}), null);
  assert.equal(chapterProgress(story, story.chapters[0]?.id ?? '', {}, 120), 0);
  assert.throws(() => parsePrtsCatalog('改版了', navigationWiki), /目录结构/);
  assert.equal(
    parsePrtsCatalog(
      rootWiki,
      navigationWiki.replaceAll('骑兵与猎人', '其他活动'),
    )[0]?.title,
    '其他活动',
  );
  assert.throws(
    () =>
      parsePrtsCatalog(
        rootWiki,
        navigationWiki.replaceAll('[[GT-1 取样/END|', '[[GT-1 取样/BEG|'),
      ),
    /重复篇目/,
  );
});

test('speech grouping, anonymous names, bracket narration, scene references and commands are parsed without executing source', () => {
  const chapter = parsePrtsChapter(
    wiki(`[HEADER(key="test")] 不计标题
[Character(name="avg_a#1$2", name2="avg_b", focus=2)]
[name="？？？"]第一段[线索]。
[name="？？？"]第二段。
[Dialog]
[delay=0.5]
[name=""]旁白。
【原样符号】[方括号内容]
[Image(image="scene_1")]
[PlaySound(key="$example")]
[name="带]括号的名字"]有逗号，仍是正文。`),
    meta,
  );
  const first = chapter.blocks[0];
  assert.equal(first?.kind, 'speech');
  if (first?.kind !== 'speech') return;
  assert.equal(first.name, '？？？');
  assert.deepEqual(first.paragraphs, ['第一段[线索]。', '第二段。']);
  assert.equal(first.portrait, undefined);
  assert.deepEqual(first.scene, {
    slots: [
      { slot: 'l', resource: 'avg_a#1$2' },
      { slot: 'r', resource: 'avg_b' },
    ],
    focus: 2,
  });
  assert.ok(
    chapter.blocks.some(
      (block) => block.kind === 'cg' && block.resource === 'scene_1',
    ),
  );
  assert.ok(!JSON.stringify(chapter.blocks).includes('不计标题'));
  assert.ok(!JSON.stringify(chapter.blocks).includes('delay'));
  assert.ok(chapter.original?.wiki.includes('[PlaySound'));
  assert.deepEqual(
    parsePrtsChapter(wiki(`[name="甲"]同一句。`), meta).blocks,
    parsePrtsChapter(wiki(`[Delay(time=9)]\n[name="甲"]同一句。`), meta).blocks,
  );
});

test('mutually exclusive branches isolate scenes; subset and common continuations are each counted once', () => {
  const chapter = parsePrtsChapter(
    wiki(`[Character(name="base")]
[Decision(options="走北边;走南边;等消息", values="1;2;3")]
[Predicate(references="1")]
[Character(name="branch_north")]
[name="？？？"]北边回话。
[Predicate(references="2")]
[name="乙"]南边回话。
[Predicate(references="1;2")]
[name="信使"]两边共有的信息。
[Predicate(references="3")]
[name="丙"]原地等待。
[Predicate(references="1;2;3")]
[name="旁观者"]共同后续。
[name="旁观者"]第二句。`),
    meta,
  );
  const choice = chapter.blocks[0];
  assert.ok(choice?.kind === 'choices');
  const secondBranch = choice.options[1]?.blocks[0];
  assert.ok(secondBranch?.kind === 'speech');
  assert.deepEqual(secondBranch.scene?.slots, [
    { slot: 'm', resource: 'base' },
  ]);
  const common = chapter.blocks[1];
  assert.ok(common?.kind === 'speech');
  assert.deepEqual(common.scene?.slots, []);
  assert.equal(choice.shared?.[0]?.blocks.length, 1);
  assert.equal(chapter.blocks.length, 2);
  assert.equal(
    chapterWords(chapter),
    countText(
      '走北边走南边等消息北边回话。南边回话。两边共有的信息。原地等待。共同后续。第二句。',
    ),
  );
});

test('slot-only visual changes retain resources and clearing one slot does not leak across branches', () => {
  const chapter = parsePrtsChapter(
    wiki(`[Character(name="unit_a",name2="unit_b",focus=2)]
[CharSlot(slot="left",afrom=1,ato=0.5)]
[name="？？？"]保留匿名显示名。
[CharSlot(slot="right",name="char_empty")]
[name="甲"]右侧已清空。
[Character(name="char_empty")]
[name="乙"]所有槽位清空。`),
    meta,
  );
  const first = chapter.blocks[0];
  const second = chapter.blocks[1];
  const third = chapter.blocks[2];
  assert.ok(
    first?.kind === 'speech' &&
      second?.kind === 'speech' &&
      third?.kind === 'speech',
  );
  assert.deepEqual(first.scene, {
    slots: [
      { slot: 'l', resource: 'unit_a' },
      { slot: 'r', resource: 'unit_b' },
    ],
    focus: 2,
  });
  assert.deepEqual(second.scene?.slots, [{ slot: 'l', resource: 'unit_a' }]);
  assert.deepEqual(third.scene?.slots, []);
});

test('single and all-options predicates merge immediately; unknown commands and predicates without a decision fail visibly', () => {
  const chapter = parsePrtsChapter(
    wiki(`[Decision(options="继续",values="1")]
[Predicate(references="1")]
[name="甲"]第一句。
[Decision(options="前进;等候",values="1;2")]
[Predicate(references="1;2")]
[name="甲"]合流只出现一次。`),
    meta,
  );
  assert.equal(
    chapter.blocks.filter((block) => block.kind === 'speech').length,
    2,
  );
  for (const script of [
    '[Predicate(references="1")]\n[name="甲"]没有选项来源。',
    '[UnknownControl(value="1")]',
    '[name="破损"',
  ])
    assert.throws(() => parsePrtsChapter(wiki(script), meta), ReaderError);
});

test('last duplicate parameter follows the source player; only terminal return-home markers are supported', () => {
  const chapter = parsePrtsChapter(
    wiki(`[Background(screenadapt="coverall",image="room",screenadapt="coverall")]
[name="甲"]独立样例。
[GotoPage(dest="home")]`),
    meta,
  );
  assert.equal(chapterWords(chapter), countText('独立样例。'));
  for (const script of [
    '[GotoPage(dest="other")]\n[name="甲"]错误目的地。',
    '[name="甲"]起点。\n[GotoPage(dest="home")]\n[name="甲"]跳转后有内容。',
  ])
    assert.throws(() => parsePrtsChapter(wiki(script), meta), ReaderError);
});

test('conditional decisions preserve source order, independent portraits and a single shared continuation without counting condition labels twice', () => {
  const chapter = parsePrtsChapter(
    wiki(`[Character(name="base")]
[Decision(options="北;南",values="1;2")]
[Predicate(references="1")]
[Character(name="north")]
[name="匿名"]北前。
[Decision(options="问;等",values="4;5")]
[Predicate(references="4")]
[CharSlot(slot="m",name="child")]
[name="匿名"]问答。
[Predicate(references="5")]
[name="匿名"]等答。
[Predicate(references="2")]
[name="匿名"]南前。
[Decision(options="走;留",values="7;8")]
[Predicate(references="7")]
[name="匿名"]走答。
[Predicate(references="8")]
[name="匿名"]留答。
[Predicate(references="4;5;7;8")]
[name="匿名"]共同结尾。`),
    meta,
  );
  const leaves = chapter.blocks.flatMap((block) =>
    block.kind === 'choices'
      ? [
          ...block.options.flatMap((option) => option.blocks),
          ...(block.shared ?? []).flatMap((group) => group.blocks),
        ]
      : [block],
  );
  const speech = leaves.filter((leaf) => leaf.kind === 'speech');
  assert.deepEqual(
    speech.map((leaf) => leaf.paragraphs.join('')),
    ['北前。', '问答。', '等答。', '南前。', '走答。', '留答。', '共同结尾。'],
  );
  assert.deepEqual(
    speech.map((leaf) => leaf.scene?.slots.map((slot) => slot.resource)),
    [['north'], ['child'], ['north'], ['base'], ['base'], ['base'], []],
  );
  assert.equal(
    chapterWords(chapter),
    countText('北南问等走留北前。问答。等答。南前。走答。留答。共同结尾。'),
  );
  assert.deepEqual(
    chapter.blocks.flatMap((block) =>
      block.kind === 'choices' && block.when ? [block.when] : [],
    ),
    [['北'], ['南']],
  );
  assert.match(chapter.revision, /^prts-script-v4:/);
});

test('consecutive predicates and reused decision values retain all dialogue and conservative shared scenes', () => {
  const chapter = parsePrtsChapter(
    wiki(`[Decision(options="甲路;乙路",values="1;2")]
[Predicate(references="1")]
[Character(name="first")]
[name="甲"]甲路正文。
[Predicate(references="2")]
[Character(name="second")]
[name="乙"]乙路正文。
[Decision(options="再问",values="1")]
[Predicate(references="1")]
[name="甲"]两路都能到达。
[Decision(options="往前;停留",values="1;2")]
[Predicate(references="1;2")]
[Predicate(references="1")]
[name="甲"]往前正文。
[Predicate(references="2")]
[name="乙"]停留正文。
[Predicate(references="1;2")]
[name="甲"]终点。`),
    meta,
  );
  assert.equal(
    chapterWords(chapter),
    countText(
      '甲路乙路甲路正文。乙路正文。再问两路都能到达。往前停留往前正文。停留正文。终点。',
    ),
  );
  const common = chapter.blocks.find(
    (block) =>
      block.kind === 'speech' && block.paragraphs.includes('两路都能到达。'),
  );
  assert.ok(common?.kind === 'speech');
  assert.deepEqual(common.scene?.slots, []);
});

test('native HTTP boundary distinguishes not found, network/HTTP failures and incompatible MIME', async () => {
  for (const [status, expected] of [
    [404, 'not_found'],
    [403, 'network'],
    [503, 'network'],
  ] as const) {
    await assert.rejects(
      () => readPrtsWiki('公开页', async () => new Response('', { status })),
      (error: unknown) =>
        error instanceof ReaderError && error.code === expected,
    );
  }
  await assert.rejects(
    () =>
      readPrtsWiki('公开页', async () => new Response('<html>错误页面</html>')),
    (error: unknown) => error instanceof ReaderError && error.code === 'parse',
  );
  await assert.rejects(
    () =>
      readPrtsWiki('公开页', async () => {
        throw new Error('offline');
      }),
    (error: unknown) =>
      error instanceof ReaderError && error.code === 'network',
  );
});

test('on-demand PRTS cache, restart/resume, weighted known totals and cache clearing preserve independent reading records', async () =>
  temporary(async (root) => {
    const requested: string[] = [];
    let offline = false;
    const source = new PrtsSource(root, async (title) => {
      requested.push(title);
      if (offline) throw new ReaderError('network', '测试断网');
      if (title === '剧情一览') return rootWiki;
      if (title === '模板:剧情导航') return navigationWiki;
      return wiki(
        title === pages[0]
          ? '[name="甲"]短文。'
          : '[name="乙"]这是较长的另一篇正文。',
      );
    });
    const service = new ReaderService(source, root);
    await service.snapshot();
    assert.deepEqual(requested, ['剧情一览', '模板:剧情导航']);
    const chapter = await service.chapter(meta.id);
    const start = chapter.blocks[0];
    assert.ok(start);
    await service.record({
      chapterId: chapter.id,
      revision: chapter.revision,
      last: { blockId: start.id, fraction: 1 },
      atEnd: true,
    });
    assert.equal(requested.length, 3);
    const snapshot = await service.snapshot();
    const story = snapshot.stories[0];
    assert.ok(story);
    assert.equal(
      snapshot.state.records[chapter.id]?.totalWords,
      chapterWords(chapter),
    );
    assert.equal(storyProgress(story, snapshot.state.records), null);
    offline = true;
    const restarted = new ReaderService(
      new PrtsSource(root, async () => {
        throw new ReaderError('network', '测试断网');
      }),
      root,
    );
    assert.equal(
      (await restarted.snapshot()).state.recentChapterId,
      chapter.id,
    );
    assert.equal(
      (await restarted.chapter(chapter.id)).revision,
      chapter.revision,
    );
    await assert.rejects(() => restarted.chapter(chapter.id, true), /测试断网/);
    assert.equal(
      (await restarted.chapter(chapter.id)).revision,
      chapter.revision,
    );
    const before = await restarted.records.read();
    await restarted.call('reader_clear_cache', { scope: 'all' });
    assert.deepEqual(await restarted.records.read(), before);
    // Clearing content must not make a later scroll/save silently re-download it.
    await restarted.record({
      chapterId: chapter.id,
      revision: chapter.revision,
      last: { blockId: start.id, fraction: 0 },
      atEnd: false,
    });
    assert.equal(
      (await restarted.records.read()).records[chapter.id]?.complete,
      true,
    );
    await assert.rejects(() => restarted.snapshot(), /测试断网/);
    offline = false;
    const second = await service.chapter(chapterIdForPage(pages[1] ?? ''));
    const first = second.blocks[0];
    assert.ok(first);
    await service.record({
      chapterId: second.id,
      revision: second.revision,
      last: { blockId: first.id, fraction: 0 },
      atEnd: false,
    });
    const known = await service.snapshot();
    assert.equal(
      storyProgress(story, known.state.records),
      Math.floor(
        (chapterWords(chapter) /
          (chapterWords(chapter) + chapterWords(second))) *
          100,
      ),
    );
  }));

test('public catalog cache expires by last access, separately from reading records', async () =>
  temporary(async (root) => {
    let now = 1_000_000;
    const cache = new PrtsCatalogCache(root, () => now);
    await cache.put({ rootWiki, navigationWiki });
    now += 6 * 86_400_000;
    assert.ok(await cache.get(7));
    now += 6 * 86_400_000;
    assert.ok(await cache.get(7));
    now += 8 * 86_400_000;
    assert.equal(await cache.get(7), null);
  }));
