import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { z } from 'zod';
import { VERSION } from '../src/shared/version.js';
import { runtimeLayout } from '../scripts/runtime-layout.js';
import {
  readReaderLaunch,
  resolveReaderLaunch,
} from '../scripts/reader-launch.js';

test('source, package, lockfile and plugin versions agree with the pinned toolchain metadata', async () => {
  const readJson = async (file: string): Promise<unknown> =>
    JSON.parse(await readFile(file, 'utf8'));
  const version = z.object({ version: z.literal(VERSION) });
  const pkg = version
    .extend({
      engines: z.object({ node: z.string(), npm: z.string() }),
      packageManager: z.string().regex(/^npm@\d+\.\d+\.\d+$/u),
    })
    .parse(await readJson('package.json'));
  version.parse(await readJson('plugin.json'));
  version
    .extend({ packages: z.object({ '': version }) })
    .parse(await readJson('package-lock.json'));
  const nodeVersion = (await readFile('.node-version', 'utf8')).trim();
  assert.equal((await readFile('.nvmrc', 'utf8')).trim(), nodeVersion);
  assert.equal(pkg.engines.node, `>=${nodeVersion}`);
  assert.equal(pkg.engines.npm, `>=${pkg.packageManager.slice('npm@'.length)}`);
});

test('native packages select the official archive layout for six desktop targets', () => {
  for (const arch of ['x64', 'arm64']) {
    for (const [platform, distribution, source, command] of [
      ['win32', 'win', 'node.exe', './runtime/node.exe'],
      ['darwin', 'darwin', 'bin/node', './runtime/node'],
      ['linux', 'linux', 'bin/node', './runtime/node'],
    ]) {
      assert.ok(platform && distribution && source && command);
      const actual = runtimeLayout('26.13.0', platform, arch);
      assert.equal(
        actual.distribution,
        `node-v26.13.0-${distribution}-${arch}`,
      );
      assert.equal(actual.sourceExecutable, source);
      assert.equal(actual.command, command);
    }
  }
  assert.throws(() => runtimeLayout('26.13.0', 'android', 'arm64'));
  assert.throws(() => runtimeLayout('26.13.0', 'linux', 'ia32'));
  assert.throws(() => runtimeLayout('../runtime', 'linux', 'x64'));
});

test('package probes resolve the manifest after relocation, including spaces and Unicode', async () => {
  const base = path.resolve('.ai/local/tests');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, 'relocated 阅读器 '));
  try {
    for (const command of ['./runtime/node.exe', './runtime/node']) {
      await writeFile(
        path.join(root, 'mcp.json'),
        JSON.stringify({
          mcpServers: {
            reader: {
              type: 'stdio',
              command,
              args: [
                '${PLUGIN_ROOT}/dist/server/main.js',
                '--stdio',
                '--installed',
              ],
              cwd: '${PLUGIN_ROOT}',
              env: { READER_EXAMPLE: '${PLUGIN_ROOT}/example' },
            },
          },
        }),
      );
      const launch = await readReaderLaunch(root);
      assert.equal(launch.command, path.resolve(root, command));
      assert.deepEqual(launch.args, [
        `${root}/dist/server/main.js`,
        '--stdio',
        '--installed',
      ]);
      assert.equal(launch.cwd, root);
      assert.equal(launch.env.READER_EXAMPLE, `${root}/example`);
      assert.equal(launch.packagedRuntime, true);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('source probes use the active Node and reject malformed launch contracts', () => {
  const launch = resolveReaderLaunch(
    {
      mcpServers: {
        reader: {
          type: 'stdio',
          command: 'node',
          args: ['${PLUGIN_ROOT}/dist/server/main.js', '--stdio'],
          cwd: '${PLUGIN_ROOT}',
        },
      },
    },
    process.cwd(),
  );
  assert.equal(launch.command, process.execPath);
  assert.equal(launch.packagedRuntime, false);
  assert.deepEqual(launch.env, {});
  assert.throws(() => resolveReaderLaunch({ mcpServers: {} }, process.cwd()));
});
