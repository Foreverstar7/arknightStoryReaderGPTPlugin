import type { Story } from '../shared/contracts.js';
import { textCoverTitle } from '../shared/cover-policy.js';
import type {
  Appearance,
  SearchCard,
  SearchInput,
  SearchResult,
} from '../shared/search.js';

export const normalizeSearch = (text: string) =>
  text.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLowerCase();

/** Only public catalog metadata and explicit cast records; never read bodies or history. */
export function searchStories(
  stories: Story[],
  input: SearchInput,
  appearances: Appearance[] = [],
): SearchResult {
  const queries = [...new Set(input.queries.map((query) => query.trim()))];
  const cast = new Map<string, Appearance[]>();
  for (const entry of appearances) {
    const key = normalizeSearch(entry.chapterId);
    const rows = cast.get(key) ?? [];
    rows.push(entry);
    cast.set(key, rows);
  }
  const found = new Set<string>();
  const sourceUrls = new Set<string>();
  if (input.by === 'character')
    for (const row of appearances) sourceUrls.add(row.sourceUrl);
  const ranked: { card: SearchCard; score: number }[] = [];
  for (const story of stories) {
    const matchedQueries: string[] = [];
    const matchedIds = new Set<string>();
    let score = 0;
    for (const query of queries) {
      const key = normalizeSearch(query);
      if (!key) continue;
      let matched = false;
      if (input.by === 'story') {
        const titles = [
          normalizeSearch(story.title),
          normalizeSearch(textCoverTitle(story) ?? story.title),
        ];
        matched = titles.some((title) => title.includes(key));
        if (matched) score = Math.max(score, titles.includes(key) ? 2 : 1);
      } else {
        for (const chapter of story.chapters) {
          const rows = cast.get(normalizeSearch(chapter.id)) ?? [];
          const hit =
            input.by === 'chapter'
              ? normalizeSearch(chapter.code) === key ||
                normalizeSearch(chapter.title).includes(key)
              : rows.some((row) =>
                  row.names.some((name) => normalizeSearch(name) === key),
                );
          if (!hit) continue;
          matchedIds.add(chapter.id);
          matched = true;
          for (const row of rows)
            if (row.names.some((name) => normalizeSearch(name) === key))
              sourceUrls.add(row.sourceUrl);
        }
      }
      if (matched) {
        matchedQueries.push(query);
        found.add(query);
      }
    }
    if (!matchedQueries.length) continue;
    if (story.sourceUrl) sourceUrls.add(story.sourceUrl);
    ranked.push({
      score,
      card: {
        id: story.id,
        title: textCoverTitle(story) ?? story.title,
        type: story.type,
        category: story.category,
        source: story.source,
        sourceUrl: story.sourceUrl,
        imagesAvailable: story.imagesAvailable,
        chapterCount: story.chapters.length,
        matchedQueries,
        matchedChapters: story.chapters
          .filter((chapter) => matchedIds.has(chapter.id))
          .map(({ id, code, title }) => ({ id, code, title })),
      },
    });
  }
  ranked.sort((a, b) => b.score - a.score);
  return {
    by: input.by,
    queries,
    results: ranked
      .slice(input.offset, input.offset + input.limit)
      .map((item) => item.card),
    total: ranked.length,
    offset: input.offset,
    hasMore: input.offset + input.limit < ranked.length,
    unmatchedQueries: queries.filter((query) => !found.has(query)),
    sourceUrls: [...sourceUrls],
  };
}
