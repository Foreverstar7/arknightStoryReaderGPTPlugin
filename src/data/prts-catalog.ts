import { storySchema, type Story } from '../shared/contracts.js';
import { ReaderError } from './source.js';
import { prtsPageUrl } from './prts-client.js';

export const PRTS_STORY_ID = 'prts:骑兵与猎人';
export const PRTS_STORY_TITLE = '骑兵与猎人';
export const chapterIdForPage = (title: string) =>
  `prts:${title.replaceAll('_', ' ')}`;

/** S2 deliberately reads one row of the body table, not the repeated footer navbox. */
export function parsePrtsCatalog(
  rootWiki: string,
  navigationWiki: string,
): Story[] {
  if (!/\{\{剧情导航(?:\||\}\})/u.test(rootWiki)) {
    throw new ReaderError(
      'parse',
      'PRTS 剧情一览不再引用剧情导航，需核对目录结构。',
    );
  }
  const bodyTable = [...navigationWiki.matchAll(/\{\|[\s\S]*?\|\}/gu)].find(
    (table) => table[0].includes('[[剧情一览|活动剧情一览]]'),
  )?.[0];
  const rows = bodyTable?.split(/^\|-\s*$/mu) ?? [];
  const matches = rows.filter((row) =>
    /^!\s*(?:[^\n|]*\|)?骑兵与猎人\s*$/mu.test(row),
  );
  const row = matches[0];
  if (
    matches.length !== 1 ||
    !row ||
    !/^!\s*(?:[^\n|]*\|)?支线\s*$/mu.test(row)
  )
    throw new ReaderError(
      'parse',
      'PRTS 剧情导航中没有唯一的「骑兵与猎人」目录行，未使用示例目录代替。',
    );
  const chapters = [...row.matchAll(/\[\[([^\]|]+)\|([^\]]+)\]\]/gu)].map(
    (match) => {
      const page = match[1]?.trim();
      const label = match[2]?.trim();
      if (
        !page ||
        !label ||
        !/^GT-(?:\d|EX-\d|HX-\d)[^\n]*\/(?:BEG|END)$/u.test(page)
      )
        throw new ReaderError('parse', 'PRTS 骑兵与猎人的篇目链接格式已改变。');
      const code = label.split(' ')[0] ?? label;
      return {
        id: chapterIdForPage(page),
        code,
        title: label.startsWith(`${code} `)
          ? label.slice(code.length + 1)
          : label,
        wordCount: null,
        sourceUrl: prtsPageUrl(page),
      };
    },
  );
  if (
    chapters.length === 0 ||
    new Set(chapters.map((chapter) => chapter.id)).size !== chapters.length
  )
    throw new ReaderError(
      'parse',
      'PRTS 目录为空或存在重复篇目标识，请核对源站。',
    );
  return [
    storySchema.parse({
      id: PRTS_STORY_ID,
      title: PRTS_STORY_TITLE,
      category: '活动剧情',
      type: '支线',
      coverLabel: 'GRANI / GT',
      source: 'prts',
      sourceUrl: prtsPageUrl('剧情一览'),
      chapters,
    }),
  ];
}
