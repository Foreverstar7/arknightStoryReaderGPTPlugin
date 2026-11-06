import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

export const stableVersion = z.string().regex(/^\d+\.\d+\.\d+$/u);
const versionedJson = z.object({ version: z.string() }).passthrough();
export async function checkVersions(root: string) {
  const read = async (file: string) =>
    JSON.parse(await readFile(path.join(root, file), 'utf8'));
  const pkg = versionedJson
    .extend({ name: z.string() })
    .parse(await read('package.json'));
  const plugin = versionedJson
    .extend({ name: z.string() })
    .parse(await read('plugin.json'));
  const lock = versionedJson
    .extend({
      name: z.string(),
      packages: z
        .object({ '': versionedJson.extend({ name: z.string() }) })
        .passthrough(),
    })
    .parse(await read('package-lock.json'));
  const source = await readFile(
    path.join(root, 'src/shared/version.ts'),
    'utf8',
  );
  if (
    [plugin.version, lock.version, lock.packages[''].version].some(
      (v) => v !== pkg.version,
    ) ||
    !source.includes(`export const VERSION = '${pkg.version}';`) ||
    lock.name !== pkg.name ||
    lock.packages[''].name !== pkg.name
  )
    throw new Error(
      'package／lock／plugin／源码版本或 npm 包名不一致。运行 npm run release:version -- X.Y.Z。',
    );
  stableVersion.parse(pkg.version);
  return { name: pkg.name, version: pkg.version, pluginName: plugin.name };
}
export async function setVersion(root: string, input: string) {
  const version = stableVersion.parse(input);
  const read = async (file: string) =>
    versionedJson.parse(
      JSON.parse(await readFile(path.join(root, file), 'utf8')),
    );
  const pkg = await read('package.json');
  const plugin = await read('plugin.json');
  const lock = versionedJson
    .extend({ packages: z.object({ '': versionedJson }).passthrough() })
    .parse(await read('package-lock.json'));
  await readFile(path.join(root, 'src/shared/version.ts'), 'utf8');
  pkg.version =
    plugin.version =
    lock.version =
    lock.packages[''].version =
      version;
  // Marketplace stays on the last accepted version until separate promotion.
  await writeFile(
    path.join(root, 'package.json'),
    `${JSON.stringify(pkg, null, 2)}\n`,
  );
  await writeFile(
    path.join(root, 'plugin.json'),
    `${JSON.stringify(plugin, null, 2)}\n`,
  );
  await writeFile(
    path.join(root, 'package-lock.json'),
    `${JSON.stringify(lock, null, 2)}\n`,
  );
  await writeFile(
    path.join(root, 'src/shared/version.ts'),
    `export const VERSION = '${version}';\n`,
  );
}
