import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { parsePrtsChapter } from '../src/data/prts-script.js';
import { PrtsSource } from '../src/data/prts.js';
import {
  chapterContentKind,
  chapterWords,
  countText,
  storyProgress,
} from '../src/domain/reading.js';
import { readingLayout } from '../src/domain/revisions.js';
import { ReaderService } from '../src/server/service.js';
import { CacheCoordinator } from '../src/storage/cache-coordinator.js';
import { WordCountStore } from '../src/storage/word-counts.js';
import type { Chapter, Leaf } from '../src/shared/contracts.js';

const meta = {
  id: 'prts:原创/BEG',
  storyId: 'prts:原创',
  title: '原创',
  pageTitle: '原创/BEG',
  group: '原创',
};
const wiki = (s: string) =>
  `{{剧情模拟器|文本路径=original/compat|剧情分组=原创|文本数据=\n${s}\n}}\n{{剧情导航}}`;
const parse = (s: string) => parsePrtsChapter(wiki(s), meta);
const leaves = (p: Chapter): Leaf[] =>
  p.blocks.flatMap((b) =>
    b.kind === 'choices'
      ? [
          ...b.options.flatMap((o) => o.blocks),
          ...(b.shared ?? []).flatMap((g) => g.blocks),
        ]
      : [b],
  );

test('multiline and keyed captions concatenate once across stage effects and preserve explicit line breaks', () => {
  const p = parse(`[Character(name="first")]
[multiline(name="匿名")]前半
[Delay(time=2)]
[Character(name="second")]
[multiline(name="匿名",end=true)]后半。\\n下一行。
[Sticker(id="a",multi=true,text="<i>纸条</i>")]
[Delay(time=1)]
[Sticker(id="a",multi=true,text="\\n第二行。")]
[Sticker(id="b",multi=true,text="另一张。")]
[Sticker(id="b")]
[name="同伴"]回复。`);
  const text = leaves(p);
  assert.deepEqual(
    text.map((b) =>
      b.kind === 'speech'
        ? b.paragraphs
        : b.kind === 'narration'
          ? b.text
          : b.kind,
    ),
    [['前半后半。\n下一行。'], '纸条\n第二行。', '另一张。', ['回复。']],
  );
  const speech = text[0];
  assert.ok(speech?.kind === 'speech');
  assert.deepEqual(
    speech.scene?.slots,
    [],
    'different scene fragments must not guess a portrait',
  );
  assert.equal(
    chapterWords(p),
    countText('前半后半。下一行。纸条第二行。另一张。回复。'),
  );
});

test('visible animated and spell text survives; visual cleanup and hidden log repeats add no words', () => {
  const p = parse(`[animtext(id="a")]<p=1>地点</><p=2><b>时间</b></>
[animtextclean]
[spellsticker(id="s",action="show")]<p=1>风停。</><p=2>Still.</>
[spellsticker(id="s",action="hide")]
[Subtitle(text="隐藏重复",hidelog=true)]
[gridbg(imagegroup="one/two")]
[verticalbg(imagegroup="one/two")]
[largebg(imagegroup="one/two")]`);
  assert.equal(chapterWords(p), countText('地点时间风停。Still.'));
  assert.throws(() => parse('[animtext(id="x")]没有可识别的分段'), /分段格式/);
  assert.throws(() => parse('[FutureText(text="不能丢弃")]'), /尚未支持/);
});

test('prefixed source notes stay outside the body; ambiguous simulators and wrong groups still fail', () => {
  const p = parsePrtsChapter(
    '说明文字，不是正文。\n{{提示|其他内容}}\n' + wiki('正文。'),
    meta,
  );
  assert.equal(chapterWords(p), 3);
  assert.throws(
    () => parsePrtsChapter(wiki('正文。') + wiki('另一段。'), meta),
    /字段/,
  );
  assert.throws(
    () => parsePrtsChapter(wiki('正文。'), { ...meta, group: '错误' }),
    /字段/,
  );
});

test('duplicate values, surplus values and unresolved predicates keep all text without invented option labels or leaked scenes', () => {
  const p = parse(`[Character(name="base")]
[Decision(options="甲;乙",values="1;1;3")]
[Predicate(references="1;1")]
[multiline(name="匿名")]共同
[multiline(name="匿名",end=true)]回答。
[Predicate(references="17")]
[name="匿名"]来源条件异常的正文。
[Predicate]
[name="匿名"]共同结尾。`);
  assert.equal(
    chapterWords(p),
    countText('甲乙共同回答。来源条件异常的正文。共同结尾。'),
  );
  assert.ok(p.diagnostics?.some((d) => d.message.includes('17')));
  assert.ok(p.diagnostics?.some((d) => d.message.includes('多余')));
  const unresolved = leaves(p).find(
    (b) => b.kind === 'speech' && b.paragraphs[0]?.includes('来源条件'),
  );
  assert.ok(unresolved?.kind === 'speech');
  assert.deepEqual(unresolved.scene?.slots, []);
  assert.equal(
    leaves(p).filter(
      (b) => b.kind === 'speech' && b.paragraphs.includes('共同结尾。'),
    ).length,
    1,
  );
});

