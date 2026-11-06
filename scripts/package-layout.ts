import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { npmCommand } from './npm-command.js';
import { checkVersions } from './release-version.js';
export const packResultSchema = z
  .record(
    z.string(),
    z.object({
      name: z.string(),
      version: z.string(),
      filename: z.string(),
      size: z.number(),
      unpackedSize: z.number(),
      integrity: z.string(),
      bundled: z.array(z.string()),
      files: z.array(z.object({ path: z.string(), size: z.number() })),
    }),
  )
  .refine(
    (value) => Object.keys(value).length === 1,
    'Expected one npm 12 pack result',
  );
export async function packRelease(root: string, destination: string) {
  const identity = await checkVersions(root);
  const built = await readFile(
    path.join(root, 'dist/shared/version.js'),
    'utf8',
  );
  if (!built.includes(`'${identity.version}'`))
    throw new Error('dist 版本过期，请重新构建。');
  await mkdir(destination, { recursive: true });
  const { stdout } = await npmCommand(
    ['pack', '--ignore-scripts', '--json', '--pack-destination', destination],
    root,
  );
  const [result] = Object.values(packResultSchema.parse(JSON.parse(stdout)));
  if (
    !result ||
    result.version !== identity.version ||
    result.name !== identity.name
  )
    throw new Error('npm pack 返回了不匹配的包。');
  return { ...result, tarball: path.join(destination, result.filename) };
}
export async function extractPackage(tarball: string, destination: string) {
  await mkdir(destination, { recursive: true });
  const exec = promisify(execFile);
  const { stdout } = await exec('tar', ['-tzf', tarball], {
    maxBuffer: 16 * 1024 * 1024,
  });
  if (
    stdout
      .trim()
      .split(/\r?\n/u)
      .some(
        (entry) =>
          !entry.startsWith('package/') || entry.split('/').includes('..'),
      )
  )
    throw new Error('归档路径不在 package/ 内。');
  // Windows tar can lose Unicode in its -C argument; Node passes cwd natively.
  // Resolve the archive before changing cwd so caller-relative inputs still work.
  await exec('tar', ['-xzf', path.resolve(tarball)], {
    cwd: destination,
    timeout: 60_000,
  });
  return path.join(destination, 'package');
}
