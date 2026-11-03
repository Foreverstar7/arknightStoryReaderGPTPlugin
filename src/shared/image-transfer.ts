import { z } from 'zod';
import { imageResultSchema } from './contracts.js';
import { ReaderError, readerFailureSchema } from './errors.js';

// MCP stdio's SDK default is 10 MiB. A 20 MB original becomes ~26.7 MB base64.
// Keep each tool message small without changing the original bytes or adding tools.
// One million JSON characters is at most 4 MB UTF-8, below that default buffer.
export const IMAGE_PART_CHARACTERS = 1_000_000;
export const MAX_IMAGE_PARTS = 64; // two existing image layers, each <= 20 MB
export const imagePartRequestSchema = z.object({
  partIndex: z
    .number()
    .int()
    .min(0)
    .max(MAX_IMAGE_PARTS - 1)
    .optional(),
  transferId: z
    .string()
    .regex(/^[a-f0-9]{64}$/u)
    .optional(),
});
export const imagePartSchema = z.object({
  transferId: z.string().regex(/^[a-f0-9]{64}$/u),
  index: z
    .number()
    .int()
    .min(0)
    .max(MAX_IMAGE_PARTS - 1),
  count: z.number().int().min(1).max(MAX_IMAGE_PARTS),
  data: z.string().min(1).max(IMAGE_PART_CHARACTERS),
});
type ImageToolResult = {
  isError?: boolean;
  _meta?: Record<string, unknown>;
};

/** Reassemble only this image's ordered, version-matched parts from app-only calls. */
export async function collectImageResult(
  first: ImageToolResult,
  next: (part: {
    partIndex: number;
    transferId: string;
  }) => Promise<ImageToolResult>,
) {
  if (!first._meta?.readerImagePart) return first._meta?.readerImage;
  const initial = imagePartSchema.safeParse(first._meta.readerImagePart);
  if (!initial.success || initial.data.index !== 0)
    throw new ReaderError('parse', '图片传输首段不兼容，请重试。');
  const { count, transferId } = initial.data;
  const pieces = [initial.data.data];
  for (let index = 1; index < count; index++) {
    const response = await next({ partIndex: index, transferId });
    if (response.isError) {
      const failure = readerFailureSchema.safeParse(
        response._meta?.readerError,
      );
      throw new ReaderError(
        failure.success ? failure.data.code : 'unknown',
        failure.success ? failure.data.message : '图片分段传输失败，请重试。',
        failure.success ? failure.data.sourceUrl : undefined,
      );
    }
    const part = imagePartSchema.safeParse(response._meta?.readerImagePart);
    if (
      !part.success ||
      part.data.index !== index ||
      part.data.count !== count ||
      part.data.transferId !== transferId
    )
      throw new ReaderError('parse', '图片分段不完整或来源已变化，请重试。');
    pieces.push(part.data.data);
  }
  try {
    return imageResultSchema.parse(JSON.parse(pieces.join('')));
  } catch {
    throw new ReaderError('parse', '图片分段合并后格式不兼容，请重试。');
  }
}
