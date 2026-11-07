import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  assetNames,
  verifyFrozenTag,
  type ReleaseReceipt,
} from './release-artifact.js';
import type { ReleaseStore } from './github-release.js';
import type { ReleaseGit } from './release-git.js';

export async function saveDraft(
  store: ReleaseStore,
  git: ReleaseGit,
  receipt: ReleaseReceipt,
  directory: string,
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
  if (!existing) await git.createTag(tag, receipt);
  if (!release)
    release = await store.create(
      tag,
      receipt.sourceCommit,
      `# ${tag}\n\n自动验收已通过。草稿准备工作流成功后，点击 Publish release 即开始 npm 和插件目录发布。\n\n- Source: ${receipt.sourceCommit}\n- Integrity: ${receipt.integrity}\n- Build: https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${receipt.ciRun}\n\n发布工作流成功后才算全部完成；已安装插件不会后台自动升级。`,
    );
  for (const file of files) {
    if (!release.assets.some((item) => item.name === file.name))
      await store.upload(release.id, file.name, file.bytes);
  }
  return { releaseId: release.id, tag, integrity: receipt.integrity };
}
