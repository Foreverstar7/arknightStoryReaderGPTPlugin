import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { readReaderLaunch } from './reader-launch.js';
import { RESOURCE_URI } from '../src/server/mcp.js';
import assert from 'node:assert/strict';
import { collectImageResult } from '../src/shared/image-transfer.js';
import {
  snapshotSchema,
  chapterSchema,
  readingStateSchema,
  imageResultSchema,
} from '../src/shared/contracts.js';

const projectRoot = path.resolve(import.meta.dirname, '..');
const root = process.argv[2] ? path.resolve(process.argv[2]) : projectRoot;
const base = path.join(projectRoot, '.ai/local/probes');
await mkdir(base, { recursive: true });
const data = await mkdtemp(path.join(base, 'stdio-'));
const client = new Client({ name: 'reader-stdio-probe', version: '0.1.0' });
const launch = await readReaderLaunch(root);
const wire = new StdioClientTransport({
  ...launch,
  env: {
    ...launch.env,
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
    tools.find((tool) => tool.name === 'reader_snapshot')?.inputSchema
      .properties?.refreshCatalog,
  );
  const refreshed = snapshotSchema.parse(
    (
      await client.callTool({
        name: 'reader_snapshot',
        arguments: { refreshCatalog: true },
      })
    ).structuredContent,
  );
  assert.ok(refreshed.stories.length > 0);
  assert.deepEqual(refreshed.state, snapshot.state);
  assert.ok(
    tools.every((tool) =>
      JSON.stringify(tool._meta?.ui).includes('"visibility":["app"]'),
    ),
  );
  const first = (
    snapshot.stories.find((story) => story.id === 'prts:骑兵与猎人') ??
    snapshot.stories[0]
  )?.chapters[0];
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
  const cg = chapter.blocks.find((block) => block.kind === 'cg');
  let image;
  if (chapter.source === 'prts' && cg) {
    const result = await client.callTool({
      name: 'reader_image',
      arguments: { kind: 'cg', chapterId: chapter.id, blockId: cg.id },
    });
    const parsed = imageResultSchema.parse(
      await collectImageResult(result, (part) =>
        client.callTool({
          name: 'reader_image',
          arguments: {
            kind: 'cg',
            chapterId: chapter.id,
            blockId: cg.id,
            ...part,
          },
        }),
      ),
    );
    assert.ok(
      typeof result.structuredContent === 'object' &&
        result.structuredContent !== null,
    );
    assert.equal(Object.hasOwn(result.structuredContent, 'layers'), false);
    image = {
      resource: parsed.resource,
      width: parsed.width,
      height: parsed.height,
      layers: parsed.layers.length,
      binaryInAppMetaOnly: true,
    };
  }
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
        packagedRuntime: launch.packagedRuntime,
        server: client.getServerVersion(),
        tools: tools.length,
        stories: snapshot.stories.length,
        resource: RESOURCE_URI,
        htmlBytes: Buffer.byteLength(html.text),
        source: snapshot.sourceLabel,
        image,
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
