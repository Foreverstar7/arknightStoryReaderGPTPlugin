import type { ChapterCount, Story } from '../shared/contracts.js';

/** A slow snapshot or prefetch response must not erase newer per-chapter counts. */
export function mergeStoryCounts(
  incoming: Story[],
  previous: Story[],
): Story[] {
  const known = new Map(
    previous.flatMap((story) =>
      story.chapters.map((chapter) => [chapter.id, chapter] as const),
    ),
  );
  return incoming.map((story) => ({
    ...story,
    chapters: story.chapters.map((chapter) => {
      const old = known.get(chapter.id);
      return old &&
        (old.wordCountVerifiedAt ?? 0) > (chapter.wordCountVerifiedAt ?? 0)
        ? {
            ...chapter,
            wordCount: old.wordCount,
            wordCountRevision: old.wordCountRevision,
            wordCountVerifiedAt: old.wordCountVerifiedAt,
          }
        : chapter;
    }),
  }));
}

export function applyChapterCount(
  stories: Story[],
  count: ChapterCount,
): Story[] {
  return mergeStoryCounts(
    stories.map((story) =>
      story.id === count.storyId
        ? {
            ...story,
            chapters: story.chapters.map((chapter) =>
              chapter.id === count.chapterId
                ? {
                    ...chapter,
                    wordCount: count.wordCount,
                    wordCountRevision: count.revision,
                    wordCountVerifiedAt: count.verifiedAt,
                  }
                : chapter,
            ),
          }
        : story,
    ),
    stories,
  );
}
