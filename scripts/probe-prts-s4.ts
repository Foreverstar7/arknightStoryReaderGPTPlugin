import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readPrtsWiki, prtsPageUrl } from '../src/data/prts-client.js';
import { parsePrtsCatalog } from '../src/data/prts-catalog.js';
import { parsePrtsChapter } from '../src/data/prts-script.js';
import { chapterWords } from '../src/domain/reading.js';

// A small, explicit public-source audit; never follows all chapter links.
const base = path.resolve('.ai/local/prts');
await mkdir(base, { recursive: true });
const output = await mkdtemp(path.join(base, 's4-denominators-'));
const titles = [
  '剧情一览',
  '模板:剧情导航',
  '模板:剧情模拟器',
  '模块:Plot',
  '骑兵与猎人',
  'GT-1 日正当中/BEG',
  'W2G/BEG',
];
const pages = new Map<string, string>();
const evidence = [];
for (const [index, title] of titles.entries()) {
  const wiki = await readPrtsWiki(title);
  pages.set(title, wiki);
  const file = `${index}.wiki.txt`;
  await writeFile(path.join(output, file), wiki);
  const markers = wiki
    .split(/\r?\n/u)
    .filter((line) => /字数|word.?count|text.?length/iu.test(line));
  evidence.push({
    title,
    sourceUrl: `${prtsPageUrl(title)}?action=raw`,
    file,
    bytes: Buffer.byteLength(wiki),
    sha256: createHash('sha256').update(wiki).digest('hex'),
    countMarkerLines: markers.map((line) => line.slice(0, 400)),
  });
}
const stories = parsePrtsCatalog(
  pages.get('剧情一览') ?? '',
  pages.get('模板:剧情导航') ?? '',
);
const known = stories
  .flatMap((story) => story.chapters)
  .filter((chapter) => chapter.wordCount !== null);
assert.equal(known.length, 0);
const samples = ['GT-1 日正当中/BEG', 'W2G/BEG'].map((title) => {
  const meta = stories
    .flatMap((story) => story.chapters.map((chapter) => ({ story, chapter })))
    .find((entry) => entry.chapter.id === `prts:${title}`);
  assert.ok(meta);
  const chapter = parsePrtsChapter(pages.get(title) ?? '', {
    id: meta.chapter.id,
    storyId: meta.story.id,
    title: meta.chapter.title,
    pageTitle: title,
  });
  return {
    id: chapter.id,
    revision: chapter.revision,
    blocks: chapter.blocks.length,
    words: chapterWords(chapter),
  };
});
const report = {
  checkedAt: new Date().toISOString(),
  publicRequests: titles.length,
  stories: stories.length,
  chapters: stories.reduce((sum, story) => sum + story.chapters.length, 0),
  knownCatalogDenominators: known.length,
  samples,
  evidence,
  conclusion:
    'Inspected inputs expose navigation/script data, with no verified metadata for this reader body/branch counting contract. Full-story totals remain unknown until every chapter is independently verified through ordinary on-demand reading. This limited audit does not prove that no other public statistic exists.',
};
await writeFile(
  path.join(output, 'report.json'),
  JSON.stringify(report, null, 2),
);
console.info(
  JSON.stringify(
    {
      output,
      ...report,
      evidence: report.evidence.map(({ title, bytes, countMarkerLines }) => ({
        title,
        bytes,
        countMarkerLines,
      })),
    },
    null,
    2,
  ),
);
