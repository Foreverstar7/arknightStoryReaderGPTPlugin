import { z } from 'zod';
import { MAX_IMAGE_LAYERS } from './image-limits.js';

export const cgLayerSchema = z.object({
  resource: z.string(),
  kind: z.enum(['image', 'background']),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  scale: z.number().positive().optional(),
  rotation: z.number().finite().optional(),
  opacity: z.number().min(0).max(1).optional(),
  centered: z.boolean().optional(),
});
export const cgCompositionSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
  layers: z.array(cgLayerSchema).min(1).max(MAX_IMAGE_LAYERS),
  description: z.string(),
  fit: z.literal('layers').optional(),
});
export type CgLayer = z.infer<typeof cgLayerSchema>;
export type CgComposition = z.infer<typeof cgCompositionSchema>;

export const sceneSchema = z.object({
  slots: z.array(z.object({ slot: z.string(), resource: z.string() })),
  focus: z.number().int().optional(),
});
export const leafSchema = z.discriminatedUnion('kind', [
  z.object({
    id: z.string(),
    kind: z.literal('video'),
    sourceUrl: z.string().url(),
  }),
  z.object({ id: z.string(), kind: z.literal('narration'), text: z.string() }),
  z.object({
    id: z.string(),
    kind: z.literal('cg'),
    label: z.string(),
    resource: z.string().optional(),
    composition: cgCompositionSchema.optional(),
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
    when: z.array(z.string()).optional(),
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
  summarySourceUrl: z.string().url().optional(),
  wordCount: z.number().int().nonnegative().nullable(),
  wordCountRevision: z.string().optional(),
  wordCountVerifiedAt: z.number().int().nonnegative().optional(),
  contentKind: z.enum(['text', 'video', 'mixed']).optional(),
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
  diagnostics: z
    .array(z.object({ line: z.number().int().positive(), message: z.string() }))
    .optional(),
  // Per-open save guard, returned by the service; not part of public source content.
  historyToken: z.string().optional(),
  // Original public source is cached locally, never bundled into the plugin.
  original: z
    .object({ pageTitle: z.string(), textPath: z.string(), wiki: z.string() })
    .optional(),
});
export const anchorSchema = z.object({
  blockId: z.string().max(200),
  fraction: z.number().min(0).max(1),
});
export const readingLayoutSchema = z.object({
  id: z.string(),
  storyId: z.string(),
  revision: z.string(),
  totalWords: z.number().int().nonnegative(),
  blocks: z
    .array(
      z.object({
        id: z.string(),
        signature: z.string(),
        words: z.number().int().nonnegative(),
      }),
    )
    .min(1),
});
export const recordSchema = z.object({
  chapterId: z.string(),
  storyId: z.string(),
  revision: z.string(),
  last: anchorSchema,
  furthestWords: z.number().int().nonnegative(),
  complete: z.boolean(),
  totalWords: z.number().int().nonnegative().optional(),
  furthest: anchorSchema.optional(),
  layout: readingLayoutSchema.optional(),
  progressKnown: z.boolean().optional(),
  migration: z
    .object({
      position: z.enum(['matched', 'preceding', 'start']),
      previous: z.object({
        revision: z.string(),
        last: anchorSchema,
        furthestWords: z.number().int().nonnegative(),
        complete: z.boolean(),
        totalWords: z.number().int().nonnegative().optional(),
        updatedAt: z.string().datetime(),
      }),
    })
    .optional(),
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
  chapterRevisions: z.record(z.string(), z.string()).optional(),
  historyEpoch: z.number().int().nonnegative().optional(),
  storyHistoryEpochs: z
    .record(z.string(), z.number().int().nonnegative())
    .optional(),
});
export const snapshotInputSchema = z
  .object({ refreshCatalog: z.boolean().optional() })
  .strict();
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
  historyToken: z.string().max(100).optional(),
});
export const chapterInputSchema = z.object({
  chapterId: z.string().min(1).max(200),
  refresh: z.boolean().default(false),
});
export const chapterCountSchema = z.object({
  chapterId: z.string(),
  storyId: z.string(),
  revision: z.string(),
  wordCount: z.number().int().nonnegative(),
  contentKind: z.enum(['text', 'video', 'mixed']).optional(),
  verifiedAt: z.number().int().nonnegative(),
});
export type ChapterCount = z.infer<typeof chapterCountSchema>;
export const cacheInputSchema = z.object({ scope: z.enum(['images', 'all']) });
// Empty input retains the existing global action. Reject misspelled scope keys
// instead of stripping them and accidentally turning a story clear into a global clear.
export const clearHistoryInputSchema = z.strictObject({
  storyId: z.string().min(1).max(200).optional(),
});
export const chapterInfoSchema = z.object({
  summary: z.string().optional(),
  sourceUrl: z.string().url().optional(),
});
export const imageInputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('cover'),
    storyId: z.string().min(1).max(200),
    refresh: z.boolean().optional(),
  }),
  z.object({
    kind: z.enum(['portrait', 'cg']),
    chapterId: z.string().min(1).max(200),
    blockId: z.string().min(1).max(200),
    refresh: z.boolean().optional(),
  }),
]);
export const rasterDataUrlSchema = z
  .string()
  .regex(/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/u);
export const coverMethodSchema = z.enum([
  'activity-title-field',
  'april-year-index',
  'main-chapter-index',
  'contingency-logo',
]);
export const imageLayerSchema = z.object({
  dataUrl: rasterDataUrlSchema,
  sourceUrl: z.string().url(),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().positive(),
  height: z.number().positive(),
  rotation: z.number().finite().optional(),
  opacity: z.number().min(0).max(1).optional(),
});
export const portraitResolutionSchema = z.object({
  status: z.enum(['original', 'default', 'placeholder']),
  requested: z.string(),
  selected: z.string().optional(),
  reason: z.string(),
  message: z.string(),
  evidence: z.array(z.string().url()),
});
export const imageResultSchema = z
  .object({
    width: z.number().positive(),
    height: z.number().positive(),
    layers: z.array(imageLayerSchema).max(MAX_IMAGE_LAYERS),
    resource: z.string(),
    sourceUrl: z.string().url(),
    portrait: portraitResolutionSchema.optional(),
    description: z.string().optional(),
    // A file's URL and the metadata that selected it are distinct, traceable sources.
    attribution: z
      .object({
        sourceUrl: z.string().url(),
        method: coverMethodSchema,
      })
      .optional(),
  })
  .refine(
    (image) =>
      image.portrait?.status === 'placeholder'
        ? image.layers.length === 0
        : image.layers.length > 0,
    'Only an explicit neutral portrait placeholder may have no image layers.',
  );
export type ImageInput = z.infer<typeof imageInputSchema>;
export type ReaderImage = z.infer<typeof imageResultSchema>;
export type Block = z.infer<typeof blockSchema>;
export type Leaf = z.infer<typeof leafSchema>;
export type Scene = z.infer<typeof sceneSchema>;
export type Chapter = z.infer<typeof chapterSchema>;
export type Story = z.infer<typeof storySchema>;
export type ReadingRecord = z.infer<typeof recordSchema>;
export type ReadingLayout = z.infer<typeof readingLayoutSchema>;
export type ReadingState = z.infer<typeof readingStateSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;
export type RecordInput = z.infer<typeof recordInputSchema>;

export const toolNames = [
  'reader_open',
  'reader_snapshot',
  'reader_chapter',
  'reader_prepare_chapter',
  'reader_chapter_info',
  'reader_image',
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
