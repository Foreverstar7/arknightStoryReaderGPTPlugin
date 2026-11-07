import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { readPrtsWiki } from '../src/data/prts-client.js';
import { parsePrtsCatalog } from '../src/data/prts-catalog.js';
import { parsePrtsChapter } from '../src/data/prts-script.js';
import { chapterSpeakerBindings } from '../src/data/prts-speaker.js';
import { normalizePortraitReference } from '../src/data/prts-portrait.js';
const root = path.resolve('.ai/local/prts-speaker-audit');
await mkdir(root, { recursive: true });
const catalog = parsePrtsCatalog(
  await readPrtsWiki('剧情一览'),
  await readPrtsWiki('模板:剧情导航'),
);
const entries = catalog.flatMap((story) =>
  story.chapters.map((chapter) => ({ story, chapter })),
);
const api = z.object({
  query: z.object({
    normalized: z
      .array(z.object({ from: z.string(), to: z.string() }))
      .optional(),
    pages: z.array(
      z.object({
        title: z.string(),
        revisions: z.array(z.object({ sha1: z.string() })).optional(),
      }),
    ),
  }),
});
const summary = {
  checkedAt: new Date().toISOString(),
  stories: catalog.length,
  chapters: entries.length,
  verified: 0,
  fetched: 0,
  speech: 0,
  multipleScenes: 0,
  corroborated: 0,
  defaults: 0,
  failures: [] as object[],
};
const unresolved: object[] = [];
const resolved: object[] = [];
for (let offset = 0; offset < entries.length; offset += 50) {
  const batch = entries.slice(offset, offset + 50);
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    prop: 'revisions',
    rvprop: 'sha1',
    titles: batch
      .map(({ chapter }) => chapter.id.slice(5).replaceAll('_', ' '))
      .join('|'),
  });
  const response = await fetch(`https://prts.wiki/api.php?${params}`, {
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok)
    throw new Error(`Revision metadata HTTP ${response.status}`);
  const data = api.parse(await response.json());
  const normalized = new Map(
    data.query.normalized?.map((item) => [item.from, item.to]),
  );
  for (const { story, chapter } of batch) {
    try {
      const pageTitle = chapter.id.slice(5);
      const filename =
        createHash('sha256').update(pageTitle).digest('hex') + '.wiki';
      let wiki = '';
      try {
        wiki = await readFile(
          path.join('.ai/local/prts-chapter-audit', filename),
          'utf8',
        );
      } catch {}
      const title = pageTitle.replaceAll('_', ' ');
      const revision = data.query.pages.find(
        (page) => page.title === (normalized.get(title) ?? title),
      )?.revisions?.[0]?.sha1;
      const sha1 = createHash('sha1').update(wiki).digest('hex');
      if (
        !wiki ||
        !revision ||
        (revision !== sha1 &&
          revision !== BigInt(`0x${sha1}`).toString(36).padStart(31, '0'))
      ) {
        wiki = await readPrtsWiki(pageTitle);
        summary.fetched++;
        await writeFile(path.join(root, filename), wiki);
        const updatedSha = createHash('sha1').update(wiki).digest('hex');
        if (
          !revision ||
          (revision !== updatedSha &&
            revision !==
              BigInt(`0x${updatedSha}`).toString(36).padStart(31, '0'))
        )
          throw new Error('Source changed during audit');
      }
      summary.verified++;
      const parsed = parsePrtsChapter(wiki, {
        id: chapter.id,
        storyId: story.id,
        title: chapter.title,
        pageTitle,
        ...(['主线', '支线', '剧情'].includes(story.type)
          ? { group: story.title }
          : {}),
      });
      const bindings = chapterSpeakerBindings(parsed);
      for (const block of parsed.blocks)
        for (const leaf of block.kind === 'choices'
          ? [
              ...block.options.flatMap((option) => option.blocks),
              ...(block.shared ?? []).flatMap((shared) => shared.blocks),
            ]
          : [block]) {
          if (leaf.kind !== 'speech') continue;
          summary.speech++;
          const references = [
            ...new Set(
              leaf.scene?.slots.map((slot) =>
                normalizePortraitReference(slot.resource),
              ),
            ),
          ];
          if (references.length < 2) continue;
          summary.multipleScenes++;
          const binding = bindings.get(leaf.id);
          if (binding) {
            summary.corroborated++;
            if (binding.default) summary.defaults++;
            resolved.push({
              chapterId: chapter.id,
              blockId: leaf.id,
              name: leaf.name,
              ...binding,
            });
          } else
            unresolved.push({
              chapterId: chapter.id,
              blockId: leaf.id,
              name: leaf.name,
              references,
            });
        }
    } catch (error) {
      summary.failures.push({
        id: chapter.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  console.info(
    JSON.stringify({
      checked: Math.min(offset + 50, entries.length),
      ...summary,
      failures: summary.failures.length,
    }),
  );
  await writeFile(
    path.join(root, 'report.json'),
    JSON.stringify({ summary, resolved, unresolved }, null, 2),
  );
}
