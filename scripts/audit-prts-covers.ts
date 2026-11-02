import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { parsePrtsCatalog } from '../src/data/prts-catalog.js';
import { PrtsMetadata } from '../src/data/prts-metadata.js';
import { prtsPageUrl, readPrtsWiki } from '../src/data/prts-client.js';
import {
  limitedBytes,
  publicResponse,
  safeImageUrl,
} from '../src/data/prts-resources.js';
import { ReaderError } from '../src/shared/errors.js';
import { groupStories } from '../src/ui/catalog.js';

// An explicit developer audit, never called by the reader. No chapter bodies or
// image binaries: only metadata and batched MediaWiki file existence/MIME/size.
const online = process.argv.includes('--online');
const base = path.resolve('.ai/local/cover-audit');
const rawDir = path.join(base, 'wiki');
await mkdir(rawDir, { recursive: true });
const reuseDirs = [path.resolve('.ai/local/cover-20261102')];
for (const entry of await readdir('.ai/local/prts', {
  withFileTypes: true,
}).catch(() => []))
  if (entry.isDirectory())
    reuseDirs.push(path.resolve('.ai/local/prts', entry.name));
const catalogSchema = z.object({
  rootWiki: z.string(),
  navigationWiki: z.string(),
});
let networkRequests = 0;
let catalogRaw: unknown = await readFile(
  '.runtime/cache/prts/catalog.json',
  'utf8',
)
  .then(JSON.parse)
  .catch(() => null);
if (catalogRaw === null)
  catalogRaw = await readFile(path.join(base, 'catalog.json'), 'utf8')
    .then(JSON.parse)
    .catch(() => null);
if (catalogRaw === null && online) {
  networkRequests += 2;
  catalogRaw = {
    rootWiki: await readPrtsWiki('剧情一览'),
    navigationWiki: await readPrtsWiki('模板:剧情导航'),
  };
  await writeFile(path.join(base, 'catalog.json'), JSON.stringify(catalogRaw));
}
if (catalogRaw === null)
  throw new Error('先打开阅读器取得目录，或显式 --online 获取公开目录。');
const catalog = catalogSchema.parse(catalogRaw);
const stories = parsePrtsCatalog(catalog.rootWiki, catalog.navigationWiki);
const bodies = new Set(
  stories.flatMap((story) =>
    story.chapters.map((chapter) => chapter.id.slice(5)),
  ),
);
const provenance = new Map<
  string,
  { title: string; sha256?: string; origin: string }
