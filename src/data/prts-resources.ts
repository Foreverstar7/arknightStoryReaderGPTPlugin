import { z } from 'zod';
import { rasterDataUrlSchema, type ReaderImage } from '../shared/contracts.js';
import { PublicCache } from '../storage/public-cache.js';
import { prtsPageUrl, type WikiReader } from './prts-client.js';
import { ReaderError } from './source.js';
import { inspectImage } from './image-format.js';

export const CHARACTER_MAP =
  'https://torappu.prts.wiki/assets/avg/character.json';
// User-approved 20 MB image budget, including the 17,835,330-byte 日暮寻路
// original. Applies only to each raster fetch; text, JSON and mapping limits stay.
export const MAX_IMAGE_BYTES = 20_000_000;
const point = z.object({ x: z.number().finite(), y: z.number().finite() });
const entrySchema = z.object({
  array: z
    .array(
      z.object({
        name: z.string(),
        alias: z.string().optional(),
        group: z.number().int().default(-1),
        image: z.string().optional(),
        face: z.string().optional(),
        body: z.number().int().nonnegative().optional(),
        index: z.number().int().nonnegative().optional(),
      }),
    )
    .min(1),
  groups: z
    .array(
      z.object({
        mode: z.string(),
        base: z.string().optional(),
        faceRect: point
          .extend({ w: z.number().positive(), h: z.number().positive() })
          .optional(),
      }),
    )
    .default([]),
});
const mapSchema = z.record(z.string(), z.unknown());
// Keep valid legacy PNG entries readable; adding formats must not evict portraits.
const rasterSchema = z.object({
  dataUrl: rasterDataUrlSchema,
  width: z.number().positive(),
  height: z.number().positive(),
});
export type ResourceLayer = {
  url: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
};

