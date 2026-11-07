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
    case 'video':
      return 0;
    case 'choices':
      return (
        block.options.reduce(
          (n, option) =>
            n +
            countText(option.label) +
            option.blocks.reduce((sum, leaf) => sum + blockWords(leaf), 0),
          0,
        ) +
        (block.shared ?? []).reduce(
          (n, group) =>
            n + group.blocks.reduce((sum, leaf) => sum + blockWords(leaf), 0),
          0,
        )
      );
  }
}

export function chapterWords(chapter: Chapter): number {
  return chapter.blocks.reduce((n, block) => n + blockWords(block), 0);
}

/** Zero script words is only conclusive for an explicitly parsed video source.
 * Video viewing is not tracked; progress describes text reading, not watching. */
export function chapterContentKind(
  chapter: Chapter,
): 'text' | 'video' | 'mixed' {
  const video = chapter.blocks.some(
    (block) =>
      block.kind === 'video' ||
      (block.kind === 'choices' &&
        [
          ...block.options.flatMap((option) => option.blocks),
          ...(block.shared ?? []).flatMap((group) => group.blocks),
        ].some((leaf) => leaf.kind === 'video')),
  );
  return video ? (chapterWords(chapter) > 0 ? 'mixed' : 'video') : 'text';
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

/** Saved revisions are reconciled only by actually reopening/reading a chapter. */
export function pendingReadingChapters(
  story: Story,
  records: Record<string, ReadingRecord>,
) {
  return story.chapters.filter((chapter) => {
    const record = records[chapter.id];
    return (
      record !== undefined &&
      (record.progressKnown === false ||
        (chapter.wordCountRevision !== undefined &&
          record.revision !== chapter.wordCountRevision))
    );
  });
}

export function storyProgressHint(
  story: Story,
  records: Record<string, ReadingRecord>,
) {
  const pending = pendingReadingChapters(story, records);
  if (pending.length)
    return `${pending.length} 篇旧阅读记录待核实，进入剧情可查看并恢复对应篇目`;
  if (story.chapters.every((chapter) => chapter.contentKind === 'video'))
    return '本剧情为视频，不统计文字阅读进度';
  return '总字数待统计，打开剧情后自动加载正文；失败篇目可重试';
}

export function storyProgress(
  story: Story,
  records: Record<string, ReadingRecord>,
): number | null {
  if (
    story.chapters.length &&
    story.chapters.every((chapter) => chapter.contentKind === 'video')
  )
    return null;
  if (
    story.chapters.some(
      (chapter) =>
        records[chapter.id]?.progressKnown === false ||
        (records[chapter.id] !== undefined &&
          chapter.wordCountRevision !== undefined &&
          records[chapter.id]?.revision !== chapter.wordCountRevision) ||
        (chapter.wordCount === null &&
          records[chapter.id]?.totalWords === undefined),
    )
  )
    return null;
  let total = 0;
  let read = 0;
  let complete = story.chapters.length > 0;
  for (const chapter of story.chapters) {
    if (chapter.contentKind === 'video') continue;
    const record = records[chapter.id];
    const words = chapter.wordCountRevision
      ? (chapter.wordCount ?? 0)
      : (record?.totalWords ?? chapter.wordCount ?? 0);
    total += words;
    read += Math.min(record?.furthestWords ?? 0, words);
    complete = complete && record?.complete === true;
  }
  return percent(read, total, complete);
}

export function chapterProgress(
  story: Story,
  chapterId: string,
  records: Record<string, ReadingRecord>,
  openedWordCount?: number,
): number | null {
  const meta = story.chapters.find((chapter) => chapter.id === chapterId);
  if (meta?.contentKind === 'video') return null;
  const record = records[chapterId];
  if (record?.progressKnown === false) return null;
  if (
    record &&
    meta?.wordCountRevision &&
    record.revision !== meta.wordCountRevision
  )
    return null;
  const words = openedWordCount ?? record?.totalWords ?? meta?.wordCount;
  if (words === undefined || words === null) return null;
  return percent(record?.furthestWords ?? 0, words, record?.complete ?? false);
}

export function progressLabel(
  progress: number | null,
  revisionUnknown = false,
): string {
  return progress === null
    ? revisionUnknown
      ? '修订进度待核实'
      : '总字数待核实'
    : `${progress}%`;
}
