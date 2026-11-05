import { z } from 'zod';
import {
  rasterDataUrlSchema,
  type ReaderImage,
  type CgComposition,
} from '../shared/contracts.js';
import { PublicCache } from '../storage/public-cache.js';
import {
  PRTS_ORIGIN,
  PRTS_ASSET_ORIGIN,
  prtsPageUrl,
  type WikiReader,
} from './prts-client.js';
import { ReaderError } from './source.js';
import { inspectImage } from './image-format.js';
import { parseOperatorIdentity } from './prts-metadata.js';

import {
  CHARACTER_MAP,
  STORY_VARIABLES,
  LEGACY_LINK,
  LEGACY_CHAR,
  foldedMap,
  normalizePortraitReference,
  matchSpeakerPortrait,
  resolvePortraitPlan,
  placeholderPortrait,
  UnresolvedPortraitReference,
  type ResourceLayer,
} from './prts-portrait.js';
export {
  CHARACTER_MAP,
  resolvePortrait,
  type ResourceLayer,
} from './prts-portrait.js';
import {
  MAX_IMAGE_BYTES,
  MAX_COMPOSITION_CHARACTERS,
} from '../shared/image-limits.js';
export { MAX_IMAGE_BYTES } from '../shared/image-limits.js';
const imageHosts = new Set([
  'media.prts.wiki',
  new URL(PRTS_ASSET_ORIGIN).hostname,
]);
const mapSchema = z.record(z.string(), z.unknown());
const rasterSchema = z.object({
  dataUrl: rasterDataUrlSchema,
  width: z.number().positive(),
  height: z.number().positive(),
});
const unavailable = (message: string): never => {
  throw new ReaderError('resource_missing', message);
};
export function portraitReference(values: string[]): string {
  const resources = [...new Set(values.map(normalizePortraitReference))];
  if (resources.length !== 1 || !resources[0])
    return unavailable(
      resources.length > 1
        ? '此处有多种场景立绘，无法确认姓名对应资源。'
        : '此处没有可确认的场景立绘。',
    );
  return values[0] ?? resources[0];
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
      imageHosts.has(url.hostname) &&
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
  async speakerPortrait(
    references: string[],
    speaker: string | undefined,
    days: number,
    refresh = false,
  ): Promise<ReaderImage | null> {
    const name = speaker?.trim();
    // Anonymous/group labels and Wiki control syntax must not become identity guesses.
    if (!name || !/\p{L}/u.test(name) || /[\[\]{}<>|/#?:\r\n]/u.test(name))
      return null;
    const identity = await this.cached(
      this.mappings,
      'portrait-identity-v1:' + name,
      z.object({
        id: z
          .string()
          .regex(/^char_[0-9]+_[a-z0-9_]+$/u)
          .nullable(),
      }),
      days,
      async () => {
        try {
          return {
            id: parseOperatorIdentity(
              await this.wiki(name),
              name,
              prtsPageUrl(name),
            ),
          };
        } catch (error) {
          if (error instanceof ReaderError && error.code === 'not_found')
            return { id: null };
          throw error;
        }
      },
      refresh,
    );
    if (!identity.id) return null;
    const reference = matchSpeakerPortrait(references, identity.id);
    if (!reference) return null;
    const image = await this.portrait(reference, days, refresh);
    return image.portrait
      ? {
          ...image,
          portrait: {
            ...image.portrait,
            evidence: [prtsPageUrl(name), ...image.portrait.evidence],
          },
        }
      : image;
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
    let resolved = normalizePortraitReference(reference);
    const evidence: string[] = [];
    if (resolved.startsWith('$')) {
      const variables = await this.cached(
        this.mappings,
        STORY_VARIABLES,
        mapSchema,
        days,
        async () => {
          const bytes = await limitedBytes(
            await publicResponse(STORY_VARIABLES, this.request),
            4_000_000,
          );
          try {
            return mapSchema.parse(JSON.parse(bytes.toString('utf8')));
          } catch {
            throw new ReaderError(
              'parse',
              'PRTS 剧情变量表格式不兼容。',
              STORY_VARIABLES,
            );
          }
        },
        refresh,
      );
      const value = foldedMap(variables)[resolved.slice(1)];
      if (typeof value !== 'string' || value.startsWith('$'))
        return placeholderPortrait(
          reference,
          'unresolved_variable',
          '无法确认此处人物资源，显示中性占位。',
          [STORY_VARIABLES],
        );
      resolved = normalizePortraitReference(value);
      evidence.push(STORY_VARIABLES);
    }
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
    const legacy = async () => {
      const linkText = await this.cached(
        this.mappings,
        LEGACY_LINK,
        z.string(),
        days,
        () => this.wiki(LEGACY_LINK),
        refresh,
      );
      let link: unknown;
      try {
        link = JSON.parse(linkText);
      } catch {
        throw new ReaderError(
          'parse',
          'PRTS 旧人物映射不是 JSON。',
          prtsPageUrl(LEGACY_LINK),
        );
      }
      const imageText = await this.cached(
        this.mappings,
        LEGACY_CHAR,
        z.string(),
        days,
        () => this.wiki(LEGACY_CHAR),
        refresh,
      );
      return { link, images: parseImageIndex(imageText) };
    };
    let old: Awaited<ReturnType<typeof legacy>> | undefined;
    let plan;
    try {
      plan = resolvePortraitPlan(map, resolved);
      if (!plan) {
        old = await legacy();
        plan = resolvePortraitPlan(map, resolved, old);
      }
    } catch (error) {
      if (error instanceof UnresolvedPortraitReference)
        return placeholderPortrait(
          reference,
          'unsupported_reference',
          error.message,
          [CHARACTER_MAP, ...evidence],
        );
      throw error;
    }
    if (!plan)
      return placeholderPortrait(
        reference,
        'unconfirmed_resource',
        '无法确认此处人物资源，显示中性占位。',
        [CHARACTER_MAP, prtsPageUrl(LEGACY_LINK), ...evidence],
      );
    const missingUrls: string[] = [];
    const attempted = new Set<string>();
    const renderPlan = async (candidate: NonNullable<typeof plan>) => {
      const key = JSON.stringify(candidate.layers);
      if (attempted.has(key)) return null;
      attempted.add(key);
      try {
        const image = await this.render(
          candidate.layers,
          reference,
          candidate.portrait.evidence[0] ?? CHARACTER_MAP,
          days,
          refresh,
        );
        return {
          ...image,
          portrait: {
            ...candidate.portrait,
            requested: reference,
            evidence: [
              ...evidence,
              ...candidate.portrait.evidence,
              ...missingUrls,
            ],
          },
        };
      } catch (error) {
        // Only confirmed HTTP 404 permits another sourced original/default.
        // Network, decode/format, unsupported composition and storage failures
        // remain errors and retain the normal retry path.
        if (
          !(error instanceof ReaderError) ||
          error.code !== 'resource_missing'
        )
          throw error;
        if (error.sourceUrl) missingUrls.push(error.sourceUrl);
        return null;
      }
    };
    const original = await renderPlan(plan);
    if (original) return original;
    old ??= await legacy();
    for (const mode of ['legacy', 'default'] as const) {
      const candidate = resolvePortraitPlan(map, resolved, old, mode);
      if (!candidate) continue;
      const recovered = await renderPlan(candidate);
      if (recovered) return recovered;
    }
    return placeholderPortrait(
      reference,
      'image_missing',
      '来源已确认图片缺失，暂无可靠默认立绘。',
      [...evidence, ...plan.portrait.evidence, ...missingUrls],
    );
  }

  async cg(
    reference: string,
    days: number,
    refresh = false,
    composition?: CgComposition,
  ): Promise<ReaderImage> {
    return this.images.run(() =>
      this.loadCg(reference, days, refresh, composition),
    );
  }
  private async loadCg(
    reference: string,
    days: number,
    refresh: boolean,
    composition?: CgComposition,
  ): Promise<ReaderImage> {
    const text = await this.cached(
      this.mappings,
      'Widget:Data_Image',
      z.string(),
      days,
      () => this.wiki('Widget:Data_Image'),
      refresh,
    );
    const index = parseImageIndex(text);
    if (composition) {
      const layers = composition.layers.map((layer) => {
        const url = index.get(layer.resource.trim().toLowerCase());
        if (!url || layer.kind !== 'image')
          return unavailable(`PRTS 图片索引没有资源：${layer.resource}`);
        return { ...layer, url };
      });
      const image = await this.render(
        layers,
        reference,
        prtsPageUrl('Widget:Data_Image'),
        days,
        refresh,
        composition,
      );
      return { ...image, description: composition.description };
    }
    const url = index.get(reference.trim().toLowerCase());
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
        const api = new URL('/api.php', PRTS_ORIGIN);
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
    canvas?: { width: number; height: number; fit?: 'layers' },
  ): Promise<ReaderImage> {
    const rendered = [];
    let encodedLength = 0;
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
      encodedLength += image.dataUrl.length;
      // Keep compositions within the existing 64 × 1M-character transport.
      // This is an aggregate budget; per-original raster budget stays 20 MB.
      if (encodedLength > MAX_COMPOSITION_CHARACTERS)
        throw new ReaderError(
          'unsupported',
          'CG 组合超过本次图片传输预算，请到 PRTS 查看。',
          sourceUrl,
        );
      const width = (layer.width ?? image.width) * (layer.scale ?? 1);
      const height = (layer.height ?? image.height) * (layer.scale ?? 1);
      rendered.push({
        ...image,
        sourceUrl: layer.url,
        x: layer.x - (layer.centered ? width / 2 : 0),
        y: layer.y - (layer.centered ? height / 2 : 0),
        width,
        height,
        ...(layer.rotation === undefined ? {} : { rotation: layer.rotation }),
        ...(layer.opacity === undefined ? {} : { opacity: layer.opacity }),
      });
    }
    const base = rendered[0];
    if (!base) return unavailable('PRTS 图片没有可显示图层。');
    if (canvas?.fit === 'layers') {
      // CGItem can traverse completely outside the stage. Keep all art visible
      // in this static reader, preserving relative geometry and rotation, instead
      // of presenting a blank camera crop as a successfully loaded image.
      const bounds = rendered.map((layer) => {
        const angle = ((layer.rotation ?? 0) * Math.PI) / 180;
        const width =
          Math.abs(layer.width * Math.cos(angle)) +
          Math.abs(layer.height * Math.sin(angle));
        const height =
          Math.abs(layer.width * Math.sin(angle)) +
          Math.abs(layer.height * Math.cos(angle));
        const x = layer.x + layer.width / 2;
        const y = layer.y + layer.height / 2;
        return {
          left: x - width / 2,
          top: y - height / 2,
          right: x + width / 2,
          bottom: y + height / 2,
        };
      });
      const left = Math.min(...bounds.map((bound) => bound.left));
      const top = Math.min(...bounds.map((bound) => bound.top));
      canvas = {
        width: Math.max(...bounds.map((bound) => bound.right)) - left,
        height: Math.max(...bounds.map((bound) => bound.bottom)) - top,
      };
      for (const layer of rendered) {
        layer.x -= left;
        layer.y -= top;
      }
    }
    return {
      width: canvas?.width ?? base.width,
      height: canvas?.height ?? base.height,
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
