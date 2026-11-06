import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { extractPackage, packRelease } from './package-layout.js';

const root = path.resolve(import.meta.dirname, '..');
const marketplace = path.join(root, '.local/marketplace');
const builds = path.join(marketplace, 'builds');
await mkdir(builds, { recursive: true });
// Never replace a directory which might be open in a running desktop session.
const build = await mkdtemp(path.join(builds, 'reader-'));
const packed = await packRelease(root, build);
const plugin = await extractPackage(packed.tarball, build);
// Development-only overlay; these files never enter the npm archive.
for (const file of ['dist/server/main.js', 'dist/data/fixture.js'])
  await copyFile(path.join(root, file), path.join(plugin, file));
const mcpFile = path.join(plugin, 'mcp.json');
await writeFile(
  mcpFile,
  (await readFile(mcpFile, 'utf8')).replace('/production.js', '/main.js'),
);
const manifestFile = path.join(plugin, 'plugin.json');
const manifest = z
  .object({
    extensions: z
      .object({
        'com.openai': z
          .object({
            interface: z.object({ displayName: z.string() }).passthrough(),
          })
          .passthrough(),
      })
      .passthrough(),
  })
  .passthrough()
  .parse(JSON.parse(await readFile(manifestFile, 'utf8')));
manifest.extensions['com.openai'].interface.displayName += '（开发）';
await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
await mkdir(path.join(marketplace, '.agents/plugins'), { recursive: true });
await writeFile(
  path.join(marketplace, '.agents/plugins/marketplace.json'),
  `${JSON.stringify(
    {
      name: 'arknights-reader-dev',
      interface: { displayName: '方舟阅读器本机开发' },
      plugins: [
        {
          name: 'arknights-story-reader',
          source: {
            source: 'local',
            path: `./${path.relative(marketplace, plugin).split(path.sep).join('/')}`,
          },
          policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
          category: 'Productivity',
        },
      ],
    },
    null,
    2,
  )}\n`,
);
console.info(
  JSON.stringify(
    { marketplace, plugin, version: packed.version, runtime: 'system node' },
    null,
    2,
  ),
);
