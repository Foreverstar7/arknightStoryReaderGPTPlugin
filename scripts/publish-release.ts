import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import { checkVersions } from './release-version.js';
import { npmCommand } from './npm-command.js';
import { verifyTarball } from './artifact-integrity.js';
import {
  registeredPackage,
  waitForRegisteredPackage,
} from './publication-registry.js';

const root = path.resolve(import.meta.dirname, '..');
const identity = await checkVersions(root);
if (
  process.env.GITHUB_ACTIONS !== 'true' ||
  process.env.GITHUB_REF !== `refs/tags/v${identity.version}`
)
  throw new Error('远程发布只允许在匹配正式版本标签的 Actions 中执行。');
const { stdout } = await promisify(execFile)('git', ['rev-parse', 'HEAD'], {
  cwd: root,
});
const artifact = z
  .object({
    package: z.literal(identity.name),
    version: z.literal(identity.version),
    filename: z.string().regex(/^[a-zA-Z0-9._-]+\.tgz$/u),
    integrity: z.string(),
    sourceCommit: z.literal(stdout.trim()),
    dirty: z.literal(false),
    ciRun: z.literal(process.env.GITHUB_RUN_ID),
  })
  .parse(
    JSON.parse(
      await readFile(path.join(root, '.local/releases/release.json'), 'utf8'),
    ),
  );
verifyTarball(
  await readFile(path.join(root, '.local/releases', artifact.filename)),
  artifact.integrity,
);
const registryUrl = `https://registry.npmjs.org/${encodeURIComponent(identity.name)}/${identity.version}`;
const expectedPublication = { ...identity, integrity: artifact.integrity };
if (!(await registeredPackage(expectedPublication))) {
  // Publish exactly the accepted tarball; never rebuild in the publish job.
  const result = await npmCommand(
    [
      'publish',
      path.join(root, '.local/releases', artifact.filename),
      '--tag',
      'next',
      '--ignore-scripts',
      '--access',
      'public',
    ],
    root,
    { streamStderr: true },
  );
  if (result.stdout.trim()) console.info(result.stdout.trim());
  await waitForRegisteredPackage(expectedPublication, {
    onPending: (attempt) => {
      console.info(
        `npm registry 尚未同步该版本，正在等待（第 ${attempt} 次）。`,
      );
    },
  });
}
const receipt = {
  ...artifact,
  registryUrl,
  ciUrl: `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
};
await writeFile(
  path.join(root, '.local/releases/published.json'),
  `${JSON.stringify(receipt, null, 2)}\n`,
);
await writeFile(
  path.join(root, '.local/releases/notes.md'),
  `# ${identity.version} — npm candidate\n\n- Package: ${identity.name}@${identity.version} (tag: next; use an exact version)\n- Source: ${artifact.sourceCommit}\n- CI: ${receipt.ciUrl}\n- Artifact integrity: ${artifact.integrity}\n- Windows x64 package/fixture/PRTS checks passed in CI.\n- Codex npm installation and full desktop reading acceptance still required before stable marketplace promotion.\n- macOS/Linux/ARM64 have not been accepted.\n`,
);
console.info(
  `npm 已确认 ${identity.name}@${identity.version}；稳定来源保持原版本。`,
);
