import { appendFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { checkVersions } from './release-version.js';
import { planRelease } from './release-artifact.js';
import { releaseGit } from './release-git.js';
import { githubReleases } from './github-release.js';

const root = path.resolve(import.meta.dirname, '..');
if (
  process.env.GITHUB_ACTIONS !== 'true' ||
  process.env.GITHUB_REF !== 'refs/heads/main'
)
  throw new Error('草稿计划仅在 main Actions 中执行。');
const repository = z.string().parse(process.env.GITHUB_REPOSITORY);
const identity = await checkVersions(root);
const git = releaseGit(root);
const tag = await git.tag(`v${identity.version}`);
const store = githubReleases(repository, process.env.GH_TOKEN);
const release = await store.find(`v${identity.version}`);
let registered = false;
if (!tag && !release) {
  const response = await fetch(
    `https://registry.npmjs.org/${encodeURIComponent(identity.name)}/${identity.version}`,
    { signal: AbortSignal.timeout(15_000) },
  );
  if (!response.ok && response.status !== 404)
    throw new Error(`npm registry: HTTP ${response.status}`);
  if (response.ok) {
    z.object({
      name: z.literal(identity.name),
      version: z.literal(identity.version),
    }).parse(await response.json());
    registered = true;
  }
}
const plan = planRelease({
  ...identity,
  head: await git.head(),
  run: z.string().regex(/^\d+$/u).parse(process.env.GITHUB_RUN_ID),
  tag,
  release: release
    ? {
        draft: release.draft,
        assets: release.assets
          .filter((asset) => asset.state === 'uploaded')
          .map((asset) => asset.name),
      }
    : null,
  registered,
  acceptedRun:
    !tag &&
    !release &&
    Number(process.env.GITHUB_RUN_ATTEMPT) > 1 &&
    (await store.hasArtifact(z.string().parse(process.env.GITHUB_RUN_ID)))
      ? process.env.GITHUB_RUN_ID
      : undefined,
});
if (process.env.GITHUB_OUTPUT)
  await appendFile(
    process.env.GITHUB_OUTPUT,
    Object.entries(plan)
      .map(([key, value]) => `${key}=${value}\n`)
      .join(''),
  );
console.info(JSON.stringify(plan));
