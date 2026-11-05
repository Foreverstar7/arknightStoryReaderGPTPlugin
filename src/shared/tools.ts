import { z } from 'zod';
import {
  cacheInputSchema,
  chapterCountSchema,
  chapterInfoSchema,
  chapterInputSchema,
  chapterSchema,
  clearHistoryInputSchema,
  imageInputSchema,
  imageResultSchema,
  readingStateSchema,
  recordInputSchema,
  settingsSchema,
  snapshotInputSchema,
  snapshotSchema,
  type ToolName,
} from './contracts.js';
import { ReaderError } from './errors.js';

function contract<Input extends z.ZodType, Output extends z.ZodType>(
  input: Input,
  output: Output,
  check?: (args: z.input<Input>, result: z.output<Output>) => void,
) {
  return {
    input,
    output,
    decode(value: unknown, args: z.input<Input>): z.output<Output> {
      const result = output.safeParse(value);
      if (!result.success)
        throw new ReaderError(
          'parse',
          '阅读器返回的结果格式不兼容，请重试。',
          undefined,
          {
            cause: result.error,
          },
        );
      check?.(args, result.data);
      return result.data;
    },
  };
}

/** Logical tool contracts shared by HTTP, MCP and the page. Image transport
 * framing is separate: only MCP moves binary layers into app-only metadata. */
const definitions = {
  reader_open: contract(
    z.object({}),
    z.object({ ready: z.boolean(), source: z.string() }),
  ),
  reader_snapshot: contract(snapshotInputSchema, snapshotSchema),
  reader_chapter: contract(
    chapterInputSchema,
    chapterSchema,
    (args, chapter) => {
      if (chapter.id !== args.chapterId)
        throw new ReaderError(
          'parse',
          '正文返回了不同的篇目标识，请重试。',
          chapter.sourceUrl,
        );
    },
  ),
  reader_prepare_chapter: contract(
    chapterInputSchema.pick({ chapterId: true }),
    chapterCountSchema,
    (args, count) => {
      if (count.chapterId !== args.chapterId)
        throw new ReaderError('parse', '正文统计返回了不同的篇目。');
    },
  ),
  reader_chapter_info: contract(
    chapterInputSchema.pick({ chapterId: true }),
    chapterInfoSchema,
  ),
  reader_image: contract(imageInputSchema, imageResultSchema),
  reader_record: contract(recordInputSchema, readingStateSchema),
  reader_settings: contract(settingsSchema, readingStateSchema),
  reader_clear_cache: contract(
    cacheInputSchema,
    z.object({ cleared: cacheInputSchema.shape.scope }),
  ),
  reader_clear_history: contract(clearHistoryInputSchema, readingStateSchema),
} satisfies Record<ToolName, { input: z.ZodType; output: z.ZodType }>;

export type ToolInput<Name extends ToolName> = z.input<
  (typeof definitions)[Name]['input']
>;
export type ToolArgs<Name extends ToolName> = z.output<
  (typeof definitions)[Name]['input']
>;
export type ToolOutput<Name extends ToolName> = z.output<
  (typeof definitions)[Name]['output']
>;
export type ToolHandlers = {
  [Name in ToolName]: (args: ToolArgs<Name>) => Promise<ToolOutput<Name>>;
};

// This mapped view preserves the name/input/result relationship when indexing
// with a generic name, without asserting a union result into the caller's type.
export const toolContracts: {
  [Name in ToolName]: {
    input: z.ZodType<ToolArgs<Name>, ToolInput<Name>>;
    output: z.ZodType<ToolOutput<Name>>;
    decode: (value: unknown, args: ToolInput<Name>) => ToolOutput<Name>;
  };
} = definitions;

export function parseToolInput<Name extends ToolName>(
  name: Name,
  value: unknown,
): ToolArgs<Name> {
  return toolContracts[name].input.parse(value);
}

export function decodeToolResult<Name extends ToolName>(
  name: Name,
  args: ToolInput<Name>,
  value: unknown,
): ToolOutput<Name> {
  return toolContracts[name].decode(value, args);
}
