import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { z } from 'zod';
import { stableVersion } from './release-version.js';
import { stableMarketplace } from './marketplace.js';
import { npmCommand } from './npm-command.js';
import { promoteLatest } from './stable-promotion.js';

const root = path.resolve(import.meta.dirname, '..');
const version = stableVersion.parse(process.argv[2]);
if (
  process.env.GITHUB_ACTIONS !== 'true' ||
  process.env.HOST_ACCEPTED !== 'true' ||
  process.env.GITHUB_REF !== 'refs/heads/main'
)
  throw new Error('稳定提升需要在 main 的 Actions 中明确确认真实宿主验收。');
const evidence = z
  .url()
  .startsWith('https://')
  .parse(process.env.HOST_EVIDENCE);
const { stdout: commit } = await promisify(execFile)(
  'git',
  ['rev-list', '-n', '1', `v${version}`],
  { cwd: root },
);
const { stdout: taggedPackage } = await promisify(execFile)(
  'git',
  ['show', `v${version}:package.json`],
  { cwd: root },
);
const identity = z
  .object({ name: z.string().min(1), version: z.literal(version) })
  .parse(JSON.parse(taggedPackage));
const receipt = z
  .object({
    package: z.literal(identity.name),
    version: z.literal(version),
    integrity: z.string(),
    sourceCommit: z.literal(commit.trim()),
    dirty: z.literal(false),
    ciRun: z.string().regex(/^\d+$/u),
    ciUrl: z.url(),
  })
  .parse(
    JSON.parse(
      await readFile(
        path.join(root, '.local/promotion/published.json'),
        'utf8',
      ),
    ),
  );
if (
  receipt.ciUrl !==
  `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${receipt.ciRun}`
)
  throw new Error('发布回执的 CI 地址与仓库／run ID 不一致。');
await promoteLatest(
  { name: receipt.package, version, integrity: receipt.integrity },
  {
    updateLatest: async () => {
      // npm authenticates with this workflow's OIDC identity. Its trusted
      // publisher must separately allow npm dist-tag; publishing permission
      // from release.yml does not authorize this operation.
      const result = await npmCommand(
        ['dist-tag', 'add', `${receipt.package}@${version}`, 'latest'],
        root,
        { streamStderr: true },
      );
      if (result.stdout.trim()) console.info(result.stdout.trim());
    },
    onPending: (attempt) =>
      console.info(`正在等待 npm latest 同步（第 ${attempt} 次）。`),
  },
);
await mkdir(path.join(root, '.agents/plugins'), { recursive: true });
await writeFile(
  path.join(root, '.agents/plugins/marketplace.json'),
  `${JSON.stringify(stableMarketplace(receipt.package, version), null, 2)}\n`,
);
const acceptance = {
  ...receipt,
  hostEvidence: evidence,
  confirmedBy: process.env.GITHUB_ACTOR,
  promotionRun: `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
  platform: 'Windows x64',
  npmTag: 'latest',
};
await mkdir(path.join(root, 'docs/releases'), { recursive: true });
await writeFile(
  path.join(root, `docs/releases/${version}.json`),
  `${JSON.stringify(acceptance, null, 2)}\n`,
);
await writeFile(
  path.join(root, '.local/promotion/notes.md'),
  `# ${version}\n\n- npm latest: ${receipt.package}@${version}\n- Source: ${receipt.sourceCommit}\n- Build and package acceptance: ${receipt.ciUrl}\n- Windows x64 Codex npm install / desktop acceptance: ${evidence}\n- Promotion: ${acceptance.promotionRun}\n- Other platforms remain unaccepted.\n- Updates keep external reading records; use a fixed version and close the reader before replacing an active Windows installation.\n- Refresh the marketplace before installing: codex plugin marketplace upgrade arknights-reader\n`,
);