const unavailable = (message: string): never => {
  throw new ReaderError('resource_missing', message);
};
function characterUrl(key: string): string {
  if (
    !/^[a-zA-Z0-9_/$@#.-]+$/u.test(key) ||
    key.split('/').some((part) => part === '..' || !part)
  )
    throw new ReaderError('parse', 'PRTS 立绘路径不兼容，未猜测文件名。');
  return `https://torappu.prts.wiki/assets/avg/characters/${key.split('/').map(encodeURIComponent).join('/')}.png`;
}

/** Resolve the exact sprite-hub body/index or alias; no invalid-index fallback. */
export function resolvePortrait(
  raw: unknown,
  reference: string,
): ResourceLayer[] {
  const parsedMap = mapSchema.safeParse(raw);
  if (!parsedMap.success)
    throw new ReaderError('parse', 'PRTS 人物映射格式不兼容。');
  const map = parsedMap.data;
  const match = /^([^#@$]+)(?:#([1-9]\d*)|@([^$]+))?(?:\$([1-9]\d*))?$/u.exec(
    reference.toLowerCase(),
  );
  if (!match?.[1])
    throw new ReaderError(
      'unsupported',
      `不支持的 PRTS 立绘引用：${reference}`,
    );
  let base = match[1];
  let expression: string | undefined;
  if (!Object.hasOwn(map, base)) {
    const key = Object.keys(map).find((key) => base.startsWith(`${key}-`));
    if (key) {
      expression = base.slice(key.length + 1);
      base = key;
    }
  }
  if (!Object.hasOwn(map, base))
    return unavailable(`PRTS 缺少可用立绘映射：${reference}`);
  const parsed = entrySchema.safeParse(map[base]);
  if (!parsed.success)
    throw new ReaderError('parse', `PRTS 立绘映射格式不兼容：${reference}`);
  const entry = parsed.data;
  const body = Number(match[4] ?? '1') - 1;
  const index = Number(match[2] ?? '1') - 1;
  const candidates = entry.array.filter((item) =>
    expression
      ? item.name.toLowerCase() === expression
      : match[3]
        ? item.alias?.toLowerCase() === match[3]
        : item.body !== undefined && item.index !== undefined
          ? item.body === body && item.index === index
          : entry.array.indexOf(item) === index && body === 0,
  );
  const selected = candidates[0];
  if (candidates.length !== 1 || !selected)
    return unavailable(`PRTS 立绘条目不存在或有歧义：${reference}`);
  if (selected.group === -1 && selected.image)
    return [{ url: characterUrl(selected.image), x: 0, y: 0 }];
  const group = entry.groups[selected.group];
  if (
    group?.mode !== 'face_overlay' ||
    !group.base ||
    !group.faceRect ||
    !selected.face
  )
    throw new ReaderError(
      'unsupported',
      `PRTS 立绘组合格式尚不兼容：${reference}`,
    );
  return [
    { url: characterUrl(group.base), x: 0, y: 0 },
    {
      url: characterUrl(selected.face),
      x: group.faceRect.x,
      y: group.faceRect.y,
      width: group.faceRect.w,
      height: group.faceRect.h,
    },
  ];
}

export function portraitReference(values: string[]): string {
  const resources = [...new Set(values)];
  if (resources.length !== 1 || !resources[0])
    return unavailable(
      resources.length > 1
        ? '此处有多种场景立绘，无法确认姓名对应资源。'
        : '此处没有可确认的场景立绘。',
    );
  return resources[0];
}

export function parseImageIndex(wiki: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const line of wiki.trim().split(/\r?\n/u)) {
    const comma = line.indexOf(',');
    const key = line.slice(0, comma).trim().toLowerCase();
    const url = line.slice(comma + 1).trim();
    if (comma < 1 || !key || result.has(key) || !safeImageUrl(url))
      throw new ReaderError('parse', 'PRTS 图片索引格式改变或存在重复资源。');
    result.set(key, url);
  }
  return result;
}
export function safeImageUrl(raw: string) {
  try {
    const url = new URL(raw);
    return (
      url.protocol === 'https:' &&
      ['media.prts.wiki', 'torappu.prts.wiki'].includes(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.port
    );
  } catch {
    return false;
  }
}

export async function publicResponse(
  url: string,
  request: typeof fetch = fetch,
): Promise<Response> {
  let response;
  try {
    response = await request(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new ReaderError('network', `PRTS 资源连接失败或超时：${url}`, url);
  }
  if (response.status === 404)
    throw new ReaderError(
      'resource_missing',
      `PRTS 资源不存在（HTTP 404）：${url}`,
      url,
    );
  if (!response.ok)
    throw new ReaderError(
      'network',
      `PRTS 资源返回 HTTP ${response.status}：${url}`,
      url,
    );
  return response;
}
export async function limitedBytes(
  response: Response,
  limit: number,
): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    if (!response.body) throw new Error();
    for await (const chunk of response.body) {
      length += chunk.length;
      if (length > limit)
        throw new ReaderError('parse', 'PRTS 单个资源超过取数上限。');
      chunks.push(chunk);
    }
  } catch (error) {
    if (error instanceof ReaderError) throw error;
    throw new ReaderError('network', 'PRTS 资源传输中断，请重试。');
  }
  return Buffer.concat(chunks);
}

export class PrtsResources {
  readonly mappings: PublicCache;
  readonly images: PublicCache;
  private readonly pending = new Map<string, Promise<unknown>>();
  constructor(
    root: string,
    private readonly wiki: WikiReader,
    private readonly request: typeof fetch = fetch,
  ) {
    this.mappings = new PublicCache(root, 'mapping');
    this.images = new PublicCache(root, 'images');
  }
  private async cached<T>(
    cache: PublicCache,
    key: string,
    schema: z.ZodType<T>,
    days: number,
    fetchValue: () => Promise<T>,
    refresh = false,
  ): Promise<T> {
    return cache.run(() =>
      this.loadCached(cache, key, schema, days, fetchValue, refresh),
    );
  }
  private async loadCached<T>(
    cache: PublicCache,
    key: string,
    schema: z.ZodType<T>,
    days: number,
    fetchValue: () => Promise<T>,
    refresh: boolean,
  ): Promise<T> {
    cache.assertCurrent();
    const cached = refresh ? null : await cache.get(key, schema, days);
    if (cached) return cached;
    const pendingKey = `${cache.scope}:${cache.requestKey()}:${refresh}:${key}`;
    const existing = this.pending.get(pendingKey);
    if (existing) return schema.parse(await existing);
    const task = (async () => {
      const value = schema.parse(await fetchValue());
      await cache.put(key, value);
      return value;
    })();
    this.pending.set(pendingKey, task);
    try {
      return await task;
    } finally {
      if (this.pending.get(pendingKey) === task)
        this.pending.delete(pendingKey);
    }
  }
  async portrait(
    reference: string,
    days: number,
    refresh = false,
  ): Promise<ReaderImage> {
    return this.images.run(() => this.loadPortrait(reference, days, refresh));
  }
  private async loadPortrait(
    reference: string,
    days: number,
    refresh: boolean,
  ): Promise<ReaderImage> {
    const map = await this.cached(
      this.mappings,
      CHARACTER_MAP,
      mapSchema,
      days,
      async () => {
        const bytes = await limitedBytes(
          await publicResponse(CHARACTER_MAP, this.request),
          4_000_000,
        );
        try {
          return mapSchema.parse(JSON.parse(bytes.toString('utf8')));
        } catch {
          throw new ReaderError('parse', 'PRTS 人物映射没有返回兼容 JSON。');
        }
      },
      refresh,
    );
    return this.render(
      resolvePortrait(map, reference),
      reference,
      CHARACTER_MAP,
      days,
      refresh,
    );
  }
  async cg(
    reference: string,
    days: number,
    refresh = false,
  ): Promise<ReaderImage> {
    return this.images.run(() => this.loadCg(reference, days, refresh));
  }
  private async loadCg(
    reference: string,
    days: number,
    refresh: boolean,
  ): Promise<ReaderImage> {
    const text = await this.cached(
      this.mappings,
      'Widget:Data_Image',
      z.string(),
      days,
      () => this.wiki('Widget:Data_Image'),
      refresh,
    );
    const url = parseImageIndex(text).get(reference.toLowerCase());
    if (!url) return unavailable(`PRTS 图片索引没有资源：${reference}`);
    return this.render(
      [{ url, x: 0, y: 0 }],
      reference,
      prtsPageUrl('Widget:Data_Image'),
      days,
      refresh,
    );
  }
  async fileImage(
    filename: string,
    days: number,
    refresh = false,
  ): Promise<ReaderImage> {
    return this.images.run(() => this.loadFileImage(filename, days, refresh));
  }
  private async loadFileImage(
    filename: string,
    days: number,
    refresh: boolean,
  ): Promise<ReaderImage> {
    const url = await this.cached(
      this.mappings,
      `file:${filename}`,
      z.string().url(),
      days,
      async () => {
        const api = new URL('https://prts.wiki/api.php');
        api.search = new URLSearchParams({
          action: 'query',
          format: 'json',
          prop: 'imageinfo',
          iiprop: 'url',
          titles: `File:${filename}`,
        }).toString();
        const bytes = await limitedBytes(
          await publicResponse(api.href, this.request),
          100_000,
        );
        let raw: unknown;
        try {
          raw = JSON.parse(bytes.toString('utf8'));
        } catch {
          throw new ReaderError('parse', 'PRTS 文件信息不是 JSON。');
        }
        const data = z
          .object({
            query: z.object({
              pages: z.record(
                z.string(),
                z.object({
                  missing: z.union([z.string(), z.boolean()]).optional(),
                  imageinfo: z
                    .array(z.object({ url: z.string().url() }))
                    .optional(),
                }),
              ),
            }),
          })
          .safeParse(raw);
        if (!data.success)
          throw new ReaderError('parse', 'PRTS 文件信息格式改变。');
        const pages = Object.values(data.data.query.pages);
        const page = pages[0];
        const sourceUrl = prtsPageUrl(`File:${filename}`);
        if (pages.length !== 1 || !page)
          throw new ReaderError(
            'parse',
            'PRTS 文件信息没有返回唯一文件条目。',
            sourceUrl,
          );
        if (Object.hasOwn(page, 'missing'))
          throw new ReaderError(
            'resource_missing',
            `PRTS 文件信息确认资源缺失：${filename}`,
            sourceUrl,
          );
        const info = page.imageinfo?.[0];
        if (page.imageinfo?.length !== 1 || !info || !safeImageUrl(info.url))
          throw new ReaderError(
            'parse',
            'PRTS 文件信息缺少唯一且受支持的图片地址。',
            sourceUrl,
          );
        return info.url;
      },
      refresh,
    );
    return this.render(
      [{ url, x: 0, y: 0 }],
      filename,
      prtsPageUrl(`File:${filename}`),
      days,
      refresh,
    );
  }
  private async render(
    layers: ResourceLayer[],
    resource: string,
    sourceUrl: string,
    days: number,
    refresh = false,
  ): Promise<ReaderImage> {
    const rendered = [];
    for (const layer of layers) {
      const image = await this.cached(
        this.images,
        layer.url,
        rasterSchema,
        days,
        async () => {
          if (!safeImageUrl(layer.url))
            throw new ReaderError(
              'unsupported',
              'PRTS 图片来源不在已验证范围内。',
            );
          const response = await publicResponse(layer.url, this.request);
          const bytes = await limitedBytes(response, MAX_IMAGE_BYTES);
          const info = inspectImage(
            bytes,
            response.headers.get('content-type'),
            layer.url,
          );
          return {
            dataUrl: `data:${info.mime};base64,${bytes.toString('base64')}`,
            width: info.width,
            height: info.height,
          };
        },
        refresh,
      );
      rendered.push({
        ...image,
        sourceUrl: layer.url,
        x: layer.x,
        y: layer.y,
        width: layer.width ?? image.width,
        height: layer.height ?? image.height,
      });
    }
    const base = rendered[0];
    if (!base) return unavailable('PRTS 图片没有可显示图层。');
    return {
      width: base.width,
      height: base.height,
      layers: rendered,
      resource,
      sourceUrl,
    };
  }
  async clear(scope: 'images' | 'all') {
    await this.images.coordinator.clear(
      scope === 'all' ? ['images', 'mapping'] : ['images'],
    );
  }
}
