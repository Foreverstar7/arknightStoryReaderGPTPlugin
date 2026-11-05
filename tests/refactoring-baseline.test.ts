import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  chapterFingerprint,
  compareFingerprints,
  fingerprint,
  sourceWordCensus,
} from '../scripts/refactoring-fingerprint.js';
import { parsePrtsChapter } from '../src/data/prts-script.js';
import { chapterWords } from '../src/domain/reading.js';

const wiki = `{{剧情模拟器|文本路径=original/baseline|剧情分组=原创|文本数据=
[Character(name="unit")]
[name="甲"]到达。
[Decision(options="前进;等待",values="1;2")]
[Predicate(references="1")]
[name="甲"]前进。
[Predicate(references="2")]
[name="甲"]等待。
[Predicate]
[cgitem(image="original",pto="-20,30",sto=0.5)]
[name="甲"]汇合。
}}
{{剧情导航}}`;
const sample = parsePrtsChapter(wiki, {
  id: 'prts:原创',
  storyId: 'prts:原创',
  title: '原创',
  pageTitle: '原创',
});

test('baseline catches prose, ID, scene, CG geometry and branch order changes even with equal word counts', () => {
  const before = { sample: chapterFingerprint(sample, chapterWords(sample)) };
  assert.deepEqual(compareFingerprints(before, { ...before }), []);
  assert.equal(fingerprint({ a: 1, b: 2 }), fingerprint({ b: 2, a: 1 }));
  const changes = [
    (chapter: typeof sample) => {
      const speech = chapter.blocks.find((block) => block.kind === 'speech');
      assert.ok(speech?.kind === 'speech');
      speech.paragraphs[0] = '离开。';
    },
    (chapter: typeof sample) => {
      chapter.blocks[0] && (chapter.blocks[0].id += '-changed');
    },
    (chapter: typeof sample) => {
      const speech = chapter.blocks.find((block) => block.kind === 'speech');
      assert.ok(speech?.kind === 'speech' && speech.scene?.slots[0]);
      speech.scene.slots[0].resource = 'another';
    },
    (chapter: typeof sample) => {
      const cg = chapter.blocks.find((block) => block.kind === 'cg');
      assert.ok(cg?.kind === 'cg' && cg.composition?.layers[0]);
      cg.composition.layers[0].x += 1;
    },
    (chapter: typeof sample) => {
      const choices = chapter.blocks.find((block) => block.kind === 'choices');
      assert.ok(choices?.kind === 'choices');
      choices.options.reverse();
    },
  ];
  for (const change of changes) {
    const modified = structuredClone(sample);
    change(modified);
    assert.equal(chapterWords(modified), chapterWords(sample));
    assert.deepEqual(
      compareFingerprints(before, {
        sample: chapterFingerprint(modified, chapterWords(modified)),
      }),
      ['sample'],
    );
  }
  assert.deepEqual(compareFingerprints(before, {}), ['sample']);
  assert.deepEqual(compareFingerprints({}, before), ['sample']);
});

test('independent census includes options and each branch once and flags unclassified source tails', () => {
  assert.deepEqual(sourceWordCensus(wiki), { words: 16, unclassified: [] });
  assert.equal(chapterWords(sample), 16);
  assert.ok(
    sourceWordCensus(wiki.replace('[name="甲"]到达。', '[future]新文本'))
      .unclassified.length,
  );
});
