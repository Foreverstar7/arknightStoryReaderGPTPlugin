import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ReaderImage } from '../src/shared/contracts.js';
import { ReaderError } from '../src/shared/errors.js';
import {
  collectImageResult,
  imagePartSchema,
  IMAGE_PART_CHARACTERS,
} from '../src/shared/image-transfer.js';
import { imageToolMetadata as createImageMetadata } from '../src/server/image-transfer.js';
import { hostTransport } from '../src/ui/transport.js';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { FixtureSource } from '../src/data/fixture.js';
import { ReaderService } from '../src/server/service.js';
import { createReaderMcp } from '../src/server/mcp.js';
import { CacheCoordinator } from '../src/storage/cache-coordinator.js';

const imageToolMetadata = (image: ReaderImage, args: unknown) =>
  createImageMetadata(image, args, '0');

const image: ReaderImage = {
  width: 1,
  height: 1,
  resource: '原创传输字节',
  sourceUrl: 'https://prts.wiki/w/File:test.png',
  layers: [
    {
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      sourceUrl: 'https://media.prts.wiki/test.png',
      dataUrl:
        'data:image/png;base64,' +
        Buffer.alloc(2_000_000, 17).toString('base64'),
    },
  ],
};

test('clearing from another service cancels old MCP image parts before any source read; an explicit new request still works', async () => {
  const base = path.resolve('.ai/local/test-data');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, 'image-transfer-clear-'));
  let reads = 0;
  class TransferSource extends FixtureSource {
    async image() {
      reads++;
      return image;
    }
  }
  const source = new TransferSource();
  const service = new ReaderService(source, root);
  const other = new ReaderService(source, root);
  const server = createReaderMcp(service, process.cwd());
  const client = new Client({ name: 'transfer-clear', version: '1' });
  const [clientWire, serverWire] = InMemoryTransport.createLinkedPair();
  const args = { kind: 'cover', storyId: 'fixture-mist' };
  const call = (part = {}) =>
    client.callTool({ name: 'reader_image', arguments: { ...args, ...part } });
  try {
    await server.connect(serverWire);
    await client.connect(clientWire);
    const before = await service.records.read();
    for (const scope of ['images', 'all'] as const) {
      const first = await call();
      assert.ok(!first.isError);
      await other.call('reader_clear_cache', { scope });
      const beforeRead = reads;
      await assert.rejects(
        () => collectImageResult(first, call),
        (error: unknown) =>
          error instanceof ReaderError && error.code === 'conflict',
      );
      assert.equal(reads, beforeRead);
      assert.deepEqual(await collectImageResult(await call(), call), image);
    }
    assert.deepEqual(await service.records.read(), before);
  } finally {
    await client.close();
    await server.close();
    new CacheCoordinator(root).close();
    await rm(root, { recursive: true, force: true });
  }
});
test('host transport reconstructs exact original bytes using the same app-only tool; refresh applies only to the first part', async () => {
  const calls: unknown[] = [];
  let largest = 0;
  const transport = hostTransport({
    callServerTool: async (request) => {
      calls.push(request.arguments);
      assert.equal(request.name, 'reader_image');
      if (calls.length > 1) assert.equal(request.arguments?.refresh, false);
      const response = {
        content: [],
        _meta: imageToolMetadata(image, request.arguments),
      };
      largest = Math.max(largest, Buffer.byteLength(JSON.stringify(response)));
      return response;
    },
  });
  assert.deepEqual(
    await transport.call('reader_image', {
      kind: 'cover',
      storyId: 'test',
      refresh: true,
    }),
    image,
  );
  assert.equal(calls.length, 3);
  assert.ok(largest < IMAGE_PART_CHARACTERS + 2_000);
  const small = {
    ...image,
    layers: [
      {
        dataUrl: 'data:image/png;base64,AAAA',
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        sourceUrl: 'https://media.prts.wiki/test.png',
      },
    ],
  };
  assert.deepEqual(imageToolMetadata(small, {}).readerImage, small);
});
test('changed, missing, reordered and excessive image parts fail explicitly instead of displaying mixed bytes', async () => {
  const first = { _meta: imageToolMetadata(image, {}) };
  const initial = imagePartSchema.parse(first._meta.readerImagePart);
  assert.throws(
    () =>
      imageToolMetadata(
        { ...image, resource: 'revised' },
        { partIndex: 1, transferId: initial.transferId },
      ),
    /来源已变化/u,
  );
  assert.throws(() => imageToolMetadata(image, { partIndex: 1 }), /缺少版本/u);
  assert.throws(
    () =>
      imageToolMetadata(image, {
        partIndex: 12,
        transferId: initial.transferId,
      }),
    /索引/u,
  );
  for (const part of [
    undefined,
    { ...initial, index: 0 },
    { ...initial, index: 1, transferId: '0'.repeat(64) },
    { ...initial, index: 1, count: 65 },
    { ...initial, index: 1, data: 'x'.repeat(IMAGE_PART_CHARACTERS + 1) },
  ]) {
    await assert.rejects(
      () =>
        collectImageResult(first, async () => ({
          _meta: { readerImagePart: part },
        })),
      (error: unknown) =>
        error instanceof ReaderError && error.code === 'parse',
    );
  }
  await assert.rejects(
    () =>
      collectImageResult(first, async () => ({
        isError: true,
        _meta: {
          readerError: {
            code: 'network',
            message: '中断',
            sourceUrl: image.sourceUrl,
          },
        },
      })),
    (error: unknown) =>
      error instanceof ReaderError &&
      error.code === 'network' &&
      error.sourceUrl === image.sourceUrl,
  );
});
