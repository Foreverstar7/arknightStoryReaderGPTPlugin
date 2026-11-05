import { storySchema, type Story } from '../shared/contracts.js';
import { ReaderError } from './source.js';
import { prtsPageUrl } from './prts-client.js';

export const chapterIdForPage = (title: string) =>
  `prts:${title.replaceAll('_', ' ')}`;

/** Only the transcluded body tables; never follow or parse footer Navboxes. */
export function parsePrtsCatalog(
  rootWiki: string,
  navigationWiki: string,
): Story[] {
  if (!/\{\{剧情导航(?:\||\}\})/u.test(rootWiki))
    throw new ReaderError(
      'parse',
      'PRTS 剧情一览不再引用剧情导航，需核对目录结构。',
    );
  const stories: Story[] = [];
  const chapterIds = new Set<string>();
  for (const table of navigationWiki.matchAll(/\{\|[\s\S]*?\|\}/gu)) {
    const category = /\[\[剧情一览\|(主线|活动)剧情一览\]\]/u.exec(
      table[0],
    )?.[1];
    if (!category) continue;
    let section = '';
    for (const row of table[0].split(/^\|-\s*$/mu)) {
      if (row.includes('[[剧情一览|')) continue;
      const headers = [...row.matchAll(/^!\s*(.*)$/gmu)].map((match) =>
        (match[1] ?? '').replace(/^[^|]*\|/u, '').trim(),
      );
      if (headers.length === 0) continue;
      const regular = /^!\s*width=/mu.test(row);
      if (!regular && headers.length === 2) section = headers[0] ?? '';
      const title = regular ? headers[0] : `${section} · ${headers.at(-1)}`;
      const type = regular ? headers[1] : section;
      if (!title || !type)
        throw new ReaderError('parse', 'PRTS 目录行缺少剧情分类或名称。');
      const chapters = [...row.matchAll(/\[\[([^\]|]+)\|([^\]]+)\]\]/gu)].map(
        (match) => {
          const page = match[1]?.trim().replaceAll('_', ' ');
          const label = match[2]?.trim();
          if (
            !page ||
            !label ||
            /^(?:分类|文件|File|模板|Widget):/iu.test(page)
          )
            throw new ReaderError(
              'parse',
              `PRTS「${title}」篇目链接格式改变。`,
            );
          const id = chapterIdForPage(page);
          if (chapterIds.has(id))
            throw new ReaderError('parse', `PRTS 正文表存在重复篇目：${page}`);
          chapterIds.add(id);
          const code = /^(\S*\d[\w-]*)(?:\s|\/)/u.exec(page)?.[1] ?? 'STORY';
          return {
            id,
            code,
            title: label.startsWith(`${code} `)
              ? label.slice(code.length + 1)
              : label,
            wordCount: null,
            sourceUrl: prtsPageUrl(page),
          };
        },
      );
      if (chapters.length === 0)
        throw new ReaderError('parse', `PRTS「${title}」目录为空。`);
      stories.push(
        storySchema.parse({
          id: regular ? `prts:${title}` : `prts:${category}剧情/${title}`,
          title,
          category: `${category}剧情`,
          type,
          coverLabel: title,
          source: 'prts',
          sourceUrl: prtsPageUrl('剧情一览'),
          chapters,
        }),
      );
    }
  }
  if (
    stories.length === 0 ||
    new Set(stories.map((story) => story.id)).size !== stories.length
  )
    throw new ReaderError(
      'parse',
      'PRTS 剧情正文表为空或有重复名称，请核对目录结构。',
    );
  return stories;
}
