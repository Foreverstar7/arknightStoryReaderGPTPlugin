import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { npmCommand } from './npm-command.js';
import { githubReleases } from './github-release.js';
import { releaseGit } from './release-git.js';
import {
  assetNames,
  verifyReceipt,
  verifyArchive,
  versionFromTag,
  publishedEvent,
  verifyFrozenTag,
} from './release-artifact.js';
import { publishAcceptedArchive } from './npm-publication.js';
import { stableMarketplace } from './marketplace.js';

const root = path.resolve(import.meta.dirname, '..');
if (
  process.env.GITHUB_ACTIONS !== 'true' ||
  process.env.GITHUB_EVENT_NAME !== 'release'
)
  throw new Error('正式发布只允许由 release.published Actions 触发。');
const event = publishedEvent.parse(
  JSON.parse(
    await readFile(z.string().parse(process.env.GITHUB_EVENT_PATH), 'utf8'),
  ),
);
const repository = z.string().parse(process.env.GITHUB_REPOSITORY);
const store = githubReleases(repository, process.env.GH_TOKEN);
const release = await store.get(event.release.id);
if (
  release.draft ||
  release.prerelease ||
  release.tag_name !== event.release.tag_name
)
  throw new Error('Release 不是匹配事件的正式发行。');
const version = versionFromTag(release.tag_name);
if (process.env.GITHUB_REF !== `refs/tags/v${version}`)
  throw new Error('Release 事件 ref 与固定标签不一致。');
const git = releaseGit(root);
const tag = await git.tag(release.tag_name);
if (!tag) throw new Error('Release 固定标签不存在；不自动创建或移动标签。');
const identity = await git.identity(release.tag_name);
z.literal(version).parse(identity.version);
const directory = path.join(root, '.local/published');
await mkdir(directory, { recursive: true });
const download = async (name: string) => {
  const matches = release.assets.filter((asset) => asset.name === name);
  const [asset] = matches;
  if (!asset || matches.length !== 1)
    throw new Error(`Release 必须有唯一验收附件：${name}`);
  return store.download(asset);
};
const receipt = verifyReceipt(
  JSON.parse((await download('release.json')).toString('utf8')),
  { ...identity, sourceCommit: tag.commit },
);
const allowPublish = verifyFrozenTag(tag, receipt);
for (const name of assetNames(receipt))
  await writeFile(path.join(directory, name), await download(name));
await verifyArchive(directory, receipt);
const runNpm = async (args: string[]) => {
  const result = await npmCommand(args, root, { streamStderr: true });
  if (result.stdout.trim()) console.info(result.stdout.trim());
};
await publishAcceptedArchive(
  { name: receipt.package, version, integrity: receipt.integrity },
  {
    allowPublish,
    publishArchive: () =>
      runNpm([
        'publish',
        path.join(directory, receipt.filename),
        '--tag',
        'latest',
        '--ignore-scripts',
        '--access',
        'public',
      ]),
    updateLatest: () =>
      runNpm(['dist-tag', 'add', `${receipt.package}@${version}`, 'latest']),
    onPending: (attempt) =>
      console.info(`等待 npm registry 确认（第 ${attempt} 次）。`),
  },
);
const publication = {
  ...receipt,
  npmTag: 'latest',
  releaseUrl: release.html_url,
  buildCiUrl: `https://github.com/${repository}/actions/runs/${receipt.ciRun}`,
  publishCiUrl: `https://github.com/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`,
};
await mkdir(path.join(root, '.agents/plugins'), { recursive: true });
await mkdir(path.join(root, 'docs/releases'), { recursive: true });
await writeFile(
  path.join(root, '.agents/plugins/marketplace.json'),
  `${JSON.stringify(stableMarketplace(receipt.package, version), null, 2)}\n`,
);
await writeFile(
  path.join(root, `docs/releases/${version}.json`),
  `${JSON.stringify(publication, null, 2)}\n`,
);
await writeFile(
  path.join(directory, 'published.json'),
  `${JSON.stringify(publication, null, 2)}\n`,
);
console.info(
  `npm 已确认 ${receipt.package}@${version}；等待工作流提交正式目录和回执。`,
);
