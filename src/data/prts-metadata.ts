import { z } from 'zod';
import {
  chapterInfoSchema,
  coverMethodSchema,
  type Story,
} from '../shared/contracts.js';
import { PublicCache } from '../storage/public-cache.js';
import { prtsPageUrl, type WikiReader } from './prts-client.js';
import { ReaderError } from './source.js';

// v1 cached {} for every unrecognised page. Require evidence/version so those entries
// are rechecked lazily, without clearing other public caches or any reading records.
const coverSchema = z.object({
  parserVersion: z.literal(3),
  filename: z.string().min(1),
  sourceUrl: z.string().url(),
  method: coverMethodSchema,
});

// The story navigation has chapter labels, not links to main-story metadata pages.
// This public index was verified on 2026-11-02. Only use its exact EP anchor/title
// as evidence; chapter-name logos are not cover illustrations. If anchors change,
// fail explicitly and recheck this entry point (docs/prts-covers.md), never guess files.
const MAIN_STORY_INDEX = '关卡一览/主题曲';
// APF-YYYY chapter IDs come from the catalog. The dedicated public index supplies
// its own year anchors and linked entrance illustrations; never fabricate a filename
// or match the varying display titles. Recheck apr-entry + year links on source edits.
const APRIL_INDEX = '愚人节活动';

/** A narrow activity-template reader; nested fields must not leak into title art. */
export function parseActivityCover(wiki: string, sourceUrl: string) {
  const text = wiki.replace(/<!--[\s\S]*?-->/gu, '');
  const matches = [...text.matchAll(/\{\{\s*活动信息\s*(?=[|}])/gu)];
  const match = matches[0];
  if (!match)
    throw new ReaderError(
      'unsupported',
      '此资料页尚无已支持的封面字段。',
      sourceUrl,
    );
  if (matches.length !== 1)
    throw new ReaderError(
      'parse',
      'PRTS 资料页含多组活动信息，未选择其中一张图片。',
      sourceUrl,
    );
  let depth = 1;
  let links = 0;
  let start = match.index + match[0].length;
  const fields: string[] = [];
  let closed = false;
  for (let i = start; i < text.length; i++) {
    const pair = text.slice(i, i + 2);
    if (pair === '{{') {
      depth++;
      i++;
    } else if (pair === '}}') {
      depth--;
      if (!depth) {
        fields.push(text.slice(start, i));
        closed = true;
        break;
      }
      i++;
    } else if (pair === '[[') {
      links++;
      i++;
    } else if (pair === ']]') {
      links--;
      i++;
    } else if (text[i] === '|' && depth === 1 && links === 0) {
      fields.push(text.slice(start, i));
      start = i + 1;
    }
  }
  if (!closed || links !== 0)
    throw new ReaderError('parse', 'PRTS 活动信息模板未正确闭合。', sourceUrl);
  const titles = fields.filter((field) => /^\s*标题图文件名\s*=/u.test(field));
  if (titles.length > 1)
    throw new ReaderError(
      'parse',
      'PRTS 活动信息有重复标题图字段。',
      sourceUrl,
    );
  const filename = titles[0]?.replace(/^\s*标题图文件名\s*=/u, '').trim();
  if (!filename)
    throw new ReaderError(
      'resource_missing',
      'PRTS 活动信息未提供标题图文件名；不代表源站没有其他图片。',
      sourceUrl,
    );
  validateCoverFilename(filename, sourceUrl);
  return coverSchema.parse({
    parserVersion: 3,
    filename,
    sourceUrl,
    method: 'activity-title-field',
  });
}
function validateCoverFilename(filename: string, sourceUrl: string) {
  if (/[\[\]{}<>|\r\n]/u.test(filename) || /https?:/iu.test(filename))
    throw new ReaderError(
      'parse',
      'PRTS 标题图字段不再是单一文件名。',
      sourceUrl,
    );
  if (!/\.(?:png|jpe?g|webp|gif)$/iu.test(filename))
    throw new ReaderError(
      'unsupported',
      '此标题图文件格式尚未支持。',
      sourceUrl,
    );
}

/** Only the image explicitly linked to the catalog's APF year in its index card. */
export function parseAprilCover(wiki: string, year: string, sourceUrl: string) {
  const text = wiki.replace(/<!--[\s\S]*?-->/gu, '');
  const cards = [
    ...text.matchAll(/<div\s+class="apr-entry"[^>]*>([\s\S]*?)<\/div>/gu),
  ];
  if (!cards.length)
    throw new ReaderError(
      'parse',
      'PRTS 四月辑录年份索引结构改变。',
      sourceUrl,
    );
  const files: string[] = [];
  for (const card of cards) {
    for (const link of (card[1] ?? '').matchAll(
      /\[\[(?:文件|File):([^\]|]+)\|([^\]]+)\]\]/giu,
    )) {
      const params = link[2]?.split('|').map((part) => part.trim()) ?? [];
      if (params.includes(`link=${APRIL_INDEX}#${year}`) && link[1])
        files.push(link[1].trim());
    }
  }
  if (files.length !== 1 || !files[0])
    throw new ReaderError(
      'parse',
      'PRTS 四月辑录未提供唯一的对应年份入口图。',
      sourceUrl,
    );
  validateCoverFilename(files[0], sourceUrl);
  return coverSchema.parse({
    parserVersion: 3,
    filename: files[0],
    sourceUrl: `${sourceUrl}#${year}`,
    method: 'april-year-index',
  });
}
export function parseStageSummary(wiki: string): string | undefined {
  const field = /(?:^|\n)\|关卡描述\s*=([^\n]*)/u.exec(wiki)?.[1];
  // The first paragraph is source prose; following lines often describe battle modifiers.
  const prose = field?.split(/<br\s*\/?\s*>/iu)[0]?.trim();
  if (!prose) return undefined;
  const plain = prose
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/gu, '$2')
    .replace(/\[\[([^\]]+)\]\]/gu, '$1')
    .replace(/'{2,3}/gu, '');
  if (/[{}<>]/u.test(plain))
    throw new ReaderError(
      'parse',
      'PRTS 关卡简介含尚未支持的 Wiki 标记，未展示原始模板。',
    );
  return plain;
}

