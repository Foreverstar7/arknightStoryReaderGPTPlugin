import assert from 'node:assert/strict';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { z } from 'zod';
import { extractPackage } from './package-layout.js';
import { npmCommand } from './npm-command.js';
import { readReaderLaunch } from './reader-launch.js';
import {
  chapterSchema,
  readingStateSchema,
  snapshotSchema,
  type ReadingState,
} from '../src/shared/contracts.js';
import { collectImageResult } from '../src/shared/image-transfer.js';
import { imageResultSchema } from '../src/shared/contracts.js';
import { RESOURCE_URI } from '../src/server/mcp.js';
import { checkVersions } from './release-version.js';

const project = path.resolve(import.meta.dirname, '..');
const identity = await checkVersions(project);
const args = process.argv.slice(2);
const live = args.includes('--prts');
const input = args.find((arg) => !arg.startsWith('--'));
const tarball = path.resolve(
  input ??
    `.local/releases/${identity.name.replaceAll('/', '-').replaceAll('@', '')}-${identity.version}.tgz`,
);
// A temp directory outside the checkout prevents Node ancestor resolution from
// borrowing source node_modules. No npm install or lifecycle script runs here.
const sandbox = await mkdtemp(path.join(tmpdir(), 'arknights package 阅读器 '));
await writeFile(
  path.join(sandbox, 'package.json'),
  JSON.stringify({ name: 'reader-package-acceptance', private: true }),
);
let client: Client | undefined;
try {
  const root = await extractPackage(tarball, sandbox);
  const data = path.join(sandbox, 'user-data');
  const pkg = z
    .object({
      name: z.literal(identity.name),
      version: z.literal(identity.version),
      type: z.literal('module'),
      dependencies: z.record(z.string(), z.string()),
      devDependencies: z.record(z.string(), z.string()),
      bin: z.object({
        'arknights-story-reader': z.literal('dist/server/cli.js'),
      }),
    })
    .parse(JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')));
  const files: string[] = [];
  async function inventory(directory: string, relative = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const name = path.posix.join(relative, entry.name);
      assert.equal(
        entry.isSymbolicLink(),
        false,
        `Package retains symlink: ${name}`,
      );
      if (entry.isDirectory())
        await inventory(path.join(directory, entry.name), name);
      else files.push(name);
    }
  }
  await inventory(root);
  const own = files.filter((file) => !file.startsWith('node_modules/'));
  assert.ok(
    own.every((file) =>
      /^(?:dist\/(?:.+\.js|ui\/index\.html)|package\.json|plugin\.json|mcp\.json|README\.md)$/u.test(
        file,
      ),
    ),
    'Unexpected source/runtime/private content in package',
  );
  assert.ok(
    !own.some((file) => /(?:fixture|server\/main\.js|probe|test)/u.test(file)),
    'Development content leaked into release',
  );
  assert.ok(
    !files.some((file) => /\.(?:node|exe|sqlite|tgz)$/u.test(file)),
    'Package is not a portable JS-only payload',
  );
  for (const dep of Object.keys(pkg.devDependencies)) {
    if (!Object.hasOwn(pkg.dependencies, dep))
      await assert.rejects(
        readFile(path.join(root, 'node_modules', dep, 'package.json')),
      );
  }
  // npm checks the actual extracted production tree, including transitive peers.
  await npmCommand(['ls', '--omit=dev', '--all', '--offline', '--json'], root);
  const launch = await readReaderLaunch(root);
  assert.equal(launch.command, process.execPath);
  assert.equal(launch.packagedRuntime, false);
  assert.ok(launch.args.includes('--installed'));
  async function connect(mode: 'manifest' | 'bin' | 'npx' = 'manifest') {
    const connection = new Client({
      name: 'npm-package-acceptance',
      version: '1',
    });
    await connection.connect(
      new StdioClientTransport({
        ...launch,
        ...(mode === 'bin'
          ? { args: [path.join(root, pkg.bin['arknights-story-reader'])] }
          : mode === 'npx'
            ? {
                args: [
                  process.env.npm_execpath ?? '',
                  'exec',
                  '--yes',
                  '--offline',
                  '--ignore-scripts',
                  '--cache',
                  path.join(sandbox, 'npm-cache'),
                  '--package',
                  tarball,
                  '--',
                  'arknights-story-reader',
                ],
                cwd: sandbox,
              }
            : {}),
        env: {
          ...launch.env,
          READER_SOURCE: 'prts',
          READER_DATA_DIR: data,
        },
      }),
    );
    assert.equal(connection.getServerVersion()?.version, identity.version);
    return connection;
  }
  client = await connect();
  const tools = (await client.listTools()).tools;
  assert.equal(tools.length, 10);
  for (const tool of tools) {
    const meta = z
      .object({ ui: z.object({ visibility: z.array(z.string()) }) })
      .parse(tool._meta);
    assert.deepEqual(meta.ui.visibility, ['app']);
  }
  const open = tools.find((tool) => tool.name === 'reader_open');
  assert.ok(open);
  const entry = z
    .object({
      'openai/ui': z.object({
        entrypoints: z.array(z.object({ type: z.string() })),
      }),
    })
    .parse(open._meta);
  assert.ok(
    entry['openai/ui'].entrypoints.some((item) => item.type === 'global'),
  );
  const resource = await client.readResource({ uri: RESOURCE_URI });
  const html = resource.contents.find((item) => 'text' in item);
  assert.ok(
    html &&
      'text' in html &&
      html.text.includes('<html') &&
      !html.text.includes('src="/src/'),
  );
  let readingEvidence;
  if (live) {
    const snapshotResult = await client.callTool({
      name: 'reader_snapshot',
      arguments: {},
    });
    assert.notEqual(
      snapshotResult.isError,
      true,
      JSON.stringify(snapshotResult._meta?.readerError),
    );
    const snapshot = snapshotSchema.parse(snapshotResult.structuredContent);
    const story = snapshot.stories.find(
      (item) => item.id === 'prts:骑兵与猎人',
    );
    const first = story?.chapters[0];
    assert.ok(first);
    const chapter = chapterSchema.parse(
      (
        await client.callTool({
          name: 'reader_chapter',
          arguments: { chapterId: first.id },
        })
      ).structuredContent,
    );
    const start =
      chapter.blocks.find(
        (block) => block.kind === 'speech' || block.kind === 'narration',
      ) ?? chapter.blocks[0];
    const end = chapter.blocks.at(-1);
    assert.ok(start && end);
    async function record(blockId: string, fraction: number, atEnd: boolean) {
      assert.ok(client);
      return readingStateSchema.parse(
        (
          await client.callTool({
            name: 'reader_record',
            arguments: {
              chapterId: chapter.id,
              revision: chapter.revision,
              last: { blockId, fraction },
              atEnd,
            },
          })
        ).structuredContent,
      );
    }
    const completed = await record(end.id, 1, true);
    const saved = await record(start.id, 0.4, false);
    assert.deepEqual(saved.records[chapter.id]?.last, {
      blockId: start.id,
      fraction: 0.4,
    });
    assert.equal(
      saved.records[chapter.id]?.furthestWords,
      completed.records[chapter.id]?.furthestWords,
    );
    let image;
    const cg = chapter.blocks.find((block) => block.kind === 'cg');
    if (live && cg) {
      const request = { kind: 'cg', chapterId: chapter.id, blockId: cg.id };
      const result = await client.callTool({
        name: 'reader_image',
        arguments: request,
      });
      const connection = client;
      const parsed = imageResultSchema.parse(
        await collectImageResult(result, (part) =>
          connection.callTool({
            name: 'reader_image',
            arguments: { ...request, ...part },
          }),
        ),
      );
      assert.equal(
        Object.hasOwn(result.structuredContent ?? {}, 'layers'),
        false,
      );
      image = {
        width: parsed.width,
        height: parsed.height,
        layers: parsed.layers.length,
      };
    }
    async function state(): Promise<ReadingState> {
      assert.ok(client);
      return snapshotSchema.parse(
        (await client.callTool({ name: 'reader_snapshot', arguments: {} }))
          .structuredContent,
      ).state;
    }
    await client.close();
    client = await connect('bin'); // Exercise the npm bin too, without extra flags.
    assert.deepEqual(await state(), saved);
    for (const scope of ['images', 'all']) {
      const result = await client.callTool({
        name: 'reader_clear_cache',
        arguments: { scope },
      });
      assert.notEqual(result.isError, true);
      assert.deepEqual(await state(), saved);
    }
    await client.close();
    client = await connect();
    assert.deepEqual(await state(), saved);
    await client.close();
    client = await connect('npx'); // A clean, offline npm cache consumes this tgz.
    assert.deepEqual(await state(), saved);
    readingEvidence = {
      stories: snapshot.stories.length,
      blocks: chapter.blocks.length,
      image,
      lastAndFurthestSeparate: true,
      restartRestores: true,
      clearCacheKeepsRecords: true,
    };
  } else {
    // No catalog request: ordinary PR checks must work without PRTS.
    for (const mode of ['bin', 'npx'] as const) {
      await client.close();
      client = await connect(mode);
      assert.equal((await client.listTools()).tools.length, 10);
      const resource = await client.readResource({ uri: RESOURCE_URI });
      assert.ok(
        resource.contents.some(
          (item) => 'text' in item && item.text === html.text,
        ),
      );
    }
  }
  // Installation removal is independent of the external user-data directory.
  await client.close();
  client = undefined;
  await rm(root, { recursive: true });
  if (live) {
    const sqlite = await readFile(path.join(data, 'reading/records.sqlite'));
    assert.ok(sqlite.length > 0);
  }
  const result = {
    package: identity.name,
    version: identity.version,
    source: live ? 'prts' : 'offline-protocol',
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    externalDirectory: true,
    installScriptsRun: false,
    productionTreeComplete: true,
    devDependenciesAbsent: true,
    systemNode: true,
    offlineNpmExec: true,
    files: files.length,
    tools: tools.length,
    globalEntrypoint: true,
    allToolsAppOnly: true,
    htmlBytes: Buffer.byteLength(html.text),
    developmentContentAbsent: true,
    ...readingEvidence,
    uninstallKeepsRecords: live ? true : undefined,
  };
  const reports = path.join(project, '.local/releases');
  await mkdir(reports, { recursive: true });
  await writeFile(
    path.join(reports, `verification-${live ? 'prts' : 'offline'}.json`),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  console.info(JSON.stringify(result, null, 2));
} finally {
  await client?.close();
  await rm(sandbox, { recursive: true, force: true });
}
