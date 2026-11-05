import {
  ReaderError,
  type StorySource,
  type ImageTarget,
} from '../data/source.js';
import { migrateRecord, readingLayout, wordsAt } from '../domain/revisions.js';
import { WordCountStore } from '../storage/word-counts.js';
import {
  imageResultSchema,
  type Chapter,
  type ReadingState,
  type Snapshot,
  type ToolName,
  type ImageInput,
  type ReadingLayout,
  type ChapterCount,
  type RecordInput,
} from '../shared/contracts.js';
import {
  parseToolInput,
  type ToolArgs,
  type ToolHandlers,
  type ToolOutput,
} from '../shared/tools.js';
import { CacheCoordinator, cacheScopes } from '../storage/cache-coordinator.js';
import { ContentCache } from '../storage/files.js';
import { ReadingStore } from '../storage/reading-store.js';
import { ChapterContent } from './chapter-content.js';

function historyToken(state: ReadingState, storyId: string) {
  return `${state.historyEpoch ?? 0}:${state.storyHistoryEpochs?.[storyId] ?? 0}`;
}

export class ReaderService {
  readonly records: ReadingStore;
  readonly cache: ContentCache;
  private readonly coordinator: CacheCoordinator;
  private readonly counts: WordCountStore;
  private readonly content: ChapterContent;
  private readonly imageTargets = new Map<string, Map<string, ImageTarget>>();
  // Minimal indexes for pages already opened in this process, not a body cache.
  // Scroll saves must keep working after the user clears public content files.
  private readonly opened = new Map<string, ReadingLayout>();
  private readonly openedHistory = new Map<string, string>();
  private remember(chapter: Chapter, layout = readingLayout(chapter)) {
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
            speaker: leaf.name,
            resources: leaf.scene?.slots.map((slot) => slot.resource) ?? [],
          });
        if (leaf.kind === 'cg')
          targets.set(leaf.id, {
            kind: 'cg',
            resource: leaf.resource,
            composition: leaf.composition,
          });
      }
    }
    this.imageTargets.set(chapter.id, targets);
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
    this.content = new ChapterContent(
      source,
      this.cache,
      this.counts,
      this.coordinator,
    );
  }
  async snapshot(refreshCatalog = false): Promise<Snapshot> {
    return this.coordinator.run(() => this.loadSnapshot(refreshCatalog));
  }
  private async loadSnapshot(refreshCatalog: boolean): Promise<Snapshot> {
    const { settings } = await this.records.read();
    if (!refreshCatalog) {
      await this.cache.expire(settings.retentionDays);
      await this.source.expire?.(settings.retentionDays);
    }
    const catalog = await this.source.catalog(
      settings.retentionDays,
      refreshCatalog,
    );
    const state = await this.records.read();
    const counts = this.counts.all();
    return {
      stories: catalog.map((story) => ({
        ...story,
        chapters: story.chapters.map((chapter) => {
          const count = counts.get(chapter.id);
          return count?.storyId === story.id &&
            this.source.isCurrentRevision?.(count.revision) !== false
            ? {
                ...chapter,
                wordCount: count.wordCount,
                wordCountRevision: count.revision,
                wordCountVerifiedAt: count.verifiedAt,
                contentKind: count.contentKind,
              }
            : state.records[chapter.id] &&
                this.source.isCurrentRevision?.(
                  state.records[chapter.id]?.revision ?? '',
                ) === false
              ? { ...chapter, wordCountRevision: 'source-reparse-pending' }
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
      const { chapter, cached, count } = await this.content.acquire(
        id,
        state.settings.retentionDays,
        { kind: 'prepare' },
      );
      if (chapter !== cached) await this.cache.put(chapter);
      return count;
    });
  }
  private async loadChapter(id: string, refresh: boolean): Promise<Chapter> {
    const before = await this.records.read();
    const expected =
      before.chapterRevisions?.[id] ?? before.records[id]?.revision;
    const { chapter, cached } = await this.content.acquire(
      id,
      before.settings.retentionDays,
      { kind: 'open', refresh, expectedRevision: expected },
    );
    const layout = readingLayout(chapter);
    const cachedLayout = cached ? readingLayout(cached) : undefined;
    const openedState = await this.records.change((state) => {
      if (
        historyToken(state, chapter.storyId) !==
        historyToken(before, chapter.storyId)
      )
        throw new ReaderError(
          'conflict',
          '阅读记录已清除，请重新打开篇目后继续。',
        );
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
    this.remember(chapter, layout);
    const token = historyToken(openedState, chapter.storyId);
    this.openedHistory.set(id, token);
    return { ...chapter, historyToken: token };
  }
  async record(change: RecordInput): Promise<ReadingState> {
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
      // A clear in another process/window must also fence a delayed save. Older
      // clients may reuse the token of a page explicitly opened in this process.
      const expectedHistory =
        change.historyToken ?? this.openedHistory.get(chapter.id) ?? '0:0';
      if (expectedHistory !== historyToken(state, chapter.storyId))
        throw new ReaderError(
          'conflict',
          '阅读记录已清除，请重新打开篇目后继续。',
        );
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
    return (await this.imageForTransfer(input)).image;
  }
  async imageForTransfer(input: ImageInput, expectedEpoch?: string) {
    return this.coordinator.run(async () => {
      const cacheEpoch = this.coordinator.requestKey('images');
      // A later MCP part belongs to the original request, not a new fetch after
      // clearing. Check the shared epoch before consulting any source or cache.
      if (expectedEpoch !== undefined && expectedEpoch !== cacheEpoch)
        throw new ReaderError(
          'conflict',
          '图片缓存已清理，原传输已停止；需要时请重试图片。',
        );
      const image = await this.loadImage(input);
      this.coordinator.assertCurrent('images');
      return { image, cacheEpoch };
    });
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
  /** Untrusted HTTP/MCP arguments are decoded once before typed dispatch. */
  async call<Name extends ToolName>(
    name: Name,
    input: unknown,
  ): Promise<ToolOutput<Name>> {
    return this.execute(name, parseToolInput(name, input));
  }
  /** MCP's registered schema has already decoded these arguments. */
  async execute<Name extends ToolName>(
    name: Name,
    args: ToolArgs<Name>,
  ): Promise<ToolOutput<Name>> {
    return this.handlers[name](args);
  }
  private readonly handlers: ToolHandlers = {
    reader_open: async () => ({ ready: true, source: this.source.label }),
    reader_snapshot: async ({ refreshCatalog }) =>
      this.snapshot(refreshCatalog),
    reader_chapter: async ({ chapterId, refresh }) =>
      this.chapter(chapterId, refresh),
    reader_prepare_chapter: async ({ chapterId }) =>
      this.prepareChapter(chapterId),
    reader_chapter_info: async ({ chapterId }) => {
      const days = (await this.records.read()).settings.retentionDays;
      return this.coordinator.run(
        async () => (await this.source.chapterInfo?.(chapterId, days)) ?? {},
      );
    },
    reader_image: async (input) => this.image(input),
    reader_record: async (input) => this.record(input),
    reader_settings: async (settings) =>
      this.records.change((state) => ({ ...state, settings })),
    reader_clear_cache: async ({ scope }) => {
      await this.coordinator.clear(scope === 'all' ? cacheScopes : ['images']);
      return { cleared: scope };
    },
    reader_clear_history: async ({ storyId }) => {
      return this.records.change((state) => {
        const records = Object.fromEntries(
          Object.entries(state.records).filter(
            ([, record]) => storyId !== undefined && record.storyId !== storyId,
          ),
        );
        const recentChapterId =
          state.recentChapterId && records[state.recentChapterId]
            ? state.recentChapterId
            : (Object.values(records).sort((a, b) =>
                b.updatedAt.localeCompare(a.updatedAt),
              )[0]?.chapterId ?? null);
        // Keep preferences and revision guards; public counts/content live in
        // independent stores. Deletion and recent-entry selection are atomic.
        return {
          ...state,
          records,
          recentChapterId,
          ...(storyId === undefined
            ? {
                historyEpoch: (state.historyEpoch ?? 0) + 1,
                storyHistoryEpochs: {},
              }
            : {
                storyHistoryEpochs: {
                  ...state.storyHistoryEpochs,
                  [storyId]: (state.storyHistoryEpochs?.[storyId] ?? 0) + 1,
                },
              }),
        };
      });
    },
  };
}
