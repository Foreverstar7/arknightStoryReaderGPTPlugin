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
import { readerManifestSchema } from './reader-launch.js';

const root = path.resolve(import.meta.dirname, '..');
// One publisher-owned name drives both the development catalog and deep links.
const marketplaceName = 'arknights-reader-dev';
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
const manifestFile = path.join(plugin, 'plugin.json');
const manifest = z
  .object({
    name: z.string().min(1),
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
const mcpFile = path.join(plugin, 'mcp.json');
const mcp = readerManifestSchema.parse(
  JSON.parse(await readFile(mcpFile, 'utf8')),
);
mcp.mcpServers.reader.args = mcp.mcpServers.reader.args.map((arg) =>
  arg.replace('/production.js', '/main.js'),
);
mcp.mcpServers.reader.env = {
  ...mcp.mcpServers.reader.env,
  READER_PLUGIN_TARGET: `${manifest.name}@${marketplaceName}`,
};
await writeFile(mcpFile, `${JSON.stringify(mcp, null, 2)}\n`);
await mkdir(path.join(marketplace, '.agents/plugins'), { recursive: true });
await writeFile(
  path.join(marketplace, '.agents/plugins/marketplace.json'),
  `${JSON.stringify(
    {
      name: marketplaceName,
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
