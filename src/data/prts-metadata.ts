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
  parserVersion: z.literal(4),
  filename: z.string().min(1),
  sourceUrl: z.string().url(),
  method: coverMethodSchema,
});

// The story navigation has chapter labels, not links to main-story metadata pages.
// This public index was verified on 2026-11-02. Only use its exact EP anchor/title
// as evidence; EP00-EP04 chapter-name art is approved for full-image display.
// Read the referenced file in its matching section, never fabricate a filename.
// If anchors change,
// fail explicitly and recheck this entry point (docs/prts-covers.md), never guess files.
const MAIN_STORY_INDEX = '关卡一览/主题曲';
// APF-YYYY chapter IDs come from the catalog. The dedicated public index supplies
// explicit year links and banner filenames; never fabricate a filename or match
// varying display titles. Recheck 活动一览 links on source edits (2026-11-03).
const APRIL_INDEX = '活动一览';
// The early three-story collection has no own activity title field. User approved
// the generic logo used by 关卡一览/活动关卡, not a current season poster.
// Exact catalog ID + source-verified file; imageinfo still resolves its URL.
// If that index stops referencing it, report incompatibility and recheck the policy.
const CONTINGENCY_ID = 'prts:活动剧情/特殊 · 危机合约';
const CONTINGENCY_INDEX = '关卡一览/活动关卡';
const CONTINGENCY_FILE = '活动名称 危机合约.png';

/** Read only direct fields; nested metadata must not become identity or art. */
function parseInfoFields(
  wiki: string,
  template: '活动信息' | 'CharinfoV2',
  sourceUrl: string,
) {
  const text = wiki.replace(/<!--[\s\S]*?-->/gu, '');
  const matches = [
    ...text.matchAll(
      new RegExp('\\{\\{\\s*' + template + '\\s*(?=[|}])', 'gu'),
    ),
  ];
  const match = matches[0];
  if (!match) return null;
  if (matches.length !== 1)
    throw new ReaderError(
      'parse',
      'PRTS 资料页含多组信息模板，无法确认对应资料。',
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
    throw new ReaderError('parse', 'PRTS 信息模板未正确闭合。', sourceUrl);
  return fields;
}

/** Only an exact, explicit identity from the named operator page is accepted. */
export function parseOperatorIdentity(
  wiki: string,
  name: string,
  sourceUrl: string,
): string | null {
  const fields = parseInfoFields(wiki, 'CharinfoV2', sourceUrl);
  if (!fields) return null;
  const value = (key: string) => {
    const matches = fields.filter(
      (field) =>
        field.includes('=') &&
        field.slice(0, field.indexOf('=')).trim() === key,
    );
    if (matches.length > 1)
      throw new ReaderError(
        'parse',
        'PRTS 干员资料有重复身份字段。',
        sourceUrl,
      );
    const field = matches[0];
    return field?.slice(field.indexOf('=') + 1).trim();
  };
  if (value('干员名') !== name) return null;
  const id = value('干员id');
  if (!id || !/^char_[0-9]+_[a-z0-9_]+$/u.test(id))
    throw new ReaderError(
      'parse',
      'PRTS 干员资料缺少有效角色编号。',
      sourceUrl,
    );
  return id;
}

export function parseActivityCover(wiki: string, sourceUrl: string) {
  const fields = parseInfoFields(wiki, '活动信息', sourceUrl);
  if (!fields)
    throw new ReaderError(
      'unsupported',
      '此资料页尚无已支持的封面字段。',
      sourceUrl,
    );
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
    parserVersion: 4,
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

/** Only the activity banner explicitly linked to the catalog's unique APF year. */
export function parseAprilCover(wiki: string, year: string, sourceUrl: string) {
  const text = wiki.replace(/<!--[\s\S]*?-->/gu, '');
  const files: string[] = [];
  for (const link of text.matchAll(
    /\[\[(?:文件|File):([^\]|]+)\|([^\]]+)\]\]/giu,
  )) {
    const params = link[2]?.split('|').map((part) => part.trim()) ?? [];
    if (params.includes(`link=愚人节活动#${year}`) && link[1])
      files.push(link[1].trim());
  }
  if (files.length !== 1 || !files[0])
    throw new ReaderError(
      'parse',
      'PRTS 活动一览未提供唯一的对应年份横幅。',
      sourceUrl,
    );
  validateCoverFilename(files[0], sourceUrl);
  return coverSchema.parse({
    parserVersion: 4,
    filename: files[0],
    sourceUrl,
    method: 'april-year-index',
  });
}

