import type {
  Block,
  Chapter,
  ReadingRecord,
  Story,
} from '../shared/contracts.js';

/** Counts Unicode code points excluding whitespace; names and stage commands are not body text. */
export function countText(text: string): number {
  return Array.from(text.replace(/\s/gu, '')).length;
}

export function blockWords(block: Block): number {
  switch (block.kind) {
    case 'narration':
      return countText(block.text);
    case 'speech':
      return block.paragraphs.reduce((n, text) => n + countText(text), 0);
    case 'cg':
      return 0;
    case 'choices':
      return block.options.reduce(
        (n, option) =>
          n +
          countText(option.label) +
          option.blocks.reduce((sum, leaf) => sum + blockWords(leaf), 0),
        0,
      );
  }
}

export function chapterWords(chapter: Chapter): number {
  return chapter.blocks.reduce((n, block) => n + blockWords(block), 0);
}

/** Only an observed body end can display 100%; rounding must never promote 99.x to 100. */
export function percent(
  words: number,
  total: number,
  complete: boolean,
): number {
  if (complete) return 100;
  if (total <= 0) return 0;
  return Math.min(99, Math.floor((Math.max(0, words) / total) * 100));
}

export function storyProgress(
  story: Story,
  records: Record<string, ReadingRecord>,
): number | null {
  if (story.chapters.some((chapter) => chapter.wordCount === null)) return null;
  let total = 0;
  let read = 0;
  let complete = story.chapters.length > 0;
  for (const chapter of story.chapters) {
    const record = records[chapter.id];
    total += chapter.wordCount ?? 0;
    read += Math.min(record?.furthestWords ?? 0, chapter.wordCount ?? 0);
    complete = complete && record?.complete === true;
  }
  return percent(read, total, complete);
}

export function chapterProgress(
  story: Story,
  chapterId: string,
  records: Record<string, ReadingRecord>,
): number | null {
  const meta = story.chapters.find((chapter) => chapter.id === chapterId);
  if (!meta || meta.wordCount === null) return null;
  const record = records[chapterId];
  return percent(
    record?.furthestWords ?? 0,
    meta.wordCount,
    record?.complete ?? false,
  );
}

export function progressLabel(progress: number | null): string {
  return progress === null ? '总字数待核实' : `${progress}%`;
}