>();
const rawSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), text: z.string() }),
  z.object({ status: z.literal('not_found') }),
]);
const wiki = async (title: string): Promise<string> => {
  if (bodies.has(title))
    throw new Error(`Audit must not request a story body: ${title}`);
  const hex = Buffer.from(title).toString('hex');
  const cache = path.join(rawDir, `${hex}.json`);
  const entry = rawSchema.safeParse(
    await readFile(cache, 'utf8')
      .then(JSON.parse)
      .catch(() => null),
  );
  if (entry.success && entry.data.status === 'not_found') {
    provenance.set(title, { title, origin: 'cached-404' });
    throw new ReaderError(
      'not_found',
      'Metadata page HTTP 404',
      prtsPageUrl(title),
    );
  }
  let text =
    entry.success && entry.data.status === 'ok' ? entry.data.text : undefined;
  let origin = 'audit-cache';
  if (text === undefined)
    for (const dir of reuseDirs) {
      text = await readFile(path.join(dir, `${hex}.wiki`), 'utf8').catch(
        () => undefined,
      );
      if (text !== undefined) {
        origin = 'reused-public-raw';
        break;
      }
    }
  if (text === undefined) {
    if (!online)
      throw new ReaderError(
        'unsupported',
        '尚未核验：缺少缓存，需显式 --online。',
        prtsPageUrl(title),
      );
    try {
      networkRequests++;
      text = await readPrtsWiki(title);
      origin = 'live';
    } catch (error) {
      if (error instanceof ReaderError && error.code === 'not_found') {
        await writeFile(cache, JSON.stringify({ status: 'not_found' }));
        provenance.set(title, { title, origin: 'live-404' });
      }
      throw error;
    }
  }
  provenance.set(title, {
    title,
    origin,
    sha256: createHash('sha256').update(text).digest('hex'),
  });
  await writeFile(cache, JSON.stringify({ status: 'ok', text }));
  return text;
};
const metadata = new PrtsMetadata(path.join(base, 'state'), wiki);
type CoverRow = {
  id: string;
  title: string;
  category: string;
  chapters: number;
  status: string;
  filename: string;
  sourceUrl: string;
  method: string;
  message: string;
  fileUrl: string;
  mime: string;
  width: number;
  height: number;
};
const rows: CoverRow[] = [];
for (const { category, stories: group } of groupStories(stories)) {
  for (const story of group) {
    try {
      const cover = await metadata.cover(story, 7, true);
      rows.push({
        id: story.id,
        title: story.title,
        category,
        chapters: story.chapters.length,
        status: 'metadata_verified',
        filename: cover.filename,
        sourceUrl: cover.sourceUrl,
        method: cover.method,
        message: '',
        fileUrl: '',
        mime: '',
        width: 0,
        height: 0,
      });
    } catch (error) {
      if (!(error instanceof ReaderError)) throw error;
      rows.push({
        id: story.id,
        title: story.title,
        category,
        chapters: story.chapters.length,
        status: error.message.startsWith('尚未核验')
          ? 'not_verified'
          : error.code,
        filename: '',
        sourceUrl: error.sourceUrl ?? '',
        method: '',
        message: error.message,
        fileUrl: '',
        mime: '',
        width: 0,
        height: 0,
      });
    }
  }
}
const filePageSchema = z.object({
  title: z.string(),
  missing: z.union([z.string(), z.boolean()]).optional(),
  imageinfo: z
    .array(
      z.object({
        url: z.string().url(),
        mime: z.string(),
        width: z.number(),
        height: z.number(),
      }),
    )
    .optional(),
});
const fileSchema = z.object({
  query: z.object({
    pages: z.record(z.string(), filePageSchema),
    normalized: z
      .array(z.object({ from: z.string(), to: z.string() }))
      .optional(),
  }),
});
const filenames = [
  ...new Set(rows.filter((row) => row.filename).map((row) => row.filename)),
];
for (let i = 0; i < filenames.length; i += 10) {
  const batch = filenames.slice(i, i + 10);
  const api = new URL('https://prts.wiki/api.php');
  api.search = new URLSearchParams({
    action: 'query',
    format: 'json',
    prop: 'imageinfo',
    iiprop: 'url|size|mime',
    titles: batch.map((name) => `File:${name}`).join('|'),
  }).toString();
  const cache = path.join(
    base,
    `${createHash('sha256').update(api.href).digest('hex')}.json`,
  );
  let raw: unknown = await readFile(cache, 'utf8')
    .then(JSON.parse)
    .catch(() => null);
  try {
    if (raw === null && online) {
      networkRequests++;
      raw = JSON.parse(
        (await limitedBytes(await publicResponse(api.href), 300_000)).toString(
          'utf8',
        ),
      );
      fileSchema.parse(raw);
      await writeFile(cache, JSON.stringify(raw));
    }
    if (raw === null) continue;
    const data = fileSchema.parse(raw).query;
    for (const row of rows.filter((item) => batch.includes(item.filename))) {
      const query = `File:${row.filename}`;
      const normalized =
        data.normalized?.find((item) => item.from === query)?.to ?? query;
      const page = Object.values(data.pages).find(
        (item) => item.title === normalized,
      );
      if (!page) {
        row.status = 'parse';
        row.message = 'imageinfo 未返回此文件';
        continue;
      }
      if (Object.hasOwn(page, 'missing')) {
        row.status = 'resource_missing';
        row.message = 'imageinfo 明确 missing';
        continue;
      }
      const info = page.imageinfo?.[0];
      if (!info || page.imageinfo?.length !== 1) {
        row.status = 'parse';
        row.message = 'imageinfo 不唯一';
        continue;
      }
      if (
        !safeImageUrl(info.url) ||
        !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(
          info.mime,
        ) ||
        info.width <= 0 ||
        info.height <= 0
      ) {
        row.status = 'unsupported';
        row.message = '文件存在，但地址、MIME 或尺寸不在运行时支持范围';
        continue;
      }
      row.status = 'file_verified';
      row.fileUrl = info.url;
      row.mime = info.mime;
      row.width = info.width;
      row.height = info.height;
    }
  } catch (error) {
    for (const row of rows.filter((item) => batch.includes(item.filename))) {
      row.status = error instanceof ReaderError ? error.code : 'parse';
      row.message =
        error instanceof Error ? error.message : 'file query failed';
    }
  }
}
const summary = groupStories(stories).map(({ category, stories: group }) => ({
  category,
  stories: group.length,
  chapters: group.reduce((n, story) => n + story.chapters.length, 0),
  statuses: Object.fromEntries(
    [
      ...new Set(
        rows
          .filter((row) => row.category === category)
          .map((row) => row.status),
      ),
    ].map((status) => [
      status,
      rows.filter((row) => row.category === category && row.status === status)
        .length,
    ]),
  ),
}));
const report = {
  checkedAt: new Date().toISOString(),
  catalogSha256: createHash('sha256')
    .update(catalog.navigationWiki)
    .digest('hex'),
  scope: `${stories.length} 部正文目录；仅资料及 imageinfo，未批量获取正文或图片；file_verified 不代表浏览器解码成功`,
  networkRequests,
  summary,
  pages: [...provenance.values()],
  rows,
};
await writeFile(
  path.join(base, 'report.json'),
  JSON.stringify(report, null, 2),
);
console.info(
  JSON.stringify(
    {
      report: path.join(base, 'report.json'),
      networkRequests,
      summary,
      unresolved: rows
        .filter((row) => row.status !== 'file_verified')
        .map(({ title, status, message }) => ({ title, status, message })),
    },
    null,
    2,
  ),
);
