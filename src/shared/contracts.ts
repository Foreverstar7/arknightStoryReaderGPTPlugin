import { z } from 'zod';

export const sceneSchema = z.object({
  slots: z.array(z.object({ slot: z.string(), resource: z.string() })),
  focus: z.number().int().optional(),
});
export const leafSchema = z.discriminatedUnion('kind', [
  z.object({ id: z.string(), kind: z.literal('narration'), text: z.string() }),
  z.object({
    id: z.string(),
    kind: z.literal('cg'),
    label: z.string(),
    resource: z.string().optional(),
  }),
  z.object({
    id: z.string(),
    kind: z.literal('speech'),
    name: z.string(),
    paragraphs: z.array(z.string()).min(1),
    portrait: z.string().optional(),
    scene: sceneSchema.optional(),
  }),
]);
export const blockSchema = z.union([
  leafSchema,
  z.object({
    id: z.string(),
    kind: z.literal('choices'),
    options: z.array(
      z.object({ label: z.string(), blocks: z.array(leafSchema) }),
    ),
    shared: z
      .array(
        z.object({ labels: z.array(z.string()), blocks: z.array(leafSchema) }),
      )
      .optional(),
  }),
]);
export const chapterMetaSchema = z.object({
  id: z.string(),
  code: z.string(),
  title: z.string(),
  summary: z.string().optional(),
  wordCount: z.number().int().nonnegative().nullable(),
  sourceUrl: z.string().url().optional(),
});
export const storySchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.string(),
  type: z.string(),
  coverLabel: z.string(),
  source: z.enum(['fixture', 'prts']),
  sourceUrl: z.string().url().optional(),
  chapters: z.array(chapterMetaSchema),
});
export const chapterSchema = z.object({
  id: z.string(),
  storyId: z.string(),
  title: z.string(),
  revision: z.string(),
  source: z.enum(['fixture', 'prts']),
  sourceUrl: z.string().url().optional(),
  blocks: z.array(blockSchema),
  // Original public source is cached locally, never bundled into the plugin.
  original: z
    .object({ pageTitle: z.string(), textPath: z.string(), wiki: z.string() })
    .optional(),
});
export const anchorSchema = z.object({
  blockId: z.string().max(200),
  fraction: z.number().min(0).max(1),
});
export const recordSchema = z.object({
  chapterId: z.string(),
  storyId: z.string(),
  revision: z.string(),
  last: anchorSchema,
  furthestWords: z.number().int().nonnegative(),
  complete: z.boolean(),
  totalWords: z.number().int().nonnegative().optional(),
  updatedAt: z.string().datetime(),
});
export const settingsSchema = z.object({
  autoImages: z.boolean(),
  retentionDays: z.number().int().min(1).max(365),
  theme: z.enum(['system', 'light', 'dark']),
});
export const readingStateSchema = z.object({
  version: z.literal(1),
  records: z.record(z.string(), recordSchema),
  recentChapterId: z.string().nullable(),
  settings: settingsSchema,
});
export const snapshotSchema = z.object({
  stories: z.array(storySchema),
  state: readingStateSchema,
  sourceLabel: z.string(),
});
export const recordInputSchema = z.object({
  chapterId: z.string().min(1).max(200),
  revision: z.string().min(1).max(200),
  last: anchorSchema,
  atEnd: z.boolean(),
});
export const chapterInputSchema = z.object({
  chapterId: z.string().min(1).max(200),
  refresh: z.boolean().default(false),
});
export const cacheInputSchema = z.object({ scope: z.enum(['images', 'all']) });
export type Block = z.infer<typeof blockSchema>;
export type Leaf = z.infer<typeof leafSchema>;
export type Scene = z.infer<typeof sceneSchema>;
export type Chapter = z.infer<typeof chapterSchema>;
export type Story = z.infer<typeof storySchema>;
export type ReadingRecord = z.infer<typeof recordSchema>;
export type ReadingState = z.infer<typeof readingStateSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;
export type RecordInput = z.infer<typeof recordInputSchema>;

export const toolNames = [
  'reader_open',
  'reader_snapshot',
  'reader_chapter',
  'reader_record',
  'reader_settings',
  'reader_clear_cache',
  'reader_clear_history',
] as const;
export const toolNameSchema = z.enum(toolNames);
export type ToolName = z.infer<typeof toolNameSchema>;
export const toolRequestSchema = z.object({
  name: toolNameSchema,
  arguments: z.unknown(),
});

export function initialState(): ReadingState {
  return {
    version: 1,
    records: {},
    recentChapterId: null,
    settings: { autoImages: false, retentionDays: 7, theme: 'system' },
  };
}
