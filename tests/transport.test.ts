import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ReaderError, type ReaderFailure } from '../src/shared/errors.js';
import { hostTransport, previewTransport } from '../src/ui/transport.js';
import { FixtureSource } from '../src/data/fixture.js';
import { initialState } from '../src/shared/contracts.js';
import { searchStories } from '../src/domain/search.js';
import { searchForModel, searchInputSchema } from '../src/shared/search.js';

test('search UI hydrates full cards from metadata while the model receives only compact public results', async () => {
  const full = searchStories(
    await new FixtureSource().catalog(),
    searchInputSchema.parse({ queries: ['雾中来信'] }),
  );
  const compact = searchForModel(full);
  const transport = hostTransport({
    callServerTool: async () => ({
      structuredContent: compact,
      _meta: { readerSearch: full },
      content: [{ type: 'text', text: '搜索完成' }],
    }),
  });
  const hydrated = await transport.call('reader_search', {
    queries: ['雾中来信'],
  });
  assert.equal(hydrated.results[0]?.chapterCount, 6);
  assert.equal('chapterCount' in (compact.results[0] ?? {}), false);
});

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
    () => transport.call('reader_image', { kind: 'cover', storyId: 'test' }),
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
    () => rejected.call('reader_image', { kind: 'cover', storyId: 'test' }),
    (error: unknown) =>
      error instanceof ReaderError && error.code === 'unknown',
  );
});

test('HTTP and host boundaries return typed results, reject corrupt and wrong-chapter results, and retain neutral portraits', async () => {
  const original = globalThis.fetch;
  const source = new FixtureSource();
  const chapter = await source.chapter('fixture-mist/1');
  let value: Record<string, unknown> = {};
  globalThis.fetch = async () => Response.json(value);
  const host = hostTransport({
    callServerTool: async () => ({
      content: [],
      structuredContent: value,
      _meta: { readerImage: value },
    }),
  });
  const invalidResult = (error: unknown) =>
    error instanceof ReaderError && error.code === 'parse';
  try {
    for (const transport of [previewTransport, host]) {
      value = {
        stories: await source.catalog(),
        state: initialState(),
        sourceLabel: source.label,
      };
      const snapshot = await transport.call('reader_snapshot', {});
      assert.equal(snapshot.stories.length, 3);
      assert.equal(snapshot.state.settings.retentionDays, 7);
      value = chapter;
      assert.deepEqual(
        await transport.call('reader_chapter', { chapterId: chapter.id }),
        chapter,
      );
      await assert.rejects(
        () => transport.call('reader_chapter', { chapterId: 'fixture-mist/2' }),
        invalidResult,
      );
      value = {
        chapterId: 'other',
        storyId: chapter.storyId,
        revision: chapter.revision,
        wordCount: 42,
        verifiedAt: 1,
      };
      await assert.rejects(
        () =>
          transport.call('reader_prepare_chapter', { chapterId: chapter.id }),
        invalidResult,
      );
      value = {
        stories: [],
        state: { ...initialState(), settings: { theme: 'light' } },
        sourceLabel: source.label,
      };
      await assert.rejects(
        () => transport.call('reader_snapshot', {}),
        (error: unknown) =>
          invalidResult(error) &&
          error instanceof Error &&
          error.cause instanceof Error,
      );
      value = {
        width: 1,
        height: 1,
        resource: 'neutral',
        sourceUrl: 'https://prts.wiki/w/Original',
        layers: [],
      };
      await assert.rejects(
        () =>
          transport.call('reader_image', {
            kind: 'portrait',
            chapterId: chapter.id,
            blockId: 'a',
          }),
        invalidResult,
      );
      value = {
        ...value,
        portrait: {
          status: 'placeholder',
          requested: 'anonymous',
          reason: 'ambiguous',
          message: '未知人物',
          evidence: [],
        },
      };
      const portrait = await transport.call('reader_image', {
        kind: 'portrait',
        chapterId: chapter.id,
        blockId: 'a',
      });
      assert.equal(portrait.portrait?.status, 'placeholder');
      assert.deepEqual(portrait.layers, []);
      value = { cleared: 'history' };
      await assert.rejects(
        () => transport.call('reader_clear_cache', { scope: 'all' }),
        invalidResult,
      );
    }
  } finally {
    globalThis.fetch = original;
  }
});

test('transport connection failures preserve the original cause without classifying host rejection as a source outage', async () => {
  const original = globalThis.fetch;
  const cause = new Error('connection rejected');
  globalThis.fetch = async () => {
    throw cause;
  };
  const host = hostTransport({
    callServerTool: async () => {
      throw cause;
    },
  });
  try {
    for (const [transport, code] of [
      [previewTransport, 'network'],
      [host, 'unknown'],
    ] as const) {
      await assert.rejects(
        () => transport.call('reader_snapshot', {}),
        (error: unknown) =>
          error instanceof ReaderError &&
          error.code === code &&
          error.cause === cause,
      );
    }
  } finally {
    globalThis.fetch = original;
  }
});
