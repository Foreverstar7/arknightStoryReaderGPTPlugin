import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { VERSION } from '../src/shared/version.js';

const root = path.resolve(import.meta.dirname, '..');
const pkg = z
  .object({ version: z.string() })
  .parse(JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')));
if (pkg.version !== VERSION)
  throw new Error('package.json 与源码版本不一致，请先更新版本并构建。');
const marketplace = path.join(root, '.local', 'marketplace');
const plugin = path.join(marketplace, 'plugins', 'arknights-story-reader');
const manifest = z
  .object({ name: z.literal('arknights-story-reader'), version: z.string() })
  .passthrough()
  .parse(JSON.parse(await readFile(path.join(root, 'plugin.json'), 'utf8')));
if (manifest.version !== pkg.version)
  throw new Error('plugin.json 与项目版本不一致。');
await mkdir(plugin, { recursive: true });
await cp(path.join(root, 'dist'), path.join(plugin, 'dist'), {
  recursive: true,
});
await cp(path.join(root, 'node_modules'), path.join(plugin, 'node_modules'), {
  recursive: true,
});
await cp(path.join(root, 'plugin.json'), path.join(plugin, 'plugin.json'));
await cp(path.join(root, 'mcp.json'), path.join(plugin, 'mcp.json'));
if (process.platform === 'win32') {
  const nodeVersion = (
    await readFile(path.join(root, '.node-version'), 'utf8')
  ).trim();
  const runtime = path.join(
    root,
    '.local/toolchain',
    `node-v${nodeVersion}-win-${process.arch}`,
  );
  await mkdir(path.join(plugin, 'runtime'), { recursive: true });
  await cp(
    path.join(runtime, 'node.exe'),
    path.join(plugin, 'runtime/node.exe'),
  );
  await cp(path.join(runtime, 'LICENSE'), path.join(plugin, 'runtime/LICENSE'));
  const mcp = z
    .object({
      mcpServers: z.object({
        reader: z.object({ command: z.string() }).passthrough(),
      }),
    })
    .passthrough()
    .parse(JSON.parse(await readFile(path.join(root, 'mcp.json'), 'utf8')));
  // The Agent Plugins loader accepts contained ./ command paths, not placeholders.
  mcp.mcpServers.reader.command = './runtime/node.exe';
  await writeFile(path.join(plugin, 'mcp.json'), JSON.stringify(mcp, null, 2));
}
// Retain package identity/module mode, without copying private runtime data or source examples.
await writeFile(
  path.join(plugin, 'package.json'),
  JSON.stringify({
    name: 'arknights-story-reader',
    version: pkg.version,
    private: true,
    type: 'module',
  }),
);
await mkdir(path.join(marketplace, '.agents/plugins'), { recursive: true });
await writeFile(
  path.join(marketplace, '.agents/plugins/marketplace.json'),
  JSON.stringify(
    {
      name: 'arknights-reader-dev',
      interface: { displayName: '方舟阅读器本机开发' },
      plugins: [
        {
          name: 'arknights-story-reader',
          source: { source: 'local', path: './plugins/arknights-story-reader' },
          policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
          category: 'Productivity',
        },
      ],
    },
    null,
    2,
  ),
);
console.info(`Local marketplace prepared: ${marketplace}`);
