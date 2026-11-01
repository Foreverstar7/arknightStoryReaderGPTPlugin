import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { RESOURCE_URI } from '../src/server/mcp.js';
import assert from 'node:assert/strict';
import {
  snapshotSchema,
  chapterSchema,
  readingStateSchema,
} from '../src/shared/contracts.js';

const projectRoot = path.resolve(import.meta.dirname, '..');
const root = process.argv[2] ? path.resolve(process.argv[2]) : projectRoot;
const base = path.join(projectRoot, '.ai/local/probes');
await mkdir(base, { recursive: true });
const data = await mkdtemp(path.join(base, 'stdio-'));
const client = new Client({ name: 'reader-stdio-probe', version: '0.1.0' });
const configuration = z
  .object({
    mcpServers: z.object({
      reader: z.object({
        type: z.literal('stdio'),
        command: z.string(),
        args: z.array(z.string()),
        cwd: z.string(),
      }),
    }),
  })
  .parse(JSON.parse(await readFile(path.join(root, 'mcp.json'), 'utf8')))
  .mcpServers.reader;
const expand = (value: string) => value.replaceAll('${PLUGIN_ROOT}', root);
const executable = configuration.command.startsWith('./')
  ? path.resolve(root, configuration.command)
  : configuration.command === 'node'
    ? process.execPath
    : expand(configuration.command);
const wire = new StdioClientTransport({
  command: executable,
  args: configuration.args.map(expand),
  cwd: expand(configuration.cwd),
  env: {
    READER_DATA_DIR: data,
    READER_SOURCE: process.env.READER_SOURCE ?? 'prts',
  },
});
try {
  await client.connect(wire);
  const tools = (await client.listTools()).tools;
  const result = await client.callTool({
    name: 'reader_snapshot',
    arguments: {},
  });
  const snapshot = snapshotSchema.parse(result.structuredContent);
  assert.ok(
    tools.every((tool) =>
      JSON.stringify(tool._meta?.ui).includes('"visibility":["app"]'),
    ),
  );
  const first = snapshot.stories[0]?.chapters[0];
  assert.ok(first);
  const chapter = chapterSchema.parse(
    (
      await client.callTool({
        name: 'reader_chapter',
        arguments: { chapterId: first.id },
      })
    ).structuredContent,
  );
  const block = chapter.blocks[0];
  assert.ok(block);
  const state = readingStateSchema.parse(
    (
      await client.callTool({
        name: 'reader_record',
        arguments: {
          chapterId: chapter.id,
          revision: chapter.revision,
          last: { blockId: block.id, fraction: 0.4 },
          atEnd: false,
        },
      })
    ).structuredContent,
  );
  assert.equal(state.recentChapterId, chapter.id);
  const resource = await client.readResource({ uri: RESOURCE_URI });
  const html = resource.contents.find((item) => 'text' in item);
  if (
    !html ||
    !('text' in html) ||
    !html.text.includes('<html') ||
    html.text.includes('src="/src/')
  )
    throw new Error('正式 UI 资源未正确打包。');
  console.info(
    JSON.stringify(
      {
        transport: 'stdio',
        packagedRuntime: configuration.command.startsWith('./runtime/'),
        server: client.getServerVersion(),
        tools: tools.length,
        stories: snapshot.stories.length,
        resource: RESOURCE_URI,
        htmlBytes: Buffer.byteLength(html.text),
        source: snapshot.sourceLabel,
        chapter: {
          id: chapter.id,
          source: chapter.source,
          blocks: chapter.blocks.length,
          savedPosition: state.records[chapter.id]?.last,
        },
      },
      null,
      2,
    ),
  );
} finally {
  await client.close();
  await rm(data, { recursive: true, force: true });
}
