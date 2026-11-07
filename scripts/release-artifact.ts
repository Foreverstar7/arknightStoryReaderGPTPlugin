import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { stableVersion } from './release-version.js';
import { verifyTarball } from './artifact-integrity.js';

export const releaseReceipt = z
  .object({
    package: z.string().min(1),
    version: stableVersion,
    filename: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.tgz$/u),
    integrity: z.string().regex(/^sha512-[a-zA-Z0-9+/]+={0,2}$/u),
    sourceCommit: z.string().regex(/^[a-f0-9]{40}$/u),
    dirty: z.literal(false),
    ciRun: z.string().regex(/^\d+$/u),
  })
  .passthrough();
export type ReleaseReceipt = z.infer<typeof releaseReceipt>;

export const publishedEvent = z.object({
  action: z.literal('published'),
  release: z.object({
    id: z.number(),
    tag_name: z.string(),
    draft: z.literal(false),
    prerelease: z.literal(false),
  }),
});

export function verifyFrozenTag(
  tag: { commit: string; message: string },
  receipt: ReleaseReceipt,
) {
  if (tag.commit !== receipt.sourceCommit)
    throw new Error('固定标签与验收源码不一致。');
  if (!tag.message.trim().startsWith('{')) return false;
  const frozen = verifyReceipt(JSON.parse(tag.message), {
    name: receipt.package,
    version: receipt.version,
    sourceCommit: tag.commit,
  });
  if (
    frozen.integrity !== receipt.integrity ||
    frozen.ciRun !== receipt.ciRun ||
    frozen.filename !== receipt.filename
  )
    throw new Error('归档与固定标签记录的原验收包不一致。');
  return true;
}

export function versionFromTag(tag: string) {
  if (!tag.startsWith('v')) throw new Error('Release 标签必须为 vX.Y.Z。');
  return stableVersion.parse(tag.slice(1));
}

export function verifyReceipt(
  input: unknown,
  expected: { name: string; version: string; sourceCommit: string },
) {
  return releaseReceipt
    .extend({
      package: z.literal(expected.name),
      version: z.literal(expected.version),
      sourceCommit: z.literal(expected.sourceCommit),
    })
    .parse(input);
}

export function assetNames(receipt: ReleaseReceipt) {
  return [receipt.filename, 'release.json', 'verification-prts.json'];
}

export async function verifyArchive(
  directory: string,
  receipt: ReleaseReceipt,
) {
  const archive = path.join(directory, receipt.filename);
  verifyTarball(await readFile(archive), receipt.integrity);
  for (const file of ['package.json', 'plugin.json']) {
    const { stdout } = await promisify(execFile)(
      'tar',
      ['-xOf', archive, `package/${file}`],
      { maxBuffer: 1024 * 1024, windowsHide: true },
    );
    z.object({
      name: z.literal(receipt.package),
      version: z.literal(receipt.version),
    }).parse(JSON.parse(stdout));
  }
  z.object({
    package: z.literal(receipt.package),
    version: z.literal(receipt.version),
    source: z.literal('prts'),
    offlineProtocol: z.literal(true),
    productionTreeComplete: z.literal(true),
  }).parse(
    JSON.parse(
      await readFile(path.join(directory, 'verification-prts.json'), 'utf8'),
    ),
  );
}

export function planRelease(input: {
  name: string;
  version: string;
  head: string;
  run: string;
  tag: { commit: string; message: string } | null;
  release: { draft: boolean; assets: string[] } | null;
  registered: boolean;
  acceptedRun?: string;
}) {
  const version = stableVersion.parse(input.version);
  if (input.tag) {
    if (
      input.release &&
      (!input.release.draft ||
        (['release.json', 'verification-prts.json'].every((name) =>
          input.release?.assets.includes(name),
        ) &&
          input.release.assets.some((name) => name.endsWith('.tgz'))))
    )
      return {
        mode: 'skip',
        version,
        source: input.tag.commit,
        run: input.run,
      };
    // New automatic tags retain the original accepted run for interrupted
    // draft uploads. Existing legacy tags are never moved or rebuilt.
    const receipt = verifyReceipt(JSON.parse(input.tag.message), {
      name: input.name,
      version,
      sourceCommit: input.tag.commit,
    });
    return {
      mode: 'resume',
      version,
      source: receipt.sourceCommit,
      run: receipt.ciRun,
    };
  }
  if (input.release)
    throw new Error('已有同名 Release 但缺少固定标签；不覆盖现有发行。');
  if (input.acceptedRun)
    return {
      mode: 'resume',
      version,
      source: input.head,
      run: input.acceptedRun,
    };
  return {
    mode: input.registered ? 'skip' : 'build',
    version,
    source: input.head,
    run: input.run,
  };
}
