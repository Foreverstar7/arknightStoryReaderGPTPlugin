import { z } from 'zod';
import type { ReaderImage, CgComposition } from '../shared/contracts.js';
import { PublicCache } from '../storage/public-cache.js';
import { prtsPageUrl, type WikiReader } from './prts-client.js';
import { ReaderError } from './source.js';
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
  type PortraitImage,
} from './prts-portrait.js';
import {
  parseImageIndex,
  portraitMapSchema,
  readPortraitMap,
  readFileImageUrl,
} from './prts-resource-source.js';
import { rasterSchema, readRaster, renderImage } from './prts-image.js';
export {
  CHARACTER_MAP,
  resolvePortrait,
  portraitReference,
  type ResourceLayer,
} from './prts-portrait.js';
export {
  parseImageIndex,
  safeImageUrl,
  publicResponse,
  limitedBytes,
} from './prts-resource-source.js';
export { MAX_IMAGE_BYTES } from '../shared/image-limits.js';

const unavailable = (message: string): never => {
  throw new ReaderError('resource_missing', message);
};

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
    // Establish or inherit the cache generation before any async read or join.
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
  private portraitMap(
    url: typeof CHARACTER_MAP | typeof STORY_VARIABLES,
    days: number,
    refresh: boolean,
  ) {
    return this.cached(
      this.mappings,
      url,
      portraitMapSchema,
      days,
      () => readPortraitMap(url, this.request),
      refresh,
    );
  }
  private async legacyPortrait(days: number, refresh: boolean) {
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
  }

  async speakerPortrait(
    references: string[],
    speaker: string | undefined,
    days: number,
    refresh = false,
  ): Promise<PortraitImage | null> {
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
    return {
      ...image,
      portrait: {
        ...image.portrait,
        evidence: [prtsPageUrl(name), ...image.portrait.evidence],
      },
    };
  }
  async portrait(
    reference: string,
    days: number,
    refresh = false,
  ): Promise<PortraitImage> {
    return this.images.run(() => this.loadPortrait(reference, days, refresh));
  }
  private async loadPortrait(
    reference: string,
    days: number,
    refresh: boolean,
  ): Promise<PortraitImage> {
    let resolved = normalizePortraitReference(reference);
    const evidence: string[] = [];
    if (resolved.startsWith('$')) {
      const variables = await this.portraitMap(STORY_VARIABLES, days, refresh);
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
    const map = await this.portraitMap(CHARACTER_MAP, days, refresh);
    let old: Awaited<ReturnType<PrtsResources['legacyPortrait']>> | undefined;
    let plan;
    try {
      plan = resolvePortraitPlan(map, resolved);
      if (!plan) {
        old = await this.legacyPortrait(days, refresh);
        plan = resolvePortraitPlan(map, resolved, old, 'legacy');
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
    old ??= await this.legacyPortrait(days, refresh);
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
      () => readFileImageUrl(filename, this.request),
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
    return renderImage(
      layers,
      resource,
      sourceUrl,
      (url) =>
        this.cached(
          this.images,
          url,
          rasterSchema,
          days,
          () => readRaster(url, this.request),
          refresh,
        ),
      canvas,
    );
  }

  async clear(scope: 'images' | 'all') {
    await this.images.coordinator.clear(
      scope === 'all' ? ['images', 'mapping'] : ['images'],
    );
  }
}
