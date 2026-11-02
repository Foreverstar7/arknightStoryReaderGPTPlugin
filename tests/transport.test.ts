import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ReaderError, type ReaderFailure } from '../src/shared/errors.js';
import { hostTransport, previewTransport } from '../src/ui/transport.js';

test('preview preserves structured failure codes and sources even when messages are identical; absent codes are never guessed', async () => {
  const original = globalThis.fetch;
  try {
    for (const code of [
      'resource_missing',
      'not_found',
      'network',
      'parse',
      'unsupported',
    ] satisfies ReaderFailure['code'][]) {
      globalThis.fetch = async () =>
        Response.json(
          {
            error: '同一条提示',
            code,
            sourceUrl: 'https://prts.wiki/w/Original',
          },
          { status: 400 },
        );
      await assert.rejects(
        () =>
          previewTransport.call('reader_image', {
            kind: 'cover',
            storyId: 'test',
          }),
        (error: unknown) =>
          error instanceof ReaderError &&
          error.code === code &&
          error.sourceUrl === 'https://prts.wiki/w/Original',
      );
    }
    globalThis.fetch = async () =>
      Response.json({ error: 'missing network parse' }, { status: 400 });
    await assert.rejects(
      () => previewTransport.call('reader_snapshot', {}),
      (error: unknown) =>
        error instanceof ReaderError && error.code === 'unknown',
    );
    globalThis.fetch = async () => {
      throw new TypeError('offline');
    };
    await assert.rejects(
      () => previewTransport.call('reader_snapshot', {}),
      (error: unknown) =>
        error instanceof ReaderError && error.code === 'network',
    );
  } finally {
    globalThis.fetch = original;
  }
});

test('host adapter uses app-only error metadata; untyped bridge failures stay unknown instead of becoming source-network failures', async () => {
  const transport = hostTransport({
    callServerTool: async () => ({
      isError: true,
      content: [{ type: 'text', text: '提示文本不决定状态' }],
      _meta: {
        readerError: {
          code: 'parse',
          message: '格式已改变',
          sourceUrl: 'https://prts.wiki/w/Original',
        },
      },
    }),
  });
  await assert.rejects(
    () => transport.call('reader_image', {}),
    (error: unknown) =>
      error instanceof ReaderError &&
      error.code === 'parse' &&
      error.sourceUrl === 'https://prts.wiki/w/Original',
  );
  const rejected = hostTransport({
    callServerTool: async () => {
      throw new Error('opaque rejection');
    },
  });
  await assert.rejects(
    () => rejected.call('reader_image', {}),
    (error: unknown) =>
      error instanceof ReaderError && error.code === 'unknown',
  );
});
