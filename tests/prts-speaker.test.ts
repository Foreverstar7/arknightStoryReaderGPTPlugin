import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsePrtsChapter } from '../src/data/prts-script.js';
import { chapterSpeakerBindings } from '../src/data/prts-speaker.js';

function parse(script: string) {
  return parsePrtsChapter(
    `{{剧情模拟器|图片数据={{Widget:Data_Image}}|文本路径=original/speaker-test|剧情类型=支线|剧情分组=原创测试|文本数据=\n${script}\n}}\n{{剧情导航}}`,
    {
      id: 'prts:original',
      storyId: 'original',
      title: '原创测试',
      pageTitle: '原创测试',
    },
  );
}
function speeches(chapter: ReturnType<typeof parse>) {
  return chapter.blocks.filter((block) => block.kind === 'speech');
}

test('same-chapter single-resource speech corroborates a matching mixed-scene portrait without using focus or a name exception', () => {
  const chapter = parse(
    '[Character(name="char_900_reader#2")]\n[name="值班人员"]请进。\n[Character(name="char_901_other",name2="char_900_reader#4",focus=1)]\n[name="值班人员"]这边走。',
  );
  const [single, multiple] = speeches(chapter);
  assert.ok(single && multiple);
  assert.deepEqual(chapterSpeakerBindings(chapter).get(multiple.id), {
    reference: 'char_900_reader#4',
    default: false,
    evidenceBlocks: [single.id],
  });
});

test('conflicting single-scene identities, different costumes, absent resources and anonymous labels stay unconfirmed', () => {
  for (const extra of [
    '[Character(name="char_902_third")]\n[name="值班人员"]另一个人。',
    '[Character(name="char_900_reader$2")]\n[name="值班人员"]另一个造型。',
  ]) {
    const chapter = parse(
      `[Character(name="char_900_reader")]\n[name="值班人员"]请进。\n${extra}\n[Character(name="char_901_other",name2="char_900_reader")]\n[name="值班人员"]这边走。`,
    );
    assert.equal(chapterSpeakerBindings(chapter).size, 0);
  }
  for (const name of ['？？？', '？？？（女性）']) {
    const chapter = parse(
      `[Character(name="char_900_reader")]\n[name="${name}"]请进。\n[Character(name="char_901_other",name2="char_900_reader")]\n[name="${name}"]这边走。`,
    );
    assert.equal(chapterSpeakerBindings(chapter).size, 0);
  }
  const chapter = parse(
    '[Character(name="char_900_reader")]\n[name="值班人员"]请进。\n[Character(name="char_901_other",name2="char_902_third")]\n[name="值班人员"]这边走。',
  );
  assert.equal(chapterSpeakerBindings(chapter).size, 0);
});

test('multiple expressions of one confirmed resource group use its sourced default, keeping explicit body identity', () => {
  const chapter = parse(
    '[Character(name="char_900_reader#4$2")]\n[name="值班人员"]请进。\n[Character(name="char_900_reader#2$2",name2="char_900_reader#5$2")]\n[name="值班人员"]这边走。',
  );
  const multiple = speeches(chapter).at(-1);
  assert.ok(multiple);
  assert.equal(
    chapterSpeakerBindings(chapter).get(multiple.id)?.reference,
    'char_900_reader$2',
  );
  assert.equal(chapterSpeakerBindings(chapter).get(multiple.id)?.default, true);
});

test('speaker evidence is never transferred between mutually exclusive branch containers or into their common continuation', () => {
  const chapter = parse(
    '[Decision(options="甲;乙",values="1;2")]\n[Predicate(references="1")]\n[Character(name="char_900_reader")]\n[name="值班人员"]请进。\n[Predicate(references="2")]\n[Character(name="char_901_other",name2="char_900_reader")]\n[name="值班人员"]这边走。\n[Predicate]\n[Character(name="char_901_other",name2="char_900_reader")]\n[name="值班人员"]继续。',
  );
  assert.equal(chapterSpeakerBindings(chapter).size, 0);
});

test('a reaction over another consistently anchored speaker does not poison independently shown identity', () => {
  const chapter = parse(
    '[Character(name="char_900_reader",name2="char_901_other",focus=1)]\n[name="访客"]请问有人吗？\n[Character(name="char_901_other")]\n[name="访客"]我在门口。\n[Character(name="char_900_reader")]\n[name="值班人员"]请进。\n[name="访客"]谢谢。\n[name="值班人员"]这边走。',
  );
  const [mixed, own, , reaction] = speeches(chapter);
  assert.ok(mixed && own && reaction);
  const bindings = chapterSpeakerBindings(chapter);
  assert.deepEqual(bindings.get(mixed.id), {
    reference: 'char_901_other',
    default: false,
    evidenceBlocks: [own.id],
  });
  assert.deepEqual(bindings.get(reaction.id), {
    reference: 'char_901_other',
    default: false,
    evidenceBlocks: [own.id],
    absentFromScene: true,
  });
});

test('an unconfirmed or anonymous image owner cannot explain away conflicting identities', () => {
  for (const name of ['？？？', '另一位访客']) {
    const chapter = parse(
      `[Character(name="char_901_other")]\n[name="访客"]我在门口。\n[Character(name="char_900_reader")]\n[name="${name}"]请进。\n[name="访客"]谢谢。\n[Character(name="char_902_third")]\n[name="${name}"]另一张图。\n[Character(name="char_900_reader",name2="char_901_other")]\n[name="访客"]继续。`,
    );
    const mixed = speeches(chapter).at(-1);
    assert.ok(mixed);
    assert.equal(chapterSpeakerBindings(chapter).get(mixed.id), undefined);
  }
});

test('a missing image context only gets a default after an independent single-speaker identity is confirmed', () => {
  const chapter = parse(
    '[Character(name="char_901_other")]\n[name="访客"]我在这里。\n[Character]\n[name="访客"]稍后再见。',
  );
  const [own, absent] = speeches(chapter);
  assert.ok(own && absent);
  assert.equal(
    chapterSpeakerBindings(chapter).get(absent.id)?.absentFromScene,
    true,
  );
  const weak = parse(
    '[Character(name="char_900_reader")]\n[name="值班人员"]请进。\n[name="访客"]谢谢。\n[Character]\n[name="访客"]稍后再见。',
  );
  const weakAbsent = speeches(weak).at(-1);
  assert.ok(weakAbsent);
  assert.equal(chapterSpeakerBindings(weak).get(weakAbsent.id), undefined);
});
