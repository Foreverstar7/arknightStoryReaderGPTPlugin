import { WebsiteDemoSource } from './data.js';
import type { DemoImageLoader } from './assets.js';
import { blockWords, chapterWords } from '../../src/domain/reading.js';
import {
  initialState,
  readingStateSchema,
  type Chapter,
  type ReadingRecord,
  type ReadingState,
  type RecordInput,
  type ToolName,
} from '../../src/shared/contracts.js';
import { ReaderError } from '../../src/shared/errors.js';
import {
  decodeToolResult,
  parseToolInput,
  type ToolHandlers,
  type ToolInput,
  type ToolOutput,
} from '../../src/shared/tools.js';
import type { ReaderTransport } from '../../src/ui/transport.js';
import { searchStories } from '../../src/domain/search.js';

export const DEMO_STORAGE_KEY = 'arknights-reader.website-demo.v2';
type DemoStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function anchorAt(chapter: Chapter, fraction: number): ReadingRecord['last'] {
  const last = chapter.blocks.at(-1);
  if (!last) throw new ReaderError('parse', '原创样例正文为空。');
  if (fraction === 1) return { blockId: last.id, fraction: 1 };
  let remaining = Math.floor(chapterWords(chapter) * fraction);
  for (const block of chapter.blocks) {
    const words = blockWords(block);
    if (words > 0 && remaining <= words)
      return { blockId: block.id, fraction: remaining / words };
    remaining -= words;
  }
  return { blockId: last.id, fraction: 1 };
}

/** Website-only transport. Reuses the real UI and word-count rules;
 * it never contacts MCP, localhost services, PRTS or the installed plugin. */
export class BrowserDemoTransport implements ReaderTransport {
  private state: ReadingState;
  private constructor(
    private readonly storage: DemoStorage,
    state: ReadingState,
    private readonly source: WebsiteDemoSource,
  ) {
    this.state = state;
  }

  static async create(
    storage: DemoStorage,
    loadImage?: DemoImageLoader,
  ): Promise<BrowserDemoTransport> {
    let state: ReadingState;
    try {
      const saved = storage.getItem(DEMO_STORAGE_KEY);
      state =
        saved === null
          ? initialState()
          : readingStateSchema.parse(JSON.parse(saved));
      if (
        Object.values(state.records).some(
          (record) => !record.chapterId.startsWith('fixture-'),
        )
      )
        throw new Error('Unexpected non-fixture reading record');
      const demo = new BrowserDemoTransport(
        storage,
        state,
        new WebsiteDemoSource(loadImage),
      );
      if (saved === null) await demo.seed();
      return demo;
    } catch (cause) {
      throw new ReaderError(
        'storage',
        '无法读取本页样例记录。可重置样例后重试；若浏览器禁止会话存储，请先允许存储。',
        undefined,
        { cause },
      );
    }
  }

  private persist(next: ReadingState): ReadingState {
    try {
      this.storage.setItem(DEMO_STORAGE_KEY, JSON.stringify(next));
    } catch (cause) {
      throw new ReaderError(
        'storage',
        '样例记录未能保存，请检查浏览器的会话存储权限后重试。',
        undefined,
        { cause },
      );
    }
    this.state = next;
    return structuredClone(next);
  }

  private token(storyId: string): string {
    return `${this.state.historyEpoch ?? 0}:${this.state.storyHistoryEpochs?.[storyId] ?? 0}`;
  }

  private async seed(): Promise<void> {
    // Demo anchors, not UI percentages. If placeholder chapter order changes,
    // check these IDs and tests. v2 keeps the old v1 session data untouched.
    for (const sample of [
      { storyId: 'fixture-lights', fractions: [0.65] },
      { storyId: 'fixture-mist', fractions: [1, 1, 0.45] },
    ]) {
      for (const [index, fraction] of sample.fractions.entries()) {
        const chapter = await this.source.chapter(
          `${sample.storyId}/${index + 1}`,
        );
        await this.record(
          {
            chapterId: chapter.id,
            revision: chapter.revision,
            last: anchorAt(chapter, fraction),
            atEnd: fraction === 1,
          },
          false,
        );
      }
    }
    // One atomic sessionStorage write: a failed first setup must not leave
    // partial presets that a later retry mistakes for completed setup.
    this.persist(this.state);
  }

