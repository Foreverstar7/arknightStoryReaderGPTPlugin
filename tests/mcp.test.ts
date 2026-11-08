import { CacheCoordinator } from '../src/storage/cache-coordinator.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { FixtureSource } from '../src/data/fixture.js';
import { placeholderPortrait } from '../src/data/prts-portrait.js';
import {
  createReaderMcp,
  RESOURCE_URI,
  SEARCH_RESOURCE_URI,
} from '../src/server/mcp.js';
import {
  modelSearchResultSchema,
  searchResultSchema,
} from '../src/shared/search.js';
import { ReaderService } from '../src/server/service.js';
import {
  readingStateSchema,
  snapshotSchema,
  type ImageInput,
  type ToolName,
} from '../src/shared/contracts.js';
import { readerFailureSchema } from '../src/shared/errors.js';
import path from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';

test('SDK negotiation, app-only visibility, extension registration and persistence tools work over MCP', async () => {
  const base = path.resolve('.ai/local/test-data');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, 'mcp-'));
  const uiRoot = path.join(root, 'dist/ui');
  await mkdir(uiRoot, { recursive: true });
  await writeFile(
    path.join(uiRoot, 'index.html'),
    '<!doctype html><html lang="zh-CN"><body>原创协议测试界面</body></html>',
    'utf8',
  );
  const forwardedViews: (string | undefined)[] = [];
  const source = new (class extends FixtureSource {
    async image(input: ImageInput) {
      if (input.kind === 'portrait') forwardedViews.push(input.portraitView);
      return placeholderPortrait(
        'original-protocol-fixture',
        'original-test',
        '原创测试占位图。',
        ['https://example.invalid/original-fixture'],
      );
    }
  })();
  const service = new ReaderService(source, root);
  const server = createReaderMcp(service, root);
  const client = new Client({ name: 'reader-test', version: '0.1.0' });
  const [clientWire, serverWire] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverWire);
    await client.connect(clientWire);
    const tools = (await client.listTools()).tools;
    assert.equal(tools.length, 12);
    assert.ok(
      tools
        .filter((tool) => tool.name !== 'reader_search')
        .every((tool) =>
          JSON.stringify(tool._meta?.ui).includes('"visibility":["app"]'),
        ),
    );
    assert.deepEqual(
      tools
        .filter((tool) => JSON.stringify(tool._meta?.ui).includes('model'))
        .map((tool) => tool.name),
      ['reader_search'],
    );
    const open = tools.find((tool) => tool.name === 'reader_open');
    assert.ok(open);
    assert.deepEqual(open._meta?.['openai/ui'], {
      entrypoints: [{ type: 'global' }, { type: 'thread' }],
    });
    assert.ok(JSON.stringify(open._meta?.ui).includes(RESOURCE_URI));
    const beforeSearch = await service.records.read();
    const searched = await client.callTool({
      name: 'reader_search',
      arguments: { by: 'character', queries: ['记录员'] },
    });
    assert.equal(searched.isError, undefined);
    assert.equal(
      modelSearchResultSchema.parse(searched.structuredContent).total,
      3,
    );
    assert.equal(
      searchResultSchema.parse(searched._meta?.readerSearch).results[0]
        ?.matchedChapters.length,
      6,
    );
    assert.deepEqual(await service.records.read(), beforeSearch);
    const resource = await client.readResource({ uri: SEARCH_RESOURCE_URI });
    assert.ok(JSON.stringify(resource).includes('data-entry=\\"search\\"'));
    const readerResource = await client.readResource({ uri: RESOURCE_URI });
    assert.ok(JSON.stringify(readerResource).includes('原创协议测试界面'));
    assert.ok(
      !JSON.stringify(readerResource).includes('data-entry=\\"search\\"'),
    );
    for (const portraitView of ['default', 'scene']) {
      const image = await client.callTool({
        name: 'reader_image',
        arguments: {
          kind: 'portrait',
          chapterId: 'fixture-mist/1',
          blockId: 'report',
          portraitView,
        },
      });
      assert.equal(image.isError, undefined);
    }
    assert.deepEqual(forwardedViews, ['default', 'scene']);
    const result = await client.callTool({
      name: 'reader_snapshot',
      arguments: {},
    });
    assert.equal(result.isError, undefined);
    assert.equal(
      snapshotSchema.parse(result.structuredContent).stories.length,
      3,
    );
    assert.ok(
      tools.find((tool) => tool.name === 'reader_snapshot')?.inputSchema
        .properties?.refreshCatalog,
    );
    const refreshed = await client.callTool({
      name: 'reader_snapshot',
      arguments: { refreshCatalog: true },
    });
    assert.equal(refreshed.isError, undefined);
    assert.equal(
      snapshotSchema.parse(refreshed.structuredContent).stories.length,
      3,
    );
    await client.callTool({
      name: 'reader_chapter',
      arguments: { chapterId: 'fixture-mist/1' },
    });
    const saved = await client.callTool({
      name: 'reader_record',
      arguments: {
        chapterId: 'fixture-mist/1',
        revision: 'original-fixture-v1',
        last: { blockId: 'report', fraction: 0.5 },
        atEnd: false,
      },
    });
    assert.equal(
      readingStateSchema.parse(saved.structuredContent).recentChapterId,
      'fixture-mist/1',
    );
    const beforeInvalid = await service.records.read();
    const invalidCalls: {
      name: ToolName;
      arguments: Record<string, unknown>;
    }[] = [
      { name: 'reader_snapshot', arguments: { refreshCatalog: 'yes' } },
      { name: 'reader_chapter', arguments: { chapterId: '' } },
      { name: 'reader_prepare_chapter', arguments: {} },
      { name: 'reader_chapter_info', arguments: { chapterId: 1 } },
      {
        name: 'reader_image',
        arguments: { kind: 'portrait', storyId: 'fixture-mist' },
      },
      {
        name: 'reader_record',
        arguments: {
          chapterId: 'fixture-mist/1',
          revision: 'original-fixture-v1',
          last: { blockId: 'report', fraction: 2 },
          atEnd: false,
        },
      },
      {
        name: 'reader_settings',
        arguments: { autoImages: true, retentionDays: 0, theme: 'light' },
      },
      { name: 'reader_clear_cache', arguments: { scope: 'history' } },
      { name: 'reader_clear_history', arguments: { story: 'fixture-mist' } },
    ];
    for (const request of invalidCalls) {
      assert.equal(
        (await client.callTool(request)).isError,
        true,
        request.name,
      );
      await assert.rejects(() => service.call(request.name, request.arguments));
    }
    assert.deepEqual(await service.records.read(), beforeInvalid);
    const clear = tools.find((tool) => tool.name === 'reader_clear_history');
    assert.ok(clear?.inputSchema.properties?.storyId);
    const untouched = await client.callTool({
      name: 'reader_clear_history',
      arguments: { storyId: 'fixture-lights' },
    });
    assert.equal(
      readingStateSchema.parse(untouched.structuredContent).recentChapterId,
      'fixture-mist/1',
    );
    const cleared = await client.callTool({
      name: 'reader_clear_history',
      arguments: { storyId: 'fixture-mist' },
    });
    assert.deepEqual(
      readingStateSchema.parse(cleared.structuredContent).records,
      {},
    );
    const missing = await client.callTool({
      name: 'reader_chapter',
      arguments: { chapterId: 'missing' },
    });
    assert.equal(missing.isError, true);
    assert.equal(
      readerFailureSchema.parse(missing._meta?.readerError).code,
      'not_found',
    );
  } finally {
    await client.close();
    await server.close();
    new CacheCoordinator(root).close();
    await rm(root, { recursive: true, force: true });
  }
});

