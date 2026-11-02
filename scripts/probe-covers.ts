import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { snapshotSchema, imageResultSchema } from '../src/shared/contracts.js';
import { readerFailureSchema } from '../src/shared/errors.js';

const target = process.argv[2] ?? 'http://127.0.0.1:4321/mcp';
const installed = !target.startsWith('http:');
const output = path.resolve('.ai/local/cover-probes');
await mkdir(output, { recursive: true });
const dataRoot = installed
  ? await mkdtemp(path.join(output, 'stdio-'))
  : undefined;
const wire = installed
  ? new StdioClientTransport({
      command: path.join(target, 'runtime/node.exe'),
      args: [
        path.join(target, 'dist/server/main.js'),
        '--stdio',
        '--installed',
      ],
      cwd: target,
      env: {
        ...(dataRoot ? { READER_DATA_DIR: dataRoot } : {}),
        READER_SOURCE: 'prts',
      },
    })
  : new StreamableHTTPClientTransport(new URL(target));
const client = new Client({ name: 'cover-contract-probe', version: '1' });
try {
  await client.connect(wire);
  const tools = (await client.listTools()).tools;
  assert.equal(tools.length, 9);
  assert.ok(
    tools.every((tool) =>
      JSON.stringify(tool._meta?.ui).includes('"visibility":["app"]'),
    ),
  );
  const snapshot = snapshotSchema.parse(
    (await client.callTool({ name: 'reader_snapshot', arguments: {} }))
      .structuredContent,
  );
  const results: unknown[] = [];
  for (const [storyId, mime] of [
    ['prts:骑兵与猎人', 'image/png'],
    ['prts:活动剧情/集成战略 · 傀影与猩红孤钻', 'image/png'],
    ['prts:活动剧情/生息演算 · 沙中之火', 'image/png'],
    ['prts:活动剧情/集成战略 · 刻俄柏的灰蕈迷境', 'image/jpeg'],
    ['prts:局部坏死', 'image/jpeg'],
    ['prts:活动剧情/四月辑录 · 断罪者的挑战状', 'image/png'],
  ]) {
    const response = await client.callTool({
      name: 'reader_image',
      arguments: { kind: 'cover', storyId },
    });
    assert.ok(!response.isError);
    const image = imageResultSchema.parse(response._meta?.readerImage);
    assert.ok(!Object.hasOwn(response.structuredContent ?? {}, 'layers'));
    assert.ok(
      image.layers.every((layer) =>
        layer.dataUrl.startsWith(`data:${mime};base64,`),
      ),
    );
    assert.ok(image.attribution);
    results.push({
      storyId,
      resource: image.resource,
      width: image.width,
      height: image.height,
      attribution: image.attribution,
      layers: image.layers.map((layer) => ({
        mime,
        sha256: createHash('sha256')
          .update(Buffer.from(layer.dataUrl.split(',')[1] ?? '', 'base64'))
          .digest('hex'),
      })),
    });
  }
  for (const storyId of ['prts:黑暗时代·上', 'prts:主线剧情/特殊 · 剧情']) {
    const response = await client.callTool({
      name: 'reader_image',
      arguments: { kind: 'cover', storyId, refresh: true },
    });
    assert.equal(response.isError, true);
    const failure = readerFailureSchema.parse(response._meta?.readerError);
    assert.equal(failure.code, 'unsupported');
    assert.ok(failure.sourceUrl);
    results.push({ storyId, failure });
  }
  const after = snapshotSchema.parse(
    (await client.callTool({ name: 'reader_snapshot', arguments: {} }))
      .structuredContent,
  );
  assert.deepEqual(after.state, snapshot.state);
  const result = {
    mode: installed ? 'installed-stdio' : 'http',
    server: client.getServerVersion(),
    tools: tools.length,
    stories: snapshot.stories.length,
    chapters: snapshot.stories.reduce(
      (sum, story) => sum + story.chapters.length,
      0,
    ),
    recordsUnchanged: true,
    results,
  };
  await writeFile(
    path.join(output, `${result.mode}.json`),
    JSON.stringify(result, null, 2),
  );
  console.info(JSON.stringify(result, null, 2));
} finally {
  await client.close();
}