  private async record(input: RecordInput, save = true): Promise<ReadingState> {
    const chapter = await this.source.chapter(input.chapterId);
    if (input.revision !== chapter.revision)
      throw new ReaderError(
        'conflict',
        '原创样例已更新，请重新打开篇目后继续。',
      );
    if (
      input.historyToken !== undefined &&
      input.historyToken !== this.token(chapter.storyId)
    )
      throw new ReaderError(
        'conflict',
        '样例记录已清除，请重新打开篇目后继续。',
      );
    const index = chapter.blocks.findIndex(
      (block) => block.id === input.last.blockId,
    );
    const block = chapter.blocks[index];
    if (!block)
      throw new ReaderError('conflict', '原段落不在此样例中，请重新打开篇目。');
    const words =
      chapter.blocks
        .slice(0, index)
        .reduce((sum, item) => sum + blockWords(item), 0) +
      Math.floor(blockWords(block) * input.last.fraction);
    const previous = this.state.records[chapter.id];
    const atEnd =
      input.atEnd &&
      index === chapter.blocks.length - 1 &&
      input.last.fraction === 1;
    const next: ReadingState = {
      ...this.state,
      recentChapterId: chapter.id,
      records: {
        ...this.state.records,
        [chapter.id]: {
          chapterId: chapter.id,
          storyId: chapter.storyId,
          revision: chapter.revision,
          last: input.last,
          furthestWords: Math.max(previous?.furthestWords ?? 0, words),
          furthest:
            words >= (previous?.furthestWords ?? 0)
              ? input.last
              : previous?.furthest,
          complete: previous?.complete === true || atEnd,
          totalWords: chapterWords(chapter),
          updatedAt: new Date().toISOString(),
        },
      },
    };
    if (save) return this.persist(next);
    this.state = next;
    return structuredClone(next);
  }

  private readonly handlers: ToolHandlers = {
    reader_search: async (input) =>
      searchStories(await this.source.catalog(), input),
    reader_story_info: async () => ({
      summary: '剧情简介占位符。此处为演示文字，不对应原作剧情。',
    }),
    reader_open: async () => ({ ready: true, source: this.source.label }),
    reader_snapshot: async ({ includeScore }) => ({
      stories: await this.source.catalog(),
      state: structuredClone(this.state),
      sourceLabel: '占位演示 · 非原作剧情 · 图片仅作示意 · 记录仅存于本标签页',
      ...(includeScore ? { score: { status: 'unavailable' as const } } : {}),
    }),
    reader_chapter: async ({ chapterId }) => {
      const chapter = await this.source.chapter(chapterId);
      return { ...chapter, historyToken: this.token(chapter.storyId) };
    },
    reader_prepare_chapter: async ({ chapterId }) => {
      const chapter = await this.source.chapter(chapterId);
      return {
        chapterId,
        storyId: chapter.storyId,
        revision: chapter.revision,
        wordCount: chapterWords(chapter),
        contentKind: 'text',
        verifiedAt: Date.now(),
      };
    },
    reader_chapter_info: async ({ chapterId }) => {
      const chapter = await this.source.chapter(chapterId);
      return {
        summary: `${chapter.blocks[0]?.kind === 'narration' ? chapter.blocks[0].text : '原创阅读样例'}`,
      };
    },
    reader_image: async (input) => this.source.image(input),
    reader_record: async (input) => this.record(input),
    reader_settings: async (settings) =>
      this.persist({ ...this.state, settings }),
    // Fixture content is bundled, not a mutable network cache. Clearing it must
    // not delete records or preferences; the real UI still clears cover refs.
    reader_clear_cache: async ({ scope }) => ({ cleared: scope }),
    reader_clear_history: async ({ storyId }) => {
      const records = Object.fromEntries(
        Object.entries(this.state.records).filter(
          ([, record]) => storyId !== undefined && record.storyId !== storyId,
        ),
      );
      const recentChapterId =
        this.state.recentChapterId && records[this.state.recentChapterId]
          ? this.state.recentChapterId
          : (Object.values(records).sort((a, b) =>
              b.updatedAt.localeCompare(a.updatedAt),
            )[0]?.chapterId ?? null);
      return this.persist({
        ...this.state,
        records,
        recentChapterId,
        ...(storyId === undefined
          ? {
              historyEpoch: (this.state.historyEpoch ?? 0) + 1,
              storyHistoryEpochs: {},
            }
          : {
              storyHistoryEpochs: {
                ...this.state.storyHistoryEpochs,
                [storyId]: (this.state.storyHistoryEpochs?.[storyId] ?? 0) + 1,
              },
            }),
      });
    },
  };

  async call<Name extends ToolName>(
    name: Name,
    input: ToolInput<Name>,
  ): Promise<ToolOutput<Name>> {
    const result = await this.handlers[name](parseToolInput(name, input));
    return decodeToolResult(name, input, result);
  }
}
