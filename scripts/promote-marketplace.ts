import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { z } from 'zod';
import { stableVersion } from './release-version.js';
import { stableMarketplace } from './marketplace.js';

const root = path.resolve(import.meta.dirname, '..');
const version = stableVersion.parse(process.argv[2]);
if (
  process.env.GITHUB_ACTIONS !== 'true' ||
  process.env.HOST_ACCEPTED !== 'true'
)
  throw new Error('稳定提升需要发布者在 Actions 明确确认真实宿主验收。');
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
const response = await fetch(
  `https://registry.npmjs.org/${encodeURIComponent(receipt.package)}/${version}`,
);
if (!response.ok)
  throw new Error(
    `明确 npm 版本不可用：HTTP ${response.status}，不提升稳定来源。`,
  );
z.object({
  name: z.literal(receipt.package),
  version: z.literal(version),
  dist: z.object({ integrity: z.literal(receipt.integrity) }),
}).parse(await response.json());
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
};
await mkdir(path.join(root, 'docs/releases'), { recursive: true });
await writeFile(
  path.join(root, `docs/releases/${version}.json`),
  `${JSON.stringify(acceptance, null, 2)}\n`,
);
await writeFile(
  path.join(root, '.local/promotion/notes.md'),
  `# ${version}\n\n- npm: ${receipt.package}@${version}\n- Source: ${receipt.sourceCommit}\n- Build and package acceptance: ${receipt.ciUrl}\n- Windows x64 Codex npm install / desktop acceptance: ${evidence}\n- Promotion: ${acceptance.promotionRun}\n- Other platforms remain unaccepted.\n- Updates keep external reading records; use a fixed version and close the reader before replacing an active Windows installation.\n`,
);
