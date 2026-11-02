import { z } from 'zod';
import {
  ReaderError,
  type StorySource,
  type ImageTarget,
} from '../data/source.js';
import { blockWords, chapterWords } from '../domain/reading.js';
import {
  cacheInputSchema,
  chapterInputSchema,
  imageInputSchema,
  imageResultSchema,
  chapterSchema,
  initialState,
  recordInputSchema,
  settingsSchema,
  type Chapter,
  type ReadingState,
  type Snapshot,
  type ToolName,
  type ImageInput,
} from '../shared/contracts.js';
import { ContentCache } from '../storage/files.js';
import { ReadingStore } from '../storage/reading-store.js';

export class ReaderService {
  readonly records: ReadingStore;
  readonly cache: ContentCache;
  private readonly imageTargets = new Map<string, Map<string, ImageTarget>>();
  // Minimal indexes for pages already opened in this process, not a body cache.
  // Scroll saves must keep working after the user clears public content files.
  private readonly opened = new Map<
    string,
    {
      id: string;
      storyId: string;
      revision: string;
      totalWords: number;
      blocks: { id: string; words: number }[];
    }
  >();
  private remember(chapter: Chapter) {
    const targets = new Map<string, ImageTarget>();
    for (const block of chapter.blocks) {
      const leaves =
        block.kind === 'choices'
          ? [
              ...block.options.flatMap((option) => option.blocks),
              ...(block.shared?.flatMap((group) => group.blocks) ?? []),
            ]
          : [block];
      for (const leaf of leaves) {
        if (leaf.kind === 'speech')
          targets.set(leaf.id, {
            kind: 'portrait',
            resources: leaf.scene?.slots.map((slot) => slot.resource) ?? [],
          });
        if (leaf.kind === 'cg')
          targets.set(leaf.id, { kind: 'cg', resource: leaf.resource });
      }
    }
    this.imageTargets.set(chapter.id, targets);
    const layout = {
      id: chapter.id,
      storyId: chapter.storyId,
      revision: chapter.revision,
      totalWords: chapterWords(chapter),
      blocks: chapter.blocks.map((block) => ({
        id: block.id,
        words: blockWords(block),
      })),
    };
    this.opened.set(chapter.id, layout);
    return layout;
  }
  constructor(
    private readonly source: StorySource,
    root: string,
  ) {
    this.records = new ReadingStore(root);
    this.cache = new ContentCache(root);
  }
  async snapshot(): Promise<Snapshot> {
    const state = await this.records.read();
    await this.cache.expire(state.settings.retentionDays);
    await this.source.expire?.(state.settings.retentionDays);
    return {
      stories: await this.source.catalog(state.settings.retentionDays),
      state,
      sourceLabel: this.source.label,
    };
  }
  async chapter(id: string, refresh = false): Promise<Chapter> {
    const settings = (await this.records.read()).settings;
    const cached = refresh
      ? null
      : await this.cache.get(id, settings.retentionDays);
    if (cached) {
      this.remember(cached);
      return cached;
    }
    const chapter = chapterSchema.parse(
      await this.source.chapter(id, settings.retentionDays),
    );
    if (chapter.id !== id)
      throw new ReaderError('parse', '来源返回了不同的篇目标识，未覆盖缓存。');
    await this.cache.put(chapter);
    this.remember(chapter);
    return chapter;
  }
  async record(input: unknown): Promise<ReadingState> {
    const change = recordInputSchema.parse(input);
    const chapter =
      this.opened.get(change.chapterId) ??
      this.remember(await this.chapter(change.chapterId));
    if (change.revision !== chapter.revision)
      throw new ReaderError(
        'conflict',
        '正文版本已改变，请刷新后继续；原阅读记录已保留。',
      );
    const index = chapter.blocks.findIndex(
      (block) => block.id === change.last.blockId,
    );
    if (index < 0)
      throw new ReaderError(
        'conflict',
        '原段落已不在当前正文中，请重新打开篇目。',
      );
    const block = chapter.blocks[index];
    if (!block) throw new ReaderError('parse', '篇目缺少定位段落。');
    const atEnd =
      change.atEnd &&
      index === chapter.blocks.length - 1 &&
      change.last.fraction === 1;
    const words =
      chapter.blocks.slice(0, index).reduce((n, item) => n + item.words, 0) +
      Math.floor(block.words * change.last.fraction);
    return this.records.change((state) => {
      const previous = state.records[chapter.id];
      if (previous && previous.revision !== chapter.revision) {
        throw new ReaderError(
          'conflict',
          '正文已更新，旧进度需要兼容迁移；不会静默覆盖。',
        );
      }
      return {
        ...state,
        recentChapterId: chapter.id,
        records: {
          ...state.records,
          [chapter.id]: {
            chapterId: chapter.id,
            storyId: chapter.storyId,
            revision: chapter.revision,
            last: change.last,
            furthestWords: Math.max(previous?.furthestWords ?? 0, words),
            complete: previous?.complete === true || atEnd,
            totalWords: chapter.totalWords,
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });
  }
  async image(input: ImageInput) {
    if (!this.source.image)
      throw new ReaderError('resource_missing', '当前来源没有真实图片。');
    const days = (await this.records.read()).settings.retentionDays;
    if (input.kind !== 'cover' && !this.imageTargets.has(input.chapterId))
      await this.chapter(input.chapterId);
    const target =
      input.kind === 'cover'
        ? undefined
        : this.imageTargets.get(input.chapterId)?.get(input.blockId);
    return imageResultSchema.parse(
      await this.source.image(input, target, days),
    );
  }
  async call(name: ToolName, input: unknown): Promise<object> {
    switch (name) {
      case 'reader_open':
        return { ready: true, source: this.source.label };
      case 'reader_snapshot':
        z.object({}).parse(input);
        return this.snapshot();
      case 'reader_chapter': {
        const args = chapterInputSchema.parse(input);
        return this.chapter(args.chapterId, args.refresh);
      }
      case 'reader_chapter_info': {
        const args = chapterInputSchema.pick({ chapterId: true }).parse(input);
        const days = (await this.records.read()).settings.retentionDays;
        return (await this.source.chapterInfo?.(args.chapterId, days)) ?? {};
      }
      case 'reader_image':
        return this.image(imageInputSchema.parse(input));
      case 'reader_record':
        return this.record(input);
      case 'reader_settings': {
        const settings = settingsSchema.parse(input);
        return this.records.change((state) => ({ ...state, settings }));
      }
      case 'reader_clear_cache': {
        const { scope } = cacheInputSchema.parse(input);
        if (scope === 'all') {
          await this.cache.clear();
          await this.source.clearCache?.();
        } else await this.source.clearImages?.();
        return { cleared: scope };
      }
      case 'reader_clear_history':
        z.object({}).parse(input);
        return this.records.change((state) => ({
          ...initialState(),
          settings: state.settings,
        }));
    }
  }
}
