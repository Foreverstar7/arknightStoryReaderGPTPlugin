import { z } from 'zod';

export const readerErrorCodeSchema = z.enum([
  'not_found',
  'network',
  'parse',
  'resource_missing',
  'unsupported',
  'storage',
  'conflict',
  'invalid_input',
  'unknown',
]);
export const readerFailureSchema = z.object({
  code: readerErrorCodeSchema,
  message: z.string(),
  sourceUrl: z.string().url().optional(),
});
export type ReaderFailure = z.infer<typeof readerFailureSchema>;

/** Shared by the source, HTTP preview and app transport; never infer codes from prose. */
export class ReaderError extends Error {
  constructor(
    public readonly code: ReaderFailure['code'],
    message: string,
    public readonly sourceUrl?: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
  toFailure(): ReaderFailure {
    return {
      code: this.code,
      message: this.message,
      sourceUrl: this.sourceUrl,
    };
  }
}
