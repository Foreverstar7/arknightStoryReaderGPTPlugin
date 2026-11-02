import { z } from 'zod';
import { chapterInfoSchema } from '../shared/contracts.js';
import { PublicCache } from '../storage/public-cache.js';
import { prtsPageUrl, type WikiReader } from './prts-client.js';
import { ReaderError } from './source.js';

const coverSchema = z.object({ filename: z.string().optional() });
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
  ): Promise<T> {
    const value = await this.cache.get(key, schema, days);
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
  async cover(title: string, days: number): Promise<string | undefined> {
    const info = await this.cached(
      `cover:${title}`,
      coverSchema,
      days,
      async () => {
        const page = await this.page(title);
        return {
          filename: page
            ? /(?:^|\n)\|标题图文件名\s*=([^\n|]+)/u
                .exec(page.wiki)?.[1]
                ?.trim()
            : undefined,
        };
      },
    );
    return info.filename;
  }
  async clear() {
    this.generation++;
    this.pending.clear();
    await this.cache.clear();
  }
}
