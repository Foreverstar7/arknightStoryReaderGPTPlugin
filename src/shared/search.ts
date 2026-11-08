import { z } from 'zod';

export const searchInputSchema = z.strictObject({
  by: z.enum(['story', 'chapter', 'character']).default('story'),
  queries: z.array(z.string().trim().min(1).max(120)).min(1).max(10),
  offset: z.number().int().min(0).max(10000).default(0),
  limit: z.number().int().min(1).max(20).default(6),
  refresh: z.boolean().default(false),
});
export const appearanceSchema = z.object({
  chapterId: z.string(),
  names: z.array(z.string()),
  sourceUrl: z.string().url(),
});
export type Appearance = z.infer<typeof appearanceSchema>;
export const searchCardSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.string(),
  category: z.string(),
  source: z.enum(['fixture', 'prts']),
  sourceUrl: z.string().url().optional(),
  imagesAvailable: z.boolean().optional(),
  chapterCount: z.number().int().nonnegative(),
  matchedQueries: z.array(z.string()),
  matchedChapters: z.array(
    z.object({ id: z.string(), code: z.string(), title: z.string() }),
  ),
});
export const searchResultSchema = z.object({
  by: z.enum(['story', 'chapter', 'character']),
  queries: z.array(z.string()),
  results: z.array(searchCardSchema),
  total: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  hasMore: z.boolean(),
  unmatchedQueries: z.array(z.string()),
  sourceUrls: z.array(z.string().url()),
});
export type SearchInput = z.infer<typeof searchInputSchema>;
export type SearchResult = z.infer<typeof searchResultSchema>;
export type SearchCard = z.infer<typeof searchCardSchema>;
export const modelSearchResultSchema = searchResultSchema.extend({
  results: z.array(
    searchCardSchema
      .pick({ id: true, title: true, type: true, matchedQueries: true })
      .extend({ matchedChapterCount: z.number().int().nonnegative() }),
  ),
});
export function searchForModel(result: SearchResult) {
  return {
    ...result,
    results: result.results.map(
      ({ id, title, type, matchedQueries, matchedChapters }) => ({
        id,
        title,
        type,
        matchedQueries,
        matchedChapterCount: matchedChapters.length,
      }),
    ),
  };
}