export class PrtsMetadata {
  readonly cache: PublicCache;
  private generation = 0;
  private readonly pending = new Map<string, Promise<unknown>>();
  constructor(
    root: string,
    private readonly wiki: WikiReader,
  ) {
    this.cache = new PublicCache(root, 'metadata');
  }
  private async page(
    title: string,
  ): Promise<{ wiki: string; title: string } | null> {
    const visited = new Set<string>();
    for (let i = 0; i < 4; i++) {
      if (visited.has(title))
        throw new ReaderError('parse', 'PRTS 资料页发生循环重定向。');
      visited.add(title);
      let wiki;
      try {
        wiki = await this.wiki(title);
      } catch (error) {
        if (error instanceof ReaderError && error.code === 'not_found')
          return null;
        if (error instanceof ReaderError && !error.sourceUrl)
          throw new ReaderError(error.code, error.message, prtsPageUrl(title));
        throw error;
      }
      const redirect = /^#(?:redirect|重定向)\s*\[\[([^\]#]+)\]\]/iu.exec(
        wiki.trim(),
      )?.[1];
      if (!redirect) return { wiki, title };
      title = redirect;
    }
    throw new ReaderError('parse', 'PRTS 资料页重定向过多。');
  }
  private async cached<T>(
    key: string,
    schema: z.ZodType<T>,
    days: number,
    read: () => Promise<T>,
    refresh = false,
  ): Promise<T> {
    const value = refresh ? null : await this.cache.get(key, schema, days);
    if (value) return value;
    const existing = this.pending.get(key);
    if (existing) return schema.parse(await existing);
    const generation = this.generation;
    const task = (async () => {
      const result = schema.parse(await read());
      if (generation === this.generation) await this.cache.put(key, result);
      return result;
    })();
    this.pending.set(key, task);
    try {
      return await task;
    } finally {
      if (this.pending.get(key) === task) this.pending.delete(key);
    }
  }
  async chapterInfo(pageTitle: string, days: number) {
    const title = pageTitle.replace(/\/(?:BEG|END|NBT)(?:\/.*)?$/u, '');
    // ENTRY and special multi-story pages have no verified stage-description contract.
    if (title === pageTitle || !/^\S+\s+\S/u.test(title)) return {};
    return this.cached(`stage:${title}`, chapterInfoSchema, days, async () => {
      const page = await this.page(title);
      if (!page) return {};
      return {
        summary: parseStageSummary(page.wiki),
        sourceUrl: prtsPageUrl(page.title),
      };
    });
  }
  async cover(
    story: Pick<Story, 'title' | 'type'> &
      Partial<Pick<Story, 'id' | 'chapters'>>,
    days: number,
    refresh = false,
  ) {
    // Undo only the display prefix constructed in parsePrtsCatalog; no category
    // exceptions, title aliases or per-story filenames. A candidate page must still
    // declare its own unambiguous activity title field before any image is requested.
    const prefix = `${story.type} · `;
    const title = story.title.startsWith(prefix)
      ? story.title.slice(prefix.length)
      : story.title;
    return this.cached(
      // Use stable IDs when available: two source groups both display 特殊 · 剧情.
      `cover:${story.id ?? title}`,
      coverSchema,
      days,
      async () => {
        if (story.type === '四月辑录') {
          // A year also contains minigame stories with different IDs. The APF
          // entry anchors the source group; don't require every story to be APF.
          const years = [
            ...new Set(
              story.chapters?.flatMap((chapter) => {
                const year = /^prts:APF-(\d{4})\/NBT$/u.exec(chapter.id)?.[1];
                return year ? [year] : [];
              }) ?? [],
            ),
          ];
          const year = years[0];
          if (years.length !== 1 || !year)
            throw new ReaderError(
              'unsupported',
              '四月辑录篇目缺少唯一年份来源。',
              prtsPageUrl(APRIL_INDEX),
            );
          const index = await this.cached(
            `cover-index:${APRIL_INDEX}`,
            z.string(),
            days,
            () => this.wiki(APRIL_INDEX),
            refresh,
          );
          return parseAprilCover(index, year, prtsPageUrl(APRIL_INDEX));
        }
        const page = await this.page(title);
        if (page) return parseActivityCover(page.wiki, prtsPageUrl(page.title));
        if (story.type === '主线') {
          const sourceUrl = prtsPageUrl(MAIN_STORY_INDEX);
          const index = await this.cached(
            `cover-index:${MAIN_STORY_INDEX}`,
            z.string(),
            days,
            () => this.wiki(MAIN_STORY_INDEX),
            refresh,
          );
          const sections = [
            ...index.matchAll(
              /\{\{锚点\|(EP\d+)\}\}([\s\S]*?)(?=\{\{锚点\|EP\d+\}\}|$)/gu,
            ),
          ];
          if (!sections.length)
            throw new ReaderError(
              'parse',
              'PRTS 主题曲索引的章节结构改变。',
              sourceUrl,
            );
          const section = sections.find(
            (item) =>
              /<big>[^<>]*<big>([^<>]+)<\/big>/u
                .exec(item[2] ?? '')?.[1]
                ?.trim() === title,
          );
          throw new ReaderError(
            'unsupported',
            section
              ? '主题曲索引提供章节标识图，尚无已确认的封面来源。'
              : '尚未识别此主线的封面来源。',
            section ? `${sourceUrl}#${section[1]}` : sourceUrl,
          );
        }
        throw new ReaderError(
          'not_found',
          `PRTS 封面资料页不存在：${title}（HTTP 404）；不能据此认定没有图片。`,
          prtsPageUrl(title),
        );
      },
      refresh,
    );
  }
  async clear() {
    this.generation++;
    this.pending.clear();
    await this.cache.clear();
  }
}
