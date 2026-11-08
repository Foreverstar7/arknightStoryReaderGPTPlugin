import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import {
  snapshotSchema,
  imageResultSchema,
  toolNames,
} from '../src/shared/contracts.js';
import {
  coverPresentation,
  textCoverTitle,
} from '../src/shared/cover-policy.js';
import { collectImageResult } from '../src/shared/image-transfer.js';
import { readReaderLaunch } from './reader-launch.js';

const inputTarget = process.argv[2] ?? 'http://127.0.0.1:4321/mcp';
const installed = !inputTarget.startsWith('http:');
const target = installed ? path.resolve(inputTarget) : inputTarget;
const output = path.resolve('.ai/local/cover-probes');
await mkdir(output, { recursive: true });
const dataRoot = installed
  ? await mkdtemp(path.join(output, 'stdio-'))
  : undefined;
const launch = installed ? await readReaderLaunch(target) : undefined;
const wire = launch
  ? new StdioClientTransport({
      ...launch,
      env: {
        ...launch.env,
        ...(dataRoot ? { READER_DATA_DIR: dataRoot } : {}),
        READER_SOURCE: 'prts',
      },
    })
  : new StreamableHTTPClientTransport(new URL(target));
const client = new Client({ name: 'cover-contract-probe', version: '1' });
client.onerror = (error) => console.error('MCP transport:', error.message);
let maximumResultBytes = 0;
let partsReceived = 0;
async function imageCall(storyId: string) {
  async function call(part: Record<string, unknown> = {}) {
    const response = await client.callTool({
      name: 'reader_image',
      arguments: { kind: 'cover', storyId, ...part },
    });
    maximumResultBytes = Math.max(
      maximumResultBytes,
      Buffer.byteLength(JSON.stringify(response)),
    );
    if (response._meta?.readerImagePart) partsReceived++;
    return response;
  }
  const response = await call();
  assert.ok(!response.isError);
  assert.ok(!Object.hasOwn(response.structuredContent ?? {}, 'layers'));
  return imageResultSchema.parse(
    await collectImageResult(response, (part) => call(part)),
  );
}
try {
  await client.connect(wire);
  console.info(
    `Connected ${installed ? 'package stdio' : 'HTTP'} ${client.getServerVersion()?.version}`,
  );
  const tools = (await client.listTools()).tools;
  assert.deepEqual(
    tools.map((tool) => tool.name).sort(),
    [...toolNames].sort(),
  );
  for (const tool of tools) {
    const { ui } = z
      .object({ ui: z.object({ visibility: z.array(z.string()) }) })
      .parse(tool._meta);
    assert.deepEqual(
      [...ui.visibility].sort(),
      tool.name === 'reader_search' ? ['app', 'model'] : ['app'],
    );
  }
  const snapshot = snapshotSchema.parse(
    (await client.callTool({ name: 'reader_snapshot', arguments: {} }))
      .structuredContent,
  );
  const results: unknown[] = [];
  const titles = new Set([
    '黑暗时代·上',
    '黑暗时代·下',
    '异卵同生',
    '二次呼吸',
    '急性衰竭',
    '日暮寻路',
  ]);
  const samples = snapshot.stories.filter(
    (story) =>
      story.type === '四月辑录' ||
      titles.has(story.title) ||
      story.id === 'prts:活动剧情/特殊 · 危机合约',
  );
  assert.equal(samples.length, 14);
  for (const story of samples) {
    console.info(`Reading ${story.id}`);
    const storyId = story.id;
    const mime = story.title === '日暮寻路' ? 'image/jpeg' : 'image/png';
    const image = await imageCall(storyId);
    assert.ok(
      image.layers.every((layer) =>
        layer.dataUrl.startsWith(`data:${mime};base64,`),
      ),
    );
    assert.ok(image.attribution);
    assert.notEqual(coverPresentation(image), 'deferred');
    if (story.title === '日暮寻路') {
      assert.equal(
        Buffer.from(image.layers[0]?.dataUrl.split(',')[1] ?? '', 'base64')
          .length,
        17_835_330,
      );
      assert.deepEqual(await imageCall(storyId), image);
    }
    results.push({
      storyId,
      resource: image.resource,
      width: image.width,
      height: image.height,
      attribution: image.attribution,
      presentation: coverPresentation(image),
      layers: image.layers.map((layer) => ({
        mime,
        bytes: Buffer.from(layer.dataUrl.split(',')[1] ?? '', 'base64').length,
        sha256: createHash('sha256')
          .update(Buffer.from(layer.dataUrl.split(',')[1] ?? '', 'base64'))
          .digest('hex'),
      })),
    });
  }
  const textCovers = snapshot.stories.filter((story) => textCoverTitle(story));
  assert.equal(textCovers.length, 2);
  for (const story of textCovers)
    results.push({
      storyId: story.id,
      text: textCoverTitle(story),
      chapters: story.chapters.length,
      origin: 'application',
    });
  const after = snapshotSchema.parse(
    (await client.callTool({ name: 'reader_snapshot', arguments: {} }))
      .structuredContent,
  );
  assert.deepEqual(after.state, snapshot.state);
  const result = {
    mode: installed ? 'package-stdio' : 'http',
    server: client.getServerVersion(),
    tools: tools.length,
    stories: snapshot.stories.length,
    chapters: snapshot.stories.reduce(
      (sum, story) => sum + story.chapters.length,
      0,
    ),
    recordsUnchanged: true,
    maximumResultBytes,
    partsReceived,
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
