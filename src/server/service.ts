import { z } from 'zod';
import {
  ReaderError,
  type StorySource,
  type ImageTarget,
} from '../data/source.js';
import { migrateRecord, readingLayout, wordsAt } from '../domain/revisions.js';
import { chapterWords } from '../domain/reading.js';
import { WordCountStore } from '../storage/word-counts.js';
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
  type ReadingLayout,
  type ChapterCount,
} from '../shared/contracts.js';
import { CacheCoordinator, cacheScopes } from '../storage/cache-coordinator.js';
import { ContentCache } from '../storage/files.js';
import { ReadingStore } from '../storage/reading-store.js';

export class ReaderService {
  readonly records: ReadingStore;
  readonly cache: ContentCache;
  private readonly coordinator: CacheCoordinator;
  private readonly counts: WordCountStore;
  private readonly imageTargets = new Map<string, Map<string, ImageTarget>>();
  // Minimal indexes for pages already opened in this process, not a body cache.
  // Scroll saves must keep working after the user clears public content files.
  private readonly opened = new Map<string, ReadingLayout>();
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
    const layout = readingLayout(chapter);
    this.opened.set(chapter.id, layout);
    return layout;
  }
  constructor(
    private readonly source: StorySource,
    root: string,
  ) {
    this.records = new ReadingStore(root);
    this.cache = new ContentCache(root);
    this.coordinator = new CacheCoordinator(root);
    this.counts = new WordCountStore(root);
  }
  async snapshot(): Promise<Snapshot> {
    return this.coordinator.run(() => this.loadSnapshot());
  }
  private async loadSnapshot(): Promise<Snapshot> {
    const state = await this.records.read();
    await this.cache.expire(state.settings.retentionDays);
    await this.source.expire?.(state.settings.retentionDays);
    const catalog = await this.source.catalog(state.settings.retentionDays);
    const counts = this.counts.all();
    return {
      stories: catalog.map((story) => ({
        ...story,
        chapters: story.chapters.map((chapter) => {
          const count = counts.get(chapter.id);
          return count?.storyId === story.id
            ? {
                ...chapter,
                wordCount: count.wordCount,
                wordCountRevision: count.revision,
                wordCountVerifiedAt: count.verifiedAt,
              }
            : chapter;
        }),
      })),
      state,
      sourceLabel: this.source.label,
    };
  }
  async chapter(id: string, refresh = false): Promise<Chapter> {
    return this.coordinator.run(() => this.loadChapter(id, refresh));
  }
  /** Text-only prefetch: never marks a chapter read, migrates a position, or requests images. */
  async prepareChapter(id: string): Promise<ChapterCount> {
    return this.coordinator.run(async () => {
      const state = await this.records.read();
      const known = this.counts.all().get(id);
      const cached = await this.cache.get(id, state.settings.retentionDays);
      this.coordinator.assertCurrent('text');
      const chapter =
        cached && (!known || cached.revision === known.revision)
          ? cached
          : chapterSchema.parse(
              await this.source.chapter(id, state.settings.retentionDays),
            );
      if (chapter.id !== id || chapter.blocks.length === 0)
        throw new ReaderError(
          'parse',
          '来源正文不完整，未将缺失篇目计为零字数。',
        );
      this.coordinator.assertCurrent('text');
      const count = {
        chapterId: id,
        storyId: chapter.storyId,
        revision: chapter.revision,
        wordCount: chapterWords(chapter),
      };
      const verified = this.counts.put(count, known?.revision);
      if (chapter !== cached) await this.cache.put(chapter);
      return verified;
    });
  }
  private async loadChapter(id: string, refresh: boolean): Promise<Chapter> {
    const before = await this.records.read();
    const expected =
      before.chapterRevisions?.[id] ?? before.records[id]?.revision;
    const known = this.counts.all().get(id);
    const cached = await this.cache.get(id, before.settings.retentionDays);
    this.coordinator.assertCurrent('text');
    if (
      !refresh &&
      cached &&
      expected &&
      cached.revision !== expected &&
      cached.revision !== known?.revision
    )
      throw new ReaderError(
        'conflict',
        '缓存正文与已保存的修订不同，请刷新本章；原阅读记录已保留。',
      );
    const chapter =
      !refresh && cached && (!known || cached.revision === known.revision)
        ? cached
        : chapterSchema.parse(
            await this.source.chapter(id, before.settings.retentionDays),
          );
    if (chapter.id !== id)
      throw new ReaderError('parse', '来源返回了不同的篇目标识，未覆盖缓存。');
    if (chapter.blocks.length === 0)
      throw new ReaderError(
        'parse',
        '来源正文没有可定位段落，原缓存和阅读记录已保留。',
      );
    const layout = readingLayout(chapter);
    const cachedLayout = cached ? readingLayout(cached) : undefined;
    this.counts.put(
      {
        chapterId: id,
        storyId: chapter.storyId,
        revision: chapter.revision,
        wordCount: layout.totalWords,
      },
      known?.revision,
    );
    await this.records.change((state) => {
      const active =
        state.chapterRevisions?.[id] ?? state.records[id]?.revision;
      if (active !== expected && active !== chapter.revision)
        throw new ReaderError(
          'conflict',
          '另一阅读窗口已更新正文，请重新打开；未覆盖较新的记录。',
        );
      const previous = state.records[id];
      return {
        ...state,
        chapterRevisions: { ...state.chapterRevisions, [id]: chapter.revision },
        records: previous
          ? {
              ...state.records,
              [id]: migrateRecord(previous, layout, cachedLayout),
            }
          : state.records,
      };
    });
    if (chapter !== cached) await this.cache.put(chapter);
    this.remember(chapter);
    return chapter;
  }
  async record(input: unknown): Promise<ReadingState> {
    const change = recordInputSchema.parse(input);
    const before = await this.records.read();
    const persisted = before.records[change.chapterId];
    let chapter = this.opened.get(change.chapterId) ?? persisted?.layout;
    if (!chapter) {
      // A save is strictly local, even when this process did not open the page.
      // An old host/record without an index must explicitly reopen, never fetch
      // a cleared chapter as a side effect of scrolling.
      const cached = await this.cache.get(
        change.chapterId,
        before.settings.retentionDays,
      );
      if (cached) chapter = this.remember(cached);
    }
    if (!chapter)
      throw new ReaderError(
        'conflict',
        '本窗口缺少可验证的正文定位，请重新打开篇目后继续；原阅读记录已保留。',
      );
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
    const words = wordsAt(chapter, change.last);
    return this.records.change((state) => {
      const previous = state.records[chapter.id];
      if (
        (previous && previous.revision !== chapter.revision) ||
        (state.chapterRevisions?.[chapter.id] &&
          state.chapterRevisions[chapter.id] !== chapter.revision)
      ) {
        throw new ReaderError(
          'conflict',
          '另一阅读窗口已更新正文，请刷新本章后继续；原阅读记录已保留。',
        );
      }
      return {
        ...state,
        recentChapterId: chapter.id,
        records: {
          ...state.records,
          [chapter.id]: {
            ...previous,
            chapterId: chapter.id,
            storyId: chapter.storyId,
            revision: chapter.revision,
            last: change.last,
            furthestWords: Math.max(previous?.furthestWords ?? 0, words),
            furthest:
              words >= (previous?.furthestWords ?? 0)
                ? change.last
                : previous?.furthest,
            complete: previous?.complete === true || atEnd,
            totalWords: chapter.totalWords,
            layout: chapter,
            progressKnown: previous?.progressKnown !== false || atEnd,
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });
  }
  async image(input: ImageInput) {
    return this.coordinator.run(() => this.loadImage(input));
  }
  private async loadImage(input: ImageInput) {
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
      case 'reader_prepare_chapter': {
        const args = chapterInputSchema.pick({ chapterId: true }).parse(input);
        return this.prepareChapter(args.chapterId);
      }
      case 'reader_chapter_info': {
        const args = chapterInputSchema.pick({ chapterId: true }).parse(input);
        const days = (await this.records.read()).settings.retentionDays;
        return this.coordinator.run(
          async () =>
            (await this.source.chapterInfo?.(args.chapterId, days)) ?? {},
        );
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
        await this.coordinator.clear(
          scope === 'all' ? cacheScopes : ['images'],
        );
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
