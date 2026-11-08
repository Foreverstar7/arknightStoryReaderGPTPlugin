import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ReleaseReceipt } from './release-artifact.js';

export async function readReleaseNotes(root: string, receipt: ReleaseReceipt) {
  // A resumed draft may run from a later main checkout. Notes belong to the
  // accepted source, just like the archive; never read them from current HEAD.
  const { stdout } = await promisify(execFile)(
    'git',
    [
      'show',
      `${receipt.sourceCommit}:docs/releases/${receipt.version}-notes.md`,
    ],
    { cwd: root, windowsHide: true },
  );
  return stdout;
}

export function releasePresentation(receipt: ReleaseReceipt, notes: string) {
  const normalized = notes.replace(/\r\n/gu, '\n').trim();
  const [heading] = normalized.split('\n');
  const prefix = `# v${receipt.version}`;
  if (
    !heading ||
    (heading !== prefix && !heading.startsWith(`${prefix} · `)) ||
    !normalized.slice(heading.length).trim()
  )
    throw new Error(
      `发行说明须以“${prefix}”或“${prefix} · 标题”开头并包含正文。`,
    );
  return {
    title: heading.slice(2),
    body: `${normalized}\n\n---\n\n自动验收已通过。点击 Publish release 即开始 npm 和插件目录发布。\n\n- Source: ${receipt.sourceCommit}\n- Integrity: ${receipt.integrity}\n- Build: https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${receipt.ciRun}\n\n发布工作流成功后才算全部完成；已安装插件不会后台自动升级。`,
  };
}
