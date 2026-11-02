import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { FixtureSource } from '../src/data/fixture.js';
import { createReaderMcp, RESOURCE_URI } from '../src/server/mcp.js';
import { ReaderService } from '../src/server/service.js';
import { readingStateSchema, snapshotSchema } from '../src/shared/contracts.js';
import { readerFailureSchema } from '../src/shared/errors.js';
import path from 'node:path';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';

test('SDK negotiation, app-only visibility, extension registration and persistence tools work over MCP', async () => {
  const base = path.resolve('.ai/local/test-data');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, 'mcp-'));
  const service = new ReaderService(new FixtureSource(), root);
  const server = createReaderMcp(service, process.cwd());
  const client = new Client({ name: 'reader-test', version: '0.1.0' });
  const [clientWire, serverWire] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverWire);
    await client.connect(clientWire);
    const tools = (await client.listTools()).tools;
    assert.equal(tools.length, 9);
    assert.ok(
      tools.every((tool) =>
        JSON.stringify(tool._meta?.ui).includes('"visibility":["app"]'),
      ),
    );
    const open = tools.find((tool) => tool.name === 'reader_open');
    assert.ok(open);
    assert.deepEqual(open._meta?.['openai/ui'], {
      entrypoints: [{ type: 'global' }, { type: 'thread' }],
    });
    assert.ok(JSON.stringify(open._meta?.ui).includes(RESOURCE_URI));
    const result = await client.callTool({
      name: 'reader_snapshot',
      arguments: {},
    });
    assert.equal(result.isError, undefined);
    assert.equal(
      snapshotSchema.parse(result.structuredContent).stories.length,
      3,
    );
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
      clients.map((client, index) =>
        client.callTool({
          name: 'reader_record',
          arguments: {
            chapterId: `fixture-mist/${index + 1}`,
            revision: 'original-fixture-v1',
            last: { blockId: 'report', fraction: 0.5 },
            atEnd: false,
          },
        }),
      ),
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
    await rm(root, { recursive: true, force: true });
  }
});
