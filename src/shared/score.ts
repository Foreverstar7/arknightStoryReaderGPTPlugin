import { z } from 'zod';

export const scoreNodeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('story'), storyId: z.string() }),
  z.object({
    kind: z.literal('junction'),
    key: z.string(),
    targetStoryId: z.string(),
    targetMovementId: z.string(),
    direction: z.enum(['incoming', 'outgoing']),
  }),
]);
export const scoreCatalogSchema = z.object({
  sourceUrl: z.string().url(),
  movements: z.array(
    z.object({
      id: z.string(),
      code: z.string(),
      title: z.string(),
      collection: z.boolean(),
      nodes: z.array(scoreNodeSchema),
    }),
  ),
  unmatchedNames: z.array(z.string()),
});
export const scoreResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ready'), data: scoreCatalogSchema }),
  z.object({ status: z.literal('failed'), message: z.string() }),
  z.object({ status: z.literal('unavailable') }),
]);
export type ScoreCatalog = z.infer<typeof scoreCatalogSchema>;
export type ScoreMovement = ScoreCatalog['movements'][number];
export type ScoreNode = z.infer<typeof scoreNodeSchema>;
export type ScoreResult = z.infer<typeof scoreResultSchema>;