test('two independent stdio processes preserve shared reading records under simultaneous updates', async () => {
  const base = path.resolve('.ai/local/test-data');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, 'shared-'));
  const clients = [
    new Client({ name: 'parallel-one', version: '1' }),
    new Client({ name: 'parallel-two', version: '1' }),
  ];
  try {
    await Promise.all(
      clients.map((client) =>
        client.connect(
          new StdioClientTransport({
            command: process.execPath,
            args: [
              '--import',
              'tsx',
              path.resolve('src/server/main.ts'),
              '--stdio',
            ],
            env: { READER_DATA_DIR: root, READER_SOURCE: 'fixture' },
          }),
        ),
      ),
    );
    await Promise.all(
      clients.map(async (client, index) => {
        await client.callTool({
          name: 'reader_chapter',
          arguments: { chapterId: `fixture-mist/${index + 1}` },
        });
        return client.callTool({
          name: 'reader_record',
          arguments: {
            chapterId: `fixture-mist/${index + 1}`,
            revision: 'original-fixture-v1',
            last: { blockId: 'report', fraction: 0.5 },
            atEnd: false,
          },
        });
      }),
    );
    const client = clients[0];
    assert.ok(client);
    const state = snapshotSchema.parse(
      (await client.callTool({ name: 'reader_snapshot', arguments: {} }))
        .structuredContent,
    ).state;
    assert.equal(Object.keys(state.records).length, 2);
    assert.ok(state.records['fixture-mist/1']);
    assert.ok(state.records['fixture-mist/2']);
  } finally {
    await Promise.all(clients.map((client) => client.close()));
    new CacheCoordinator(root).close();
    await rm(root, { recursive: true, force: true });
  }
});
