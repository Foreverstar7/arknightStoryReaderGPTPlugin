import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PrtsSource } from '../src/data/prts.js';
import { readPrtsWiki } from '../src/data/prts-client.js';
import { CAST_PAGES, INTRO_PAGE } from '../src/data/prts-search.js';
import { ReaderService } from '../src/server/service.js';
import { ReaderError } from '../src/shared/errors.js';
import { CacheCoordinator } from '../src/storage/cache-coordinator.js';

const root = path.resolve('.ai/local/story-search/live-' + Date.now());
await mkdir(root, { recursive: true });
const calls: string[] = [];
const allowed = new Set([
  '剧情一览',
  '模板:剧情导航',
  ...CAST_PAGES,
  INTRO_PAGE,
  '关卡一览/主题曲',
]);
let offline = false;
const read = async (title: string) => {
  assert.ok(
    allowed.has(title),
    `Search unexpectedly requested a body: ${title}`,
  );
  calls.push(title);
  if (offline) throw new ReaderError('network', '隔离断网验证。');
  return readPrtsWiki(title);
};
try {
  const service = new ReaderService(new PrtsSource(root, read), root);
  const before = await service.records.read();
  const names = await service.call('reader_search', {
    queries: ['孤星', '绿野幻梦'],
  });
  assert.equal(names.total, 2);
  const actor = await service.call('reader_search', {
    by: 'character',
    queries: ['塔露拉'],
    limit: 20,
  });
  assert.ok(actor.total > 0);
  const chapter = await service.call('reader_search', {
    by: 'chapter',
    queries: ['R8-1'],
  });
  assert.equal(chapter.total, 1);
  const lone = names.results.find((story) => story.title === '孤星');
  const main = chapter.results[0];
  assert.ok(lone && main);
  const intro = await service.call('reader_story_info', { storyId: lone.id });
  const mainIntro = await service.call('reader_story_info', {
    storyId: main.id,
  });
  assert.ok(
    intro.summary &&
      intro.sourceUrl &&
      mainIntro.summary &&
      mainIntro.sourceUrl,
  );
  const fetched = calls.length;
  offline = true;
  const reopened = new ReaderService(new PrtsSource(root, read), root);
  assert.equal(
    (
      await reopened.call('reader_search', {
        by: 'character',
        queries: ['塔露拉'],
      })
    ).total,
    actor.total,
  );
  assert.equal(calls.length, fetched);
  assert.deepEqual(await service.records.read(), before);
  const report = {
    checkedAt: new Date().toISOString(),
    root,
    catalogMatches: names.results.map((story) => story.title),
    actorStories: actor.total,
    actorTitles: actor.results.map((story) => story.title),
    chapterTitle: main.title,
    activityIntroLength: intro.summary.length,
    mainIntroLength: mainIntro.summary.length,
    metadataRequests: calls,
    offlineReopen: true,
    readingStateUnchanged: true,
    bodyDownloads: 0,
  };
  await writeFile(
    path.join(root, 'report.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.info(JSON.stringify(report, null, 2));
} finally {
  new CacheCoordinator(root).close();
}
