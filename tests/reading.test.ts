import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  blockWords,
  chapterWords,
  countText,
  percent,
  storyProgress,
} from '../src/domain/reading.js';
import { FixtureSource } from '../src/data/fixture.js';
import type { Story } from '../src/shared/contracts.js';

test('counts Unicode body text, options and branches; excludes names and images', () => {
  assert.equal(countText('你 好\n🌧️'), 4);
  assert.equal(
    blockWords({
      id: 'a',
      kind: 'speech',
      name: '不计入的姓名',
      paragraphs: ['你好', '再见'],
    }),
    4,
  );
  assert.equal(
    blockWords({
      id: 'b',
      kind: 'choices',
      options: [
        { label: '甲', blocks: [{ id: 'c', kind: 'narration', text: '一路' }] },
        {
          label: '乙',
          blocks: [{ id: 'd', kind: 'narration', text: '另一路' }],
        },
      ],
    }),
    7,
  );
});

test('weighted progress keeps unknown totals unknown and never rounds unfinished content to 100%', () => {
  assert.equal(percent(999, 1000, false), 99);
  const story: Story = {
    id: 's',
    title: 'test',
    category: 'test',
    type: 'test',
    source: 'fixture',
    coverLabel: 'TEST',
    chapters: [
      { id: 'a', title: 'A', code: '1', wordCount: 100 },
      { id: 'b', title: 'B', code: '2', wordCount: 900 },
    ],
  };
  const record = {
    chapterId: 'a',
    storyId: 's',
    revision: 'v1',
    last: { blockId: 'end', fraction: 1 },
    furthestWords: 100,
    complete: true,
    updatedAt: new Date().toISOString(),
  };
  assert.equal(storyProgress(story, { a: record }), 10);
  // An opened revision's verified count overrides an older catalog count.
  assert.equal(
    storyProgress(story, {
      a: { ...record, totalWords: 900, furthestWords: 900 },
    }),
    50,
  );
  assert.equal(
    storyProgress(
      {
        ...story,
        chapters: [
          ...story.chapters,
          { id: 'c', code: '3', title: 'unknown', wordCount: null },
        ],
      },
      { a: record },
    ),
    null,
  );
});

test('fixture catalog denominators include every chapter without needing network', async () => {
  const source = new FixtureSource();
  for (const story of await source.catalog()) {
    for (const meta of story.chapters) {
      assert.equal(meta.wordCount, chapterWords(await source.chapter(meta.id)));
    }
  }
});
