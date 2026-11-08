import { z } from 'zod';
import { JsonCache } from '../storage/json-cache.js';
import { chapterInfoSchema, type Story } from '../shared/contracts.js';
import { appearanceSchema, type Appearance } from '../shared/search.js';
import { ReaderError } from './source.js';
import { chapterIdForPage } from './prts-catalog.js';
import { prtsPageUrl, type WikiReader } from './prts-client.js';
import { normalizeSearch } from '../domain/search.js';

// These are the public tables explicitly linked by 剧情出场人物一览, verified
// 2026-11-07. Only current reader catalog IDs are ever returned. Recheck the root
// links/header grammar when PRTS changes them; do not infer cast from dialogue.
export const CAST_PAGES = ['剧情出场人物一览/主线', '剧情出场人物一览/活动'];
// Existing activity and main-directory introductions, verified on the same date.
// Recheck their section/table grammar if PRTS moves or changes these source pages.
export const INTRO_PAGE = '模板:活动信息/quote';
const MAIN_INTRO_PAGE = '关卡一览/主题曲';
export function parseAppearances(
  wiki: string,
  sourceUrl: string,
): Appearance[] {
  const text = wiki.replace(/<!--[\s\S]*?-->/gu, '');
  if (!/!\s*关卡\s*!!\s*出场人物/u.test(text))
    throw new ReaderError(
      'parse',
      'PRTS 出场表结构改变，未把解析失败当作无出场。',
      sourceUrl,
    );
  const rows = [
    ...text.matchAll(/^\|\s*\[\[([^\]|]+)(?:\|[^\]]*)?\]\]\s*\|\|([^\n]*)/gmu),
  ];
  const rowHeads = [...text.matchAll(/^\|\s*\[\[[^\n]+?\]\]/gmu)];
  if (!rows.length || rowHeads.length !== rows.length)
    throw new ReaderError('parse', 'PRTS 出场表未取得篇目记录。', sourceUrl);
  return rows.map((row) => ({
    chapterId: chapterIdForPage((row[1] ?? '').trim()),
    // Question marks are identity uncertainty, not punctuation to strip.
    names: [
      ...new Set(
        (row[2] ?? '')
          .split(/[,，、&]/u)
          .map((name) => name.trim())
          .filter(Boolean),
      ),
    ],
    sourceUrl,
  }));
}

