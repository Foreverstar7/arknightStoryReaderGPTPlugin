import { PrtsCatalogCache } from '../storage/prts-catalog.js';
import type {
  Chapter,
  Story,
  ImageInput,
  ReaderImage,
} from '../shared/contracts.js';
import { ReaderError, type StorySource, type ImageTarget } from './source.js';
import { readPrtsWiki, type WikiReader } from './prts-client.js';
import { parsePrtsCatalog } from './prts-catalog.js';
import { parsePrtsChapter } from './prts-script.js';
import { PrtsResources, portraitReference } from './prts-resources.js';
import { placeholderPortrait } from './prts-portrait.js';
import { PrtsMetadata } from './prts-metadata.js';

export class PrtsSource implements StorySource {
  readonly label = 'PRTS 真实剧情 · 正文与图片按需获取';
  private readonly cache: PrtsCatalogCache;
  readonly resources: PrtsResources;
  private readonly metadata: PrtsMetadata;
  private readonly catalogPending = new Map<string, Promise<Story[]>>();
  isCurrentRevision(revision: string): boolean {
    return revision.startsWith('prts-script-v4:');
  }
  reparseCached(chapter: Chapter): Chapter | null {
    if (this.isCurrentRevision(chapter.revision)) return chapter;
    if (!chapter.original) return null;
    return parsePrtsChapter(chapter.original.wiki, {
      id: chapter.id,
      storyId: chapter.storyId,
      title: chapter.title,
      pageTitle: chapter.original.pageTitle,
    });
  }
  constructor(
    root: string,
    private readonly readWiki: WikiReader = readPrtsWiki,
    request: typeof fetch = fetch,
  ) {
    this.cache = new PrtsCatalogCache(root);
    this.resources = new PrtsResources(root, readWiki, request);
    this.metadata = new PrtsMetadata(root, readWiki);
  }
  async catalog(retentionDays = 7, refresh = false): Promise<Story[]> {
    return this.cache.run(() => this.loadCatalog(retentionDays, refresh));
  }
  private async loadCatalog(
    retentionDays: number,
    refresh: boolean,
  ): Promise<Story[]> {
    // A background refresh must not hold up readers of the usable cached catalog.
    if (!refresh) {
      const cached = await this.cache.get(retentionDays);
      if (cached)
        return parsePrtsCatalog(cached.rootWiki, cached.navigationWiki);
    }
    // Cold startup and explicit refresh share one fetch within this cache epoch.
    const key = this.cache.requestKey();
    const pending = this.catalogPending.get(key);
    if (pending) return pending;
    const read = async () => {
      const rootWiki = await this.readWiki('剧情一览');
      if (!/\{\{剧情导航(?:\||\}\})/u.test(rootWiki))
        throw new ReaderError(
          'parse',
          'PRTS 剧情一览的目录转引已改变，请核对来源。',
        );
      const navigationWiki = await this.readWiki('模板:剧情导航');
      const stories = parsePrtsCatalog(rootWiki, navigationWiki);
      this.cache.assertCurrent();
      await this.cache.put({ rootWiki, navigationWiki });
      return stories;
    };
    const task = read();
    this.catalogPending.set(key, task);
    try {
      return await task;
    } finally {
      if (this.catalogPending.get(key) === task)
        this.catalogPending.delete(key);
    }
  }
  async chapter(id: string, retentionDays = 7): Promise<Chapter> {
    const story = (await this.catalog(retentionDays)).find((story) =>
      story.chapters.some((chapter) => chapter.id === id),
    );
    const meta = story?.chapters.find((chapter) => chapter.id === id);
    if (!story || !meta || !id.startsWith('prts:'))
      throw new ReaderError('not_found', `该篇目不在本次 PRTS 目录范围：${id}`);
    const pageTitle = id.slice('prts:'.length);
    const wiki = await this.readWiki(pageTitle);
    return parsePrtsChapter(wiki, {
      id,
      storyId: story.id,
      title: meta.title,
      pageTitle,
      ...(story.type === '支线' ||
      story.type === '主线' ||
      story.type === '剧情'
        ? { group: story.title }
        : {}),
    });
  }
  async chapterInfo(id: string, days: number) {
    if (
      !(await this.catalog(days)).some((story) =>
        story.chapters.some((chapter) => chapter.id === id),
      )
    )
      throw new ReaderError('not_found', '该篇目不在 PRTS 正文目录内。');
    return this.metadata.chapterInfo(id.slice('prts:'.length), days);
  }
  async image(
    input: ImageInput,
    target: ImageTarget | undefined,
    days: number,
  ): Promise<ReaderImage> {
    if (input.kind === 'cover') {
      const story = (await this.catalog(days)).find(
        (story) => story.id === input.storyId,
      );
      if (!story)
        throw new ReaderError('not_found', '该剧情不在 PRTS 正文目录内。');
      const cover = await this.metadata.cover(story, days, input.refresh);
      const image = await this.resources.fileImage(
        cover.filename,
        days,
        input.refresh,
      );
      return {
        ...image,
        attribution: { sourceUrl: cover.sourceUrl, method: cover.method },
      };
    }
    if (input.kind !== target?.kind)
      throw new ReaderError('resource_missing', '该段落没有对应图片资源。');
    if (target.kind === 'portrait') {
      let reference: string;
      try {
        reference = portraitReference(target.resources);
      } catch (error) {
        if (
          !(error instanceof ReaderError) ||
          error.code !== 'resource_missing'
        )
          throw error;
        return placeholderPortrait(
          target.resources.join(' / '),
          target.resources.length ? 'ambiguous_scene' : 'no_scene',
          error.message,
        );
      }
      return this.resources.portrait(reference, days, input.refresh);
    }
    if (!target.resource)
      throw new ReaderError('resource_missing', '该段落缺少 CG 引用。');
    return this.resources.cg(
      target.resource,
      days,
      input.refresh,
      target.composition,
    );
  }
  async expire(days: number): Promise<void> {
    await Promise.all([
      this.resources.images.expire(days),
      this.resources.mappings.expire(days),
      this.metadata.cache.expire(days),
    ]);
  }
}
