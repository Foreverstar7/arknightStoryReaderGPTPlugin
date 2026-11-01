import { z } from 'zod';
import { ReaderError, type StorySource } from '../data/source.js';
import { blockWords } from '../domain/reading.js';
import {
  cacheInputSchema,
  chapterInputSchema,
  chapterSchema,
  initialState,
  recordInputSchema,
  settingsSchema,
  type Chapter,
  type ReadingState,
  type Snapshot,
  type ToolName,
} from '../shared/contracts.js';
import { ContentCache } from '../storage/files.js';
import { ReadingStore } from '../storage/reading-store.js';

export class ReaderService {
  readonly records: ReadingStore;
  readonly cache: ContentCache;
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
    return {
      stories: await this.source.catalog(),
      state,
      sourceLabel: this.source.label,
    };
  }
  async chapter(id: string, refresh = false): Promise<Chapter> {
    const settings = (await this.records.read()).settings;
    const cached = refresh
      ? null
      : await this.cache.get(id, settings.retentionDays);
    if (cached) return cached;
    const chapter = chapterSchema.parse(await this.source.chapter(id));
    if (chapter.id !== id)
      throw new ReaderError('parse', '来源返回了不同的篇目标识，未覆盖缓存。');
    await this.cache.put(chapter);
    return chapter;
  }
  async record(input: unknown): Promise<ReadingState> {
    const change = recordInputSchema.parse(input);
    const chapter = await this.chapter(change.chapterId);
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
      chapter.blocks
        .slice(0, index)
        .reduce((n, item) => n + blockWords(item), 0) +
      Math.floor(blockWords(block) * change.last.fraction);
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
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });
  }
  async call(name: ToolName, input: unknown): Promise<object> {
    switch (name) {
      case 'reader_open':
        return { ready: true, source: 'fixture' };
      case 'reader_snapshot':
        z.object({}).parse(input);
        return this.snapshot();
      case 'reader_chapter': {
        const args = chapterInputSchema.parse(input);
        return this.chapter(args.chapterId, args.refresh);
      }
      case 'reader_record':
        return this.record(input);
      case 'reader_settings': {
        const settings = settingsSchema.parse(input);
        return this.records.change((state) => ({ ...state, settings }));
      }
      case 'reader_clear_cache': {
        const { scope } = cacheInputSchema.parse(input);
        // No image files exist in the fixture slice. Never touches reading/.
        if (scope === 'all') await this.cache.clear();
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
