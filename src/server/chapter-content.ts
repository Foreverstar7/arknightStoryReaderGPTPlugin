import { ReaderError, type StorySource } from '../data/source.js';
import { chapterContentKind, chapterWords } from '../domain/reading.js';
import { chapterSchema } from '../shared/contracts.js';
import type { CacheCoordinator } from '../storage/cache-coordinator.js';
import type { ContentCache } from '../storage/files.js';
import type { WordCountStore } from '../storage/word-counts.js';

type ChapterRequest =
  | { kind: 'prepare' }
  | {
      kind: 'open';
      refresh: boolean;
      expectedRevision: string | undefined;
    };

/** Acquires public text and counts, without reading-history or image indexes.
 * The caller commits the body cache after its use case succeeds: immediately
 * for preparation, but only after record migration for an actual open.
 */
export class ChapterContent {
  constructor(
    private readonly source: StorySource,
    private readonly cache: ContentCache,
    private readonly counts: WordCountStore,
    private readonly coordinator: CacheCoordinator,
  ) {}

  async acquire(id: string, retentionDays: number, request: ChapterRequest) {
    const known = this.counts.all().get(id);
    const cached = await this.cache.get(id, retentionDays);
    const upgraded =
      cached &&
      (this.source.reparseCached ? this.source.reparseCached(cached) : cached);
    this.coordinator.assertCurrent('text');
    if (
      request.kind === 'open' &&
      !request.refresh &&
      cached &&
      request.expectedRevision &&
      cached.revision !== request.expectedRevision &&
      cached.revision !== known?.revision
    )
      throw new ReaderError(
        'conflict',
        '缓存正文与已保存的修订不同，请刷新本章；原阅读记录已保留。',
      );
    const chapter =
      !(request.kind === 'open' && request.refresh) &&
      upgraded &&
      (!known ||
        cached?.revision === known.revision ||
        upgraded.revision === known.revision)
        ? upgraded
        : chapterSchema.parse(await this.source.chapter(id, retentionDays));
    if (chapter.id !== id || chapter.blocks.length === 0)
      throw new ReaderError(
        'parse',
        request.kind === 'prepare'
          ? '来源正文不完整，未将缺失篇目计为零字数。'
          : chapter.id !== id
            ? '来源返回了不同的篇目标识，未覆盖缓存。'
            : '来源正文没有可定位段落，原缓存和阅读记录已保留。',
      );
    // Preparation has no history transaction. Keep its post-fetch epoch fence
    // before public statistics, and retain the cache's own fence at commit.
    if (request.kind === 'prepare') this.coordinator.assertCurrent('text');
    const count = this.counts.put(
      {
        chapterId: id,
        storyId: chapter.storyId,
        revision: chapter.revision,
        wordCount: chapterWords(chapter),
        contentKind: chapterContentKind(chapter),
      },
      known?.revision,
    );
    return { chapter, cached, count };
  }
}
