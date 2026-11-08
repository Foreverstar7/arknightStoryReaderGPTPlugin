import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import {
  releaseReceipt,
  verifyReceipt,
  verifyArchive,
} from './release-artifact.js';
import { releaseGit } from './release-git.js';
import { githubReleases } from './github-release.js';
import { saveDraft } from './draft-assets.js';
import { readReleaseNotes } from './release-notes.js';

const root = path.resolve(import.meta.dirname, '..');
if (
  process.env.GITHUB_ACTIONS !== 'true' ||
  process.env.GITHUB_REF !== 'refs/heads/main'
)
  throw new Error('草稿保存仅在 main Actions 中执行。');
const directory = path.join(root, '.local/releases');
const input = releaseReceipt.parse(
  JSON.parse(await readFile(path.join(directory, 'release.json'), 'utf8')),
);
z.literal(process.env.ARTIFACT_RUN).parse(input.ciRun);
const git = releaseGit(root);
const identity = await git.identity(input.sourceCommit);
const receipt = verifyReceipt(input, {
  ...identity,
  sourceCommit: z
    .string()
    .regex(/^[a-f0-9]{40}$/u)
    .parse(process.env.SOURCE_COMMIT),
});
await verifyArchive(directory, receipt);
console.info(
  await saveDraft(
    githubReleases(
      z.string().parse(process.env.GITHUB_REPOSITORY),
      process.env.GH_TOKEN,
    ),
    git,
    receipt,
    directory,
    () => readReleaseNotes(root, receipt),
  ),
);
