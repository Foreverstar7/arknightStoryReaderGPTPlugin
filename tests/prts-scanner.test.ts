import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsePrtsChapter } from '../src/data/prts-script.js';
import { requiresComplexFlow } from '../src/data/prts-flow.js';
import { scanScript } from '../src/data/prts-scanner.js';
import { ReaderError } from '../src/shared/errors.js';

const meta = {
  id: 'prts:扫描/BEG',
  storyId: 'prts:扫描',
  title: '原创扫描样例',
  pageTitle: '扫描/BEG',
};
const parse = (script: string) =>
  parsePrtsChapter(
    `{{剧情模拟器|文本路径=original/scan|剧情分组=原创|文本数据=\n${script}\n}}\n{{剧情导航}}`,
    meta,
  );

test('flow selection distinguishes closed simple choices from nested, reopened and overlapping source paths', () => {
  const decision = '[Decision(options="北;南",values="1;2")]';
  for (const [script, complex] of [
    [
      `${decision}\n[Predicate(references="2")]\n[Predicate]\n${decision}`,
      false,
    ],
    [`${decision}\n[Predicate(references="1;2")]`, false],
    [`${decision}\n[Predicate(references="1")]\n${decision}`, true],
    [`${decision}\n[Predicate]\n[Predicate(references="1")]`, true],
    [`${decision}\n[Predicate(references="1;1")]`, true],
    [`${decision}\n[Predicate(references="3")]`, true],
    ['[Decision(options="北;南",values="1;1")]', true],
    ['[Decision(options="北;南",values="1;2;3")]', true],
    ['[Predicate]', true],
  ] satisfies [string, boolean][]) {
    assert.equal(
      requiresComplexFlow(scanScript(script, meta.pageTitle).instructions),
      complex,
      script,
    );
  }
});

test('scanning keeps quoted delimiters, duplicate parameters, source-relative diagnostics and paragraph separators', () => {
  const chapter = parse(`[Character(name="old",name="new")]
[name="带]逗,号"]第一段。
[name="带]逗,号"]第二段。

// 空行及注释隔开发言
[name="带]逗,号"]第三段。
[Charactercutin(fadestyle:1)]
[daley(time=1)]
[Notice]仍是正文。`);
  assert.deepEqual(
    chapter.blocks.map((block) =>
      block.kind === 'speech'
        ? block.paragraphs
        : block.kind === 'narration'
          ? block.text
          : block.kind,
    ),
    [['第一段。', '第二段。'], ['第三段。'], '[Notice]仍是正文。'],
  );
  const first = chapter.blocks[0];
  assert.ok(first?.kind === 'speech');
  assert.equal(first.name, '带]逗,号');
  assert.deepEqual(first.scene?.slots, [{ slot: 'm', resource: 'new' }]);
  assert.deepEqual(
    chapter.diagnostics?.map(({ line }) => line),
    [7, 8],
  );
});

test('a later malformed field never displaces the earlier source error in either projection', () => {
  for (const [script, line, message] of [
    [
      '[FutureText(text="不能丢失")]\n[name="坏',
      1,
      '尚未支持的脚本指令 futuretext。',
    ],
    [
      '[Predicate(references="bad")]\n[name="坏',
      1,
      'Predicate 引用了没有可对应 Decision 的选项。',
    ],
    [
      '[Decision(options="北;南",values="1;2")]\n[Predicate(references="bad")]\n[name="坏',
      2,
      'Predicate 的条件值格式不兼容。',
    ],
    [
      '[Decision(options="北;南",values="1;2")]\n[Predicate(references="")]\n[name="坏',
      2,
      'Predicate 的 references 为空，无法确定分支。',
    ],
    ['前文。\n// 间隔\n[name="坏', 3, '指令缺少结束方括号。'],
    [
      '[Decision(options="北;南",values="1")]',
      1,
      '选项与 values 不匹配或包含不支持的值。',
    ],
    ['[Delay(constructor="bad")]\n正文。', 1, '不支持的参数名称。'],
  ] satisfies [string, number, string][]) {
    assert.throws(
      () => parse(script),
      (error: unknown) => {
        assert.ok(error instanceof ReaderError);
        assert.equal(error.code, 'parse');
        assert.equal(
          error.message,
          `PRTS「扫描/BEG」第 ${line} 行：${message} 原始文本未作为正文展示。`,
        );
        return true;
      },
    );
  }
});

test('source-wide Warp and terminal GotoPage validation still sees lines beyond a malformed field', () => {
  assert.throws(
    () => parse('[Warp(name="target")]\n[name="坏\n[Label(name="target")]'),
    /第 1 行：存在需要核对的 Warp\/Label 控制流/u,
  );
  assert.throws(
    () => parse('正文。\n[GotoPage(dest="home")]\n[name="坏'),
    /第 2 行：尚未支持的页面跳转或非末尾 GotoPage/u,
  );
  assert.equal(
    parse('正文。\n[GotoPage(dest="home")]\n// 末尾注释\n').blocks.length,
    1,
  );
});
