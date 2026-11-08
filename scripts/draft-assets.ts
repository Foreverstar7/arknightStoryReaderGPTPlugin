import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  assetNames,
  verifyFrozenTag,
  type ReleaseReceipt,
} from './release-artifact.js';
import type { ReleaseStore } from './github-release.js';
import type { ReleaseGit } from './release-git.js';
import { releasePresentation } from './release-notes.js';

export async function saveDraft(
  store: ReleaseStore,
  git: ReleaseGit,
  receipt: ReleaseReceipt,
  directory: string,
  notes: () => Promise<string>,
) {
  const tag = `v${receipt.version}`;
  const existing = await git.tag(tag);
  if (existing && existing.commit !== receipt.sourceCommit)
    throw new Error('固定标签已指向其他提交；不移动标签。');
  if (existing) {
    if (!verifyFrozenTag(existing, receipt))
      throw new Error('旧标签没有自动验收归档记录；不重新构建或替换旧发行。');
  }
  let release = await store.find(tag);
  if (release && !release.draft)
    throw new Error('Release 已公开；不修改已发布附件。');
  const files = await Promise.all(
    assetNames(receipt).map(async (name) => ({
      name,
      bytes: await readFile(path.join(directory, name)),
    })),
  );
  // Check all existing assets before making changes; never clobber a package.
  for (const file of files) {
    const asset = release?.assets.find((item) => item.name === file.name);
    if (asset) {
      const bytes = await store.download(asset);
      if (!bytes.equals(file.bytes))
        throw new Error(`同名附件内容不一致：${file.name}`);
    }
  }
  // Validate notes before creating any immutable tag. Existing drafts retain
  // their reviewed title/body, including on interrupted-upload recovery.
  const presentation = release
    ? undefined
    : releasePresentation(receipt, await notes());
  if (!existing) await git.createTag(tag, receipt);
  if (!release && presentation)
    release = await store.create(
      tag,
      receipt.sourceCommit,
      presentation.body,
      presentation.title,
    );
  if (!release) throw new Error('尚未取得 Release 草稿。');
  for (const file of files) {
    if (!release.assets.some((item) => item.name === file.name))
      await store.upload(release.id, file.name, file.bytes);
  }
  return { releaseId: release.id, tag, integrity: receipt.integrity };
}