test('reviewed source typos remain diagnosed no-ops; duplicate parameters and case-insensitive slots follow source semantics', () => {
  const p = parse(`[Character(name="old",name="new")]
[daley(time=1)]
[charslsot]
[name="甲"]第一句。
[CharSlot(slot="L",name="left")]
[CharSlot(slot="all",focus="all")]
[name="乙"]第二句。
[warp(name="absent")]`);
  assert.equal(p.diagnostics?.length, 3);
  const first = p.blocks[0];
  assert.ok(first?.kind === 'speech');
  assert.deepEqual(first.scene?.slots, [{ slot: 'm', resource: 'new' }]);
  assert.throws(() => parse('[daley(text="疑似正文")]\n正文。'), /尚未支持/);
  assert.throws(
    () => parse('[warp(name="target")]\n[Label(name="target")]\n正文。'),
    /Warp/,
  );
});

test('video-only and mixed chapters have explicit source blocks and text-only counts', () => {
  const video = parse('[Video(res="video/source.mp4")]');
  assert.equal(chapterContentKind(video), 'video');
  assert.equal(chapterWords(video), 0);
  assert.equal(video.blocks[0]?.kind, 'video');
  const mixed = parse('前文。\n[Video(res="video/source.mp4")]\n后文。');
  assert.equal(chapterContentKind(mixed), 'mixed');
  assert.equal(chapterWords(mixed), 6);
  const story = {
    id: meta.storyId,
    title: '原创',
    category: '测试',
    type: '测试',
    coverLabel: 'TEST',
    source: 'prts' as const,
    chapters: [
      {
        id: meta.id,
        title: '视频',
        code: '1',
        wordCount: 0,
        contentKind: 'video' as const,
      },
    ],
  };
  assert.equal(storyProgress(story, {}), null);
});

test('old cached scripts reparse offline on demand; prefetch never changes records, actual reading migrates anchors and clear preserves both stores', async () => {
  const base = path.resolve('.ai/local/compat-tests');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, 'upgrade-'));
  try {
    const source = new PrtsSource(root, async () => {
      throw new Error('Must stay offline');
    });
    const p = parse('[name="甲"]前行。\\n后行。');
    const first = p.blocks[0];
    assert.ok(first?.kind === 'speech');
    const old: Chapter = {
      ...p,
      revision: p.revision.replace('v4:', 'v1:'),
      blocks: [{ ...first, paragraphs: ['前行。\\n后行。'] }],
    };
    const story = {
      id: meta.storyId,
      title: '原创',
      category: '测试',
      type: '测试',
      coverLabel: 'TEST',
      source: 'prts' as const,
      chapters: [{ id: meta.id, title: '原创', code: '1', wordCount: null }],
    };
    source.catalog = async () => [story];
    const service = new ReaderService(source, root);
    await service.cache.put(old);
    new WordCountStore(root).put(
      {
        chapterId: old.id,
        storyId: old.storyId,
        revision: old.revision,
        wordCount: 8,
      },
      undefined,
    );
    await service.records.change((state) => ({
      ...state,
      recentChapterId: old.id,
      records: {
        [old.id]: {
          chapterId: old.id,
          storyId: old.storyId,
          revision: old.revision,
          last: { blockId: first.id, fraction: 0.5 },
          furthestWords: 4,
          complete: false,
          totalWords: 8,
          layout: readingLayout(old),
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      },
    }));
    const before = await service.records.read();
    const snapshot = await service.snapshot();
    assert.equal(
      storyProgress(snapshot.stories[0] ?? story, before.records),
      null,
    );
    const count = await service.prepareChapter(old.id);
    assert.equal(count.wordCount, 6);
    assert.deepEqual(await service.records.read(), before);
    const opened = await service.chapter(old.id);
    assert.match(opened.revision, /v4:/);
    const after = await service.records.read();
    assert.equal(
      after.records[old.id]?.updatedAt,
      before.records[old.id]?.updatedAt,
    );
    assert.equal(after.recentChapterId, before.recentChapterId);
    await service.call('reader_clear_cache', { scope: 'all' });
    assert.deepEqual(await service.records.read(), after);
    assert.equal(new WordCountStore(root).all().get(old.id)?.wordCount, 6);
  } finally {
    new CacheCoordinator(root).close();
    await rm(root, { recursive: true, force: true });
  }
});