export function parseMainCover(wiki: string, title: string, sourceUrl: string) {
  const text = wiki.replace(/<!--[\s\S]*?-->/gu, '');
  const sections = [
    ...text.matchAll(
      /\{\{锚点\|(EP\d+)\}\}([\s\S]*?)(?=\{\{锚点\|EP\d+\}\}|$)/gu,
    ),
  ];
  if (!sections.length)
    throw new ReaderError(
      'parse',
      'PRTS 主题曲索引的章节结构改变。',
      sourceUrl,
    );
  const matches = sections.filter(
    (item) =>
      /<big>[^<>]*<big>([^<>]+)<\/big>/u.exec(item[2] ?? '')?.[1]?.trim() ===
      title,
  );
  if (matches.length > 1)
    throw new ReaderError(
      'parse',
      'PRTS 主题曲索引的章节标题有歧义。',
      sourceUrl,
    );
  const section = matches[0];
  if (!section || !/^EP0[0-4]$/u.test(section[1] ?? ''))
    throw new ReaderError(
      'unsupported',
      '尚未识别此主线的已批准封面来源。',
      sourceUrl,
    );
  const files = [
    ...(section[2] ?? '').matchAll(
      /\[\[(?:文件|File):(章节名称 [^\]|]+\.png)(?:\|[^\]]*)?\]\]/giu,
    ),
  ];
  const filename = files[0]?.[1];
  const sectionUrl = `${sourceUrl}#${section[1]}`;
  if (files.length !== 1 || !filename)
    throw new ReaderError(
      'parse',
      'PRTS 主线章节未提供唯一的章节原图。',
      sectionUrl,
    );
  validateCoverFilename(filename, sectionUrl);
  return coverSchema.parse({
    parserVersion: 4,
    filename,
    sourceUrl: sectionUrl,
    method: 'main-chapter-index',
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
    return this.cache.run(() =>
      this.loadCached(key, schema, days, read, refresh),
    );
  }
  private async loadCached<T>(
    key: string,
    schema: z.ZodType<T>,
    days: number,
    read: () => Promise<T>,
    refresh: boolean,
  ): Promise<T> {
    this.cache.assertCurrent();
    const value = refresh ? null : await this.cache.get(key, schema, days);
    if (value) return value;
    const pendingKey = `${this.cache.requestKey()}:${refresh}:${key}`;
    const existing = this.pending.get(pendingKey);
    if (existing) return schema.parse(await existing);
    const task = (async () => {
      const result = schema.parse(await read());
      await this.cache.put(key, result);
      return result;
    })();
    this.pending.set(pendingKey, task);
    try {
      return await task;
    } finally {
      if (this.pending.get(pendingKey) === task)
        this.pending.delete(pendingKey);
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
        if (story.id === CONTINGENCY_ID) {
          const sourceUrl = prtsPageUrl(CONTINGENCY_INDEX);
          const index = await this.cached(
            `cover-index:${CONTINGENCY_INDEX}`,
            z.string(),
            days,
            () => this.wiki(CONTINGENCY_INDEX),
            refresh,
          );
          const files = [
            ...index
              .replace(/<!--[\s\S]*?-->/gu, '')
              .matchAll(/\[\[(?:文件|File):([^\]|]+)(?:\|[^\]]*)?\]\]/giu),
          ];
          if (
            !files.some(
              (file) =>
                file[1]?.replaceAll('_', ' ').trim() === CONTINGENCY_FILE,
            )
          )
            throw new ReaderError(
              'parse',
              'PRTS 活动关卡索引不再引用已批准的危机合约通用图。',
              sourceUrl,
            );
          return coverSchema.parse({
            parserVersion: 4,
            filename: CONTINGENCY_FILE,
            sourceUrl,
            method: 'contingency-logo',
          });
        }
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
          return parseMainCover(index, title, sourceUrl);
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
    await this.cache.clear();
  }
}
