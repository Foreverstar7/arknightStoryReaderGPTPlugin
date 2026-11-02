import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PrtsSource } from '../src/data/prts.js';
import { readPrtsWiki } from '../src/data/prts-client.js';
import { parsePrtsChapter } from '../src/data/prts-script.js';
import { ReaderError } from '../src/data/source.js';
import {
  chapterWords,
  countText,
  storyProgress,
} from '../src/domain/reading.js';
import { ReaderService } from '../src/server/service.js';

const base = path.resolve('.ai/local/prts');
await mkdir(base, { recursive: true });
const root = await mkdtemp(path.join(base, 'live-'));
const requests: { title: string; bytes: number }[] = [];
const read = async (title: string) => {
  const raw = await readPrtsWiki(title);
  requests.push({ title, bytes: Buffer.byteLength(raw) });
  return raw;
};
const service = new ReaderService(new PrtsSource(root, read), root);
const snapshot = await service.snapshot();
const story = snapshot.stories.find((story) => story.id === 'prts:骑兵与猎人');
assert.ok(story?.source === 'prts');
assert.equal(requests.length, 2, 'catalog must not download chapter bodies');
assert.equal(storyProgress(story, snapshot.state.records), null);
const samples = [];
for (const meta of story.chapters.slice(0, 2)) {
  const chapter = await service.chapter(meta.id);
  assert.ok(chapter.original);
  const first = chapter.blocks[0];
  assert.ok(first);
  await service.record({
    chapterId: chapter.id,
    revision: chapter.revision,
    last: { blockId: first.id, fraction: 0.4 },
    atEnd: false,
  });
  samples.push({
    page: chapter.original.pageTitle,
    blocks: chapter.blocks.length,
    words: chapterWords(chapter),
    revision: chapter.revision,
  });
  // Independent source-line count, meaningful for these sampled old script forms.
  const dialogueWords = [
    ...chapter.original.wiki.matchAll(/^\[name="[^"]*"\]\s*(.*)$/gmu),
  ].reduce((n, match) => n + countText(match[1] ?? ''), 0);
  assert.equal(chapterWords(chapter), dialogueWords);
}
assert.equal(
  requests.length,
  4,
  'only the two opened bodies should be fetched',
);
const branchWiki = await read('W2G/BEG');
const branch = parsePrtsChapter(branchWiki, {
  id: 'sample:W2G/BEG',
  storyId: 'sample:prologue',
  title: '序章·上',
  pageTitle: 'W2G/BEG',
  group: '黑暗时代·上',
});
assert.equal(
  branch.blocks.filter((block) => block.kind === 'choices').length,
  6,
);
const sourceWords =
  [...branchWiki.matchAll(/^\[name="[^"]*"\]\s*(.*)$/gmu)].reduce(
    (n, match) => n + countText(match[1] ?? ''),
    0,
  ) +
  [...branchWiki.matchAll(/\[Decision\(options="([^"]*)"/gu)].reduce(
    (n, match) =>
      n +
      (match[1]?.split(';').reduce((sum, label) => sum + countText(label), 0) ??
        0),
    0,
  );
assert.equal(
  chapterWords(branch),
  sourceWords,
  'all branch text/options and common continuation must be counted exactly once',
);
await writeFile(path.join(root, 'branch-sample.wiki'), branchWiki);
const offline = new ReaderService(
  new PrtsSource(root, async () => {
    throw new ReaderError('network', 'live-probe-offline');
  }),
  root,
);
assert.equal(
  (await offline.snapshot()).state.recentChapterId,
  story.chapters[1]?.id,
);
for (const sample of story.chapters.slice(0, 2))
  assert.equal((await offline.chapter(sample.id)).source, 'prts');
await assert.rejects(
  () => offline.chapter(story.chapters[0]?.id ?? '', true),
  /live-probe-offline/,
);
const evidence = {
  checkedAt: new Date().toISOString(),
  root,
  requests,
  story: story.title,
  chapters: story.chapters.length,
  samples,
  branchSample: {
    page: 'W2G/BEG',
    choices: 6,
    words: chapterWords(branch),
    independentlyCountedWords: sourceWords,
  },
  offlineRestart: true,
  failedRefreshRetainsCache: true,
  overallProgress: storyProgress(
    story,
    (await offline.snapshot()).state.records,
  ),
};
await writeFile(
  path.join(root, 'evidence.json'),
  JSON.stringify(evidence, null, 2),
);
console.info(JSON.stringify(evidence, null, 2));
