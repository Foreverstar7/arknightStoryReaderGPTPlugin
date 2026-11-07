import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { ReleaseReceipt } from './release-artifact.js';

export function releaseGit(root: string) {
  const git = async (...args: string[]) =>
    (
      await promisify(execFile)('git', args, { cwd: root, windowsHide: true })
    ).stdout.trim();
  return {
    head: () => git('rev-parse', 'HEAD'),
    async identity(ref: string) {
      return z
        .object({ name: z.string(), version: z.string() })
        .parse(JSON.parse(await git('show', `${ref}:package.json`)));
    },
    async tag(tag: string) {
      const refs = await git('tag', '--list', tag);
      if (!refs) return null;
      return {
        commit: await git('rev-list', '-n', '1', tag),
        message: await git(
          'for-each-ref',
          '--format=%(contents)',
          `refs/tags/${tag}`,
        ),
      };
    },
    async createTag(tag: string, receipt: ReleaseReceipt) {
      const directory = path.join(root, '.local/releases');
      await mkdir(directory, { recursive: true });
      const message = path.join(directory, 'tag-message.json');
      await writeFile(message, `${JSON.stringify(receipt, null, 2)}\n`);
      await git('tag', '-a', tag, receipt.sourceCommit, '-F', message);
      // No force/update path: a concurrent or existing remote ref must fail.
      await git('push', 'origin', `refs/tags/${tag}`);
    },
  };
}
export type ReleaseGit = ReturnType<typeof releaseGit>;