function prose(value: string, sourceUrl: string) {
  const plain = value
    .replace(/<br\s*\/?\s*>/giu, '\n')
    .replace(/\[\[[^\]|]+\|([^\]]+)\]\]/gu, '$1')
    .replace(/\[\[([^\]]+)\]\]/gu, '$1')
    .replace(/'{2,3}/gu, '')
    .trim();
  if (/[{}<>]/u.test(plain))
    throw new ReaderError(
      'parse',
      'PRTS 剧情导语含未支持的标记，请重试或查看来源。',
      sourceUrl,
    );
  return plain;
}
export function parseActivityIntros(wiki: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const section of wiki
    .replace(/<!--[\s\S]*?-->/gu, '')
    .matchAll(/^==([^=\n]+)==\s*\n([\s\S]*?)(?=^==|$(?![\s\S]))/gmu)) {
    const title = section[1]?.trim();
    const body = section[2]?.trim();
    if (!title || !body) continue;
    const poems = [...body.matchAll(/<poem>([\s\S]*?)<\/poem>/gu)];
    if (poems.length > 1 || (poems.length === 0 && /<\/?poem/u.test(body)))
      throw new ReaderError(
        'parse',
        'PRTS 活动导语结构改变。',
        prtsPageUrl(INTRO_PAGE),
      );
    // Earlier source entries are plain paragraphs; newer ones use a poem wrapper.
    result.set(
      normalizeSearch(title),
      prose(poems[0]?.[1] ?? body, prtsPageUrl(INTRO_PAGE)),
    );
  }
  if (!result.size)
    throw new ReaderError(
      'parse',
      'PRTS 活动导语列表为空或结构改变。',
      prtsPageUrl(INTRO_PAGE),
    );
  return result;
}
function mainIntroSections(wiki: string) {
  const parts = wiki.split(
    /(?=\{\|\s*class="wikitable"[^\n]*margin-bottom:0)/u,
  );
  const sections: { heading: string; part: string }[] = [];
  for (const part of parts) {
    const heading = /!colspan="?5"?[^\n]*\|([^\n]+)/u
      .exec(part)?.[1]
      ?.replace(/<[^>]+>/gu, '')
      .trim();
    if (heading) sections.push({ heading, part });
  }
  if (!sections.length)
    throw new ReaderError(
      'parse',
      'PRTS 主线导语列表结构改变。',
      prtsPageUrl(MAIN_INTRO_PAGE),
    );
  return sections;
}
export function parseMainIntro(
  wiki: string,
  title: string,
): string | undefined {
  // Desktop/mobile duplicate the same poem. Accept only one distinct source text.
  for (const { heading, part } of mainIntroSections(wiki)) {
    if (!normalizeSearch(heading).endsWith(normalizeSearch(title))) continue;
    const texts = [
      ...new Set(
        [...part.matchAll(/<poem>([\s\S]*?)<\/poem>/gu)].map((match) =>
          prose(match[1] ?? '', prtsPageUrl(MAIN_INTRO_PAGE)),
        ),
      ),
    ];
    if (texts.length > 1)
      throw new ReaderError(
        'parse',
        'PRTS 主线导语的桌面与移动版本不一致。',
        prtsPageUrl(MAIN_INTRO_PAGE),
      );
    return texts[0];
  }
  return undefined;
}

export class PrtsSearchData {
  private readonly cache: JsonCache;
  private readonly pending = new Map<string, Promise<string>>();
  constructor(
    root: string,
    private readonly readWiki: WikiReader,
  ) {
    this.cache = new JsonCache(root, 'metadata');
  }
  private page(title: string, days: number, refresh: boolean): Promise<string> {
    return this.cache.run(async () => {
      const key = `search-v1:${title}`;
      const cached = refresh
        ? null
        : await this.cache.get(key, z.string(), days);
      if (cached !== null) return cached;
      const pendingKey = `${this.cache.requestKey()}:${refresh}:${title}`;
      const existing = this.pending.get(pendingKey);
      if (existing) return existing;
      const task = (async () => {
        const text = await this.readWiki(title);
        this.cache.assertCurrent();
        // Validate before caching: error HTML/changed source must remain retryable.
        if (CAST_PAGES.includes(title))
          parseAppearances(text, prtsPageUrl(title));
        if (title === INTRO_PAGE) parseActivityIntros(text);
        if (title === MAIN_INTRO_PAGE) mainIntroSections(text);
        await this.cache.put(key, text);
        return text;
      })();
      this.pending.set(pendingKey, task);
      try {
        return await task;
      } finally {
        if (this.pending.get(pendingKey) === task)
          this.pending.delete(pendingKey);
      }
    });
  }
  async appearances(days: number, refresh = false): Promise<Appearance[]> {
    return (
      await Promise.all(
        CAST_PAGES.map(async (title) =>
          parseAppearances(
            await this.page(title, days, refresh),
            prtsPageUrl(title),
          ),
        ),
      )
    )
      .flat()
      .map((row) => appearanceSchema.parse(row));
  }
  async storyInfo(story: Story, days: number, refresh = false) {
    const prefix = `${story.type} · `;
    const title = story.title.startsWith(prefix)
      ? story.title.slice(prefix.length)
      : story.title;
    if (story.type === '主线') {
      const summary = parseMainIntro(
        await this.page(MAIN_INTRO_PAGE, days, refresh),
        title,
      );
      return chapterInfoSchema.parse(
        summary ? { summary, sourceUrl: prtsPageUrl(MAIN_INTRO_PAGE) } : {},
      );
    }
    const summary = parseActivityIntros(
      await this.page(INTRO_PAGE, days, refresh),
    ).get(normalizeSearch(title));
    return chapterInfoSchema.parse(
      summary
        ? {
            summary,
            sourceUrl: `${prtsPageUrl(INTRO_PAGE)}#${encodeURIComponent(title)}`,
          }
        : {},
    );
  }
}
