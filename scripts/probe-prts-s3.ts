import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PrtsSource } from '../src/data/prts.js';
import { PrtsResources } from '../src/data/prts-resources.js';
import { readPrtsWiki } from '../src/data/prts-client.js';
import { ReaderService } from '../src/server/service.js';

const base = path.resolve('.ai/local/prts');
await mkdir(base, { recursive: true });
const root = await mkdtemp(path.join(base, 's3-live-'));
const requests: { url: string; status: number }[] = [];
let offline = false;
const request: typeof fetch = async (input, options) => {
  if (offline) throw new Error('probe: injected offline boundary');
  const response = await fetch(input, options);
  requests.push({ url: String(input), status: response.status });
  return response;
};
const wiki = async (title: string) => {
  const text = await readPrtsWiki(title, request);
  await writeFile(
    path.join(root, `${Buffer.from(title).toString('hex')}.wiki`),
    text,
  );
  return text;
};
const service = new ReaderService(new PrtsSource(root, wiki, request), root);
const snapshot = await service.snapshot();
assert.equal(requests.length, 2);
const story = snapshot.stories.find((story) => story.id === 'prts:骑兵与猎人');
const meta = story?.chapters[0];
assert.ok(meta);
const info = await service.call('reader_chapter_info', { chapterId: meta.id });
const chapter = await service.chapter(meta.id);
const speech = chapter.blocks.find(
  (block) =>
    block.kind === 'speech' &&
    block.scene?.slots.some((slot) => slot.resource === 'char_220_grani#5'),
);
const cg = chapter.blocks.find((block) => block.kind === 'cg');
assert.ok(speech && cg);
const beforeImages = requests.length;
assert.equal(
  requests.some((item) => /\.png(?:$|\?)/u.test(item.url)),
  false,
);
const portrait = await service.image({
  kind: 'portrait',
  chapterId: chapter.id,
  blockId: speech.id,
});
const scene = await service.image({
  kind: 'cg',
  chapterId: chapter.id,
  blockId: cg.id,
});
const cover = await service.image({ kind: 'cover', storyId: story.id });
for (const [name, image] of [
  ['portrait', portrait],
  ['cg', scene],
  ['cover', cover],
] as const) {
  for (const [index, layer] of image.layers.entries())
    await writeFile(
      path.join(root, `${name}-${index}.png`),
      Buffer.from(layer.dataUrl.split(',')[1] ?? '', 'base64'),
    );
}
const layers = new PrtsResources(root, wiki, request);
const shield = await layers.portrait('avg_npc_2321_1#6$1', 7);
const plain = await layers.portrait('avg_npc_2321_1#6$2', 7);
assert.notEqual(shield.layers[0]?.dataUrl, plain.layers[0]?.dataUrl);
for (const [name, image] of [
  ['shield', shield],
  ['plain', plain],
] as const)
  for (const [index, layer] of image.layers.entries())
    await writeFile(
      path.join(root, `${name}-${index}.png`),
      Buffer.from(layer.dataUrl.split(',')[1] ?? '', 'base64'),
    );
const beforeCacheReuse = requests.length;
await service.image({
  kind: 'portrait',
  chapterId: chapter.id,
  blockId: speech.id,
});
await service.image({ kind: 'cg', chapterId: chapter.id, blockId: cg.id });
assert.equal(requests.length, beforeCacheReuse);
const anchor = chapter.blocks[0];
assert.ok(anchor);
await service.record({
  chapterId: chapter.id,
  revision: chapter.revision,
  last: { blockId: anchor.id, fraction: 0.4 },
  atEnd: false,
});
const records = await service.records.read();
offline = true;
const restarted = new ReaderService(new PrtsSource(root, wiki, request), root);
await restarted.chapter(chapter.id);
assert.deepEqual(
  await restarted.image({ kind: 'cg', chapterId: chapter.id, blockId: cg.id }),
  scene,
);
assert.deepEqual(
  await restarted.image({
    kind: 'portrait',
    chapterId: chapter.id,
    blockId: speech.id,
  }),
  portrait,
);
await restarted.call('reader_clear_cache', { scope: 'images' });
assert.deepEqual(await restarted.records.read(), records);
assert.equal(
  (await readdir(path.join(root, 'cache'))).includes('images'),
  false,
);
await assert.rejects(
  () => restarted.image({ kind: 'cg', chapterId: chapter.id, blockId: cg.id }),
  /连接失败/u,
);
assert.equal(requests.length, beforeCacheReuse);
await restarted.call('reader_clear_cache', { scope: 'all' });
await restarted.record({
  chapterId: chapter.id,
  revision: chapter.revision,
  last: { blockId: anchor.id, fraction: 0.5 },
  atEnd: false,
});
assert.equal(requests.length, beforeCacheReuse);
const categories = [
  ...new Set(snapshot.stories.map((story) => story.category)),
].map((category) => ({
  category,
  stories: snapshot.stories.filter((story) => story.category === category)
    .length,
  chapters: snapshot.stories
    .filter((story) => story.category === category)
    .reduce((sum, story) => sum + story.chapters.length, 0),
}));
// Independent source-link inventory before the first Navbox, including two table headers.
const navigation = await readFile(
  path.join(root, `${Buffer.from('模板:剧情导航').toString('hex')}.wiki`),
  'utf8',
);
const body = navigation.slice(0, navigation.indexOf('{{Navbox'));
const sourcePages = [...body.matchAll(/\[\[([^\]|]+)\|[^\]]+\]\]/gu)]
  .map((match) => match[1])
  .filter((page) => page !== '剧情一览');
const parsedPages = snapshot.stories.flatMap((story) =>
  story.chapters.map((chapter) => chapter.id.slice(5)),
);
assert.deepEqual(parsedPages, sourcePages);
const evidence = {
  root,
  catalog: {
    stories: snapshot.stories.length,
    chapters: parsedPages.length,
    exactOrderedBodyLinkMatch: true,
    categories,
  },
  stageInfo: info,
  chapter: { id: chapter.id, blocks: chapter.blocks.length },
  beforeImageTriggerRequests: beforeImages,
  images: [portrait, scene, cover, shield, plain].map((image) => ({
    resource: image.resource,
    width: image.width,
    height: image.height,
    layers: image.layers.map((layer) => ({
      sourceUrl: layer.sourceUrl,
      bytes: Buffer.from(layer.dataUrl.split(',')[1] ?? '', 'base64').length,
    })),
  })),
  cacheReuseAdditionalRequests: 0,
  injectedOfflineRestart: true,
  clearedImagesPreservesRecords: true,
  clearedAllScrollSaveRequests: 0,
  requests,
};
await writeFile(
  path.join(root, 'evidence.json'),
  JSON.stringify(evidence, null, 2),
);
console.info(JSON.stringify(evidence, null, 2));
