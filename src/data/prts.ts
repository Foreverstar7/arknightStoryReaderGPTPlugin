import { PrtsCatalogCache } from '../storage/prts-catalog.js';
import type {
  Chapter,
  Story,
  ImageInput,
  ReaderImage,
} from '../shared/contracts.js';
import { ReaderError, type StorySource, type ImageTarget } from './source.js';
import { readPrtsWiki, prtsPageUrl, type WikiReader } from './prts-client.js';
import { parsePrtsCatalog } from './prts-catalog.js';
import { parsePrtsChapter } from './prts-script.js';
import { PrtsResources, portraitReference } from './prts-resources.js';
import { placeholderPortrait, portraitResourceGroup } from './prts-portrait.js';
import { resolvePortraitView } from './prts-portrait-view.js';
import { PrtsMetadata } from './prts-metadata.js';
import { PrtsSearchData } from './prts-search.js';
import { PrtsScoreData } from './prts-score.js';

export class PrtsSource implements StorySource {
  readonly label = 'PRTS 真实剧情 · 正文与图片按需获取';
  private readonly cache: PrtsCatalogCache;
  readonly resources: PrtsResources;
  private readonly metadata: PrtsMetadata;
  private readonly searchData: PrtsSearchData;
  private readonly scoreData: PrtsScoreData;
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
    this.searchData = new PrtsSearchData(root, readWiki);
    this.scoreData = new PrtsScoreData(root, readWiki);
  }
  score(stories: Story[], days: number, refresh = false) {
    return this.scoreData.get(stories, days, refresh);
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
  appearances(days: number, refresh = false) {
    return this.searchData.appearances(days, refresh);
  }
  async storyInfo(id: string, days: number, refresh = false) {
    const story = (await this.catalog(days)).find((item) => item.id === id);
    if (!story)
      throw new ReaderError('not_found', '该剧情不在 PRTS 正文目录内。');
    return this.searchData.storyInfo(story, days, refresh);
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
    if (input.kind === 'portrait' && target?.kind === 'portrait')
      return resolvePortraitView(
        input,
        target,
        async () => {
          const image = await this.loadImage(input, target, days);
          if (!image.portrait)
            throw new ReaderError('parse', '立绘返回缺少人物状态。');
          return { ...image, portrait: image.portrait };
        },
        (reference, defaultOnly) =>
          this.resources.portrait(reference, days, input.refresh, defaultOnly),
      );
    return this.loadImage(input, target, days);
  }
  private async loadImage(
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
      if (target.speakerBinding?.absentFromScene) {
        const mismatch = target.resources.length > 0;
        const image = await this.resources.portrait(
          target.speakerBinding.reference,
          days,
          input.refresh,
          true,
        );
        return {
          ...image,
          portrait: {
            ...image.portrait,
            evidence: [
              prtsPageUrl(input.chapterId.slice(5)),
              ...image.portrait.evidence,
            ],
            ...(image.portrait.status === 'default'
              ? {
                  reason: mismatch
                    ? 'chapter_speaker_portrait_mismatch'
                    : 'chapter_confirmed_speaker_default',
                  message: mismatch
                    ? '场景立绘与发言人不一致，已根据同篇单人片段显示发言人的同造型默认立绘。'
                    : '当前未展示发言人，已根据同篇单人片段显示该角色的同造型默认立绘。',
                }
              : mismatch
                ? {
                    message: `场景立绘与发言人不一致。${image.portrait.message}`,
                  }
                : {}),
          },
        };
      }
      let reference: string;
      try {
        reference = portraitReference(target.resources);
      } catch (error) {
        if (
          !(error instanceof ReaderError) ||
          error.code !== 'resource_missing'
        )
          throw error;
        if (target.resources.length > 1) {
          const matched = await this.resources.speakerPortrait(
            target.resources,
            target.speaker,
            days,
            input.refresh,
          );
          if (matched) return matched;
          if (target.speakerBinding) {
            const binding = target.speakerBinding;
            const image = await this.resources.portrait(
              binding.reference,
              days,
              input.refresh,
              binding.default,
            );
            return {
              ...image,
              portrait: {
                ...image.portrait,
                evidence: [
                  prtsPageUrl(input.chapterId.slice(5)),
                  ...image.portrait.evidence,
                ],
                ...(image.portrait.status === 'placeholder' ||
                (image.portrait.status === 'default' && !binding.default)
                  ? {}
                  : {
                      reason: binding.default
                        ? 'chapter_same_character_default'
                        : 'chapter_single_scene',
                      message: binding.default
                        ? '同篇单人片段已确认角色；当前有多个表情，显示同造型默认立绘。'
                        : '由同篇单人片段确认的剧情指定立绘。',
                    }),
              },
            };
          }
        }
        const groups = target.resources.map(portraitResourceGroup);
        const costumeUncertain =
          groups.every((group) => group !== null) &&
          new Set(groups.map((group) => group?.split('$')[0])).size === 1 &&
          new Set(groups.map((group) => group?.split('$')[1] ?? '1')).size > 1;
        return placeholderPortrait(
          target.resources.join(' / '),
          target.resources.length
            ? costumeUncertain
              ? 'ambiguous_costume'
              : 'ambiguous_scene'
            : 'no_scene',
          target.resources.length
            ? costumeUncertain
              ? '当前片段给出了不同造型的引用，现有信息无法确认应使用哪一种。暂用中性占位，不代表源站缺图。'
              : '当前片段有多个立绘候选，暂时无法确认角色与立绘的对应关系。暂用中性占位，不代表源站缺图。'
            : '该段未提供明确的角色画面，也没有足够的同篇身份线索。暂用中性占位，尚不能判断源站是否有图。',
          [prtsPageUrl(input.chapterId.slice(5))],
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
