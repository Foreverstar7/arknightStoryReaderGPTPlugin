import { chmod, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { z } from 'zod';
import { VERSION } from '../src/shared/version.js';
import { runtimeLayout } from './runtime-layout.js';
import { readerManifestSchema } from './reader-launch.js';

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
const nodeVersion = (
  await readFile(path.join(root, '.node-version'), 'utf8')
).trim();
const layout = runtimeLayout(nodeVersion);
const runtime = path.join(root, '.local/toolchain', layout.distribution);
const runtimeExecutable = path.join(runtime, layout.sourceExecutable);
// Run the prepared official binary before copying anything. This also detects
// a wrong architecture/version and a runtime without our required SQLite API.
let runtimeInfo: string;
try {
  const result = await promisify(execFile)(
    runtimeExecutable,
    [
      '--input-type=module',
      '-e',
      'import { DatabaseSync } from "node:sqlite"; const db = new DatabaseSync(":memory:"); db.close(); console.log(JSON.stringify({ version: process.versions.node, platform: process.platform, arch: process.arch }));',
    ],
    { timeout: 15_000 },
  );
  runtimeInfo = result.stdout;
} catch (cause) {
  throw new Error(
    `项目运行时不可用：${runtimeExecutable}。先运行 scripts/setup-toolchain.${process.platform === 'win32' ? 'ps1' : 'sh'}，并在目标系统／架构上安装依赖和构建。`,
    { cause },
  );
}
z.object({
  version: z.literal(nodeVersion),
  platform: z.literal(process.platform),
  arch: z.literal(process.arch),
}).parse(JSON.parse(runtimeInfo));
const mcp = readerManifestSchema.parse(
  JSON.parse(await readFile(path.join(root, 'mcp.json'), 'utf8')),
);
// The Agent Plugins loader accepts contained ./ command paths, not placeholders.
mcp.mcpServers.reader.command = layout.command;
await mkdir(plugin, { recursive: true });
await cp(path.join(root, 'dist'), path.join(plugin, 'dist'), {
  recursive: true,
});
await cp(path.join(root, 'node_modules'), path.join(plugin, 'node_modules'), {
  recursive: true,
  // npm creates symlinks on POSIX. Copy targets so the package does not retain
  // links into this checkout when moved or installed elsewhere.
  dereference: true,
});
await cp(path.join(root, 'plugin.json'), path.join(plugin, 'plugin.json'));
await mkdir(path.join(plugin, 'runtime'), { recursive: true });
const packagedExecutable = path.join(plugin, 'runtime', layout.executable);
await cp(runtimeExecutable, packagedExecutable);
if (process.platform !== 'win32') await chmod(packagedExecutable, 0o755);
await cp(path.join(runtime, 'LICENSE'), path.join(plugin, 'runtime/LICENSE'));
await writeFile(path.join(plugin, 'mcp.json'), JSON.stringify(mcp, null, 2));
await writeFile(
  path.join(plugin, 'runtime/target.json'),
  JSON.stringify(
    { platform: process.platform, arch: process.arch, node: nodeVersion },
    null,
    2,
  ),
);
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
console.info(
  `Local marketplace prepared (${process.platform}/${process.arch}): ${marketplace}`,
);
