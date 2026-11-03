import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readPrtsWiki, prtsPageUrl } from '../src/data/prts-client.js';
import { parsePrtsCatalog } from '../src/data/prts-catalog.js';
import { parsePrtsChapter } from '../src/data/prts-script.js';
import { ReaderError } from '../src/shared/errors.js';
import { chapterContentKind, chapterWords } from '../src/domain/reading.js';
import { VERSION } from '../src/shared/version.js';

// Explicit maintenance command only. It never opens the runtime reading store,
// follows image references, or changes normal current-story preparation behavior.
const root = path.resolve('.ai/local/prts-chapter-audit');
const offline = process.argv.includes('--offline');
const refresh = process.argv.includes('--refresh');
if (offline && refresh)
  throw new Error('--offline and --refresh are exclusive');
await mkdir(root, { recursive: true });
let requests = 0;
async function wiki(title: string) {
  const file = path.join(
    root,
    `${createHash('sha256').update(title).digest('hex')}.wiki`,
  );
  if (!refresh) {
    try {
      return {
        text: await readFile(file, 'utf8'),
        fetchedAt: (await stat(file)).mtime.toISOString(),
      };
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !('code' in error) ||
        error.code !== 'ENOENT'
      )
        throw error;
    }
  }
  if (offline) throw new ReaderError('not_found', `审计样本尚未下载：${title}`);
  requests++;
  const text = await readPrtsWiki(title);
  await writeFile(file, text);
  return { text, fetchedAt: new Date().toISOString() };
}
const catalog = parsePrtsCatalog(
  (await wiki('剧情一览')).text,
  (await wiki('模板:剧情导航')).text,
);
const entries = catalog.flatMap((story) =>
  story.chapters.map((chapter) => ({ story, chapter })),
);
type Result = {
  storyId: string;
  story: string;
  chapterId: string;
  title: string;
  sourceUrl: string;
  fetchedAt?: string;
  sha256?: string;
  words?: number;
  blocks?: number;
  contentKind?: 'text' | 'video' | 'mixed';
  diagnostics?: { line: number; message: string }[];
  code?: string;
  error?: string;
};
const results: Result[] = [];
let cursor = 0;
async function worker() {
  for (;;) {
    const entry = entries[cursor++];
    if (!entry) return;
    const { story, chapter } = entry;
    const pageTitle = chapter.id.slice('prts:'.length);
    const result: Result = {
      storyId: story.id,
      story: story.title,
      chapterId: chapter.id,
      title: chapter.title,
      sourceUrl: prtsPageUrl(pageTitle),
    };
    try {
      const source = await wiki(pageTitle);
      result.fetchedAt = source.fetchedAt;
      result.sha256 = createHash('sha256').update(source.text).digest('hex');
      const parsed = parsePrtsChapter(source.text, {
        id: chapter.id,
        storyId: story.id,
        title: chapter.title,
        pageTitle,
        ...(['主线', '支线', '剧情'].includes(story.type)
          ? { group: story.title }
          : {}),
      });
      result.words = chapterWords(parsed);
      result.blocks = parsed.blocks.length;
      result.contentKind = chapterContentKind(parsed);
      result.diagnostics = parsed.diagnostics;
    } catch (error) {
      result.code = error instanceof ReaderError ? error.code : 'unknown';
      result.error = error instanceof Error ? error.message : String(error);
    }
    results.push(result);
    if (results.length % 50 === 0 || results.length === entries.length)
      console.info(
        JSON.stringify({
          checked: results.length,
          total: entries.length,
          failed: results.filter((item) => item.error).length,
          requests,
        }),
      );
  }
}
await Promise.all([worker(), worker()]);
const order = new Map(entries.map(({ chapter }, index) => [chapter.id, index]));
results.sort(
  (a, b) => (order.get(a.chapterId) ?? 0) - (order.get(b.chapterId) ?? 0),
);
const report = {
  version: VERSION,
  parserSha256: createHash('sha256')
    .update(await readFile('src/data/prts-script.ts'))
    .update(await readFile('src/data/prts-flow.ts'))
    .update(await readFile('src/data/prts-compat.ts'))
    .digest('hex'),
  checkedAt: new Date().toISOString(),
  offline,
  publicRequests: requests,
  stories: catalog.length,
  total: entries.length,
  passed: results.filter((item) => !item.error).length,
  failed: results.filter((item) => item.error).length,
  results,
};
const file = path.join(root, `report-${Date.now()}.json`);
await writeFile(file, JSON.stringify(report, null, 2));
console.info(JSON.stringify({ file, ...report, results: undefined }));
if (report.failed) process.exitCode = 1;
