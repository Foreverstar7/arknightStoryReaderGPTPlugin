import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { packRelease } from './package-layout.js';
import { npmCommand } from './npm-command.js';
const root = path.resolve(import.meta.dirname, '..');
const result = await packRelease(root, path.join(root, '.local/releases'));
const { stdout: commit } = await promisify(execFile)(
  'git',
  ['rev-parse', 'HEAD'],
  { cwd: root },
);
const { stdout: changes } = await promisify(execFile)(
  'git',
  ['status', '--porcelain'],
  { cwd: root },
);
const { stdout: npm } = await npmCommand(['--version'], root);
const metadata = {
  package: result.name,
  version: result.version,
  filename: result.filename,
  integrity: result.integrity,
  sourceCommit: commit.trim(),
  dirty: changes.trim().length > 0,
  ciRun: process.env.GITHUB_RUN_ID ?? null,
  ciAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
  node: process.versions.node,
  npm: npm.trim(),
  platform: process.platform,
  arch: process.arch,
  packedBytes: result.size,
  unpackedBytes: result.unpackedSize,
  bundled: result.bundled,
};
await writeFile(
  path.join(root, '.local/releases/release.json'),
  `${JSON.stringify(metadata, null, 2)}\n`,
);
console.info(JSON.stringify({ ...metadata, tarball: result.tarball }, null, 2));
