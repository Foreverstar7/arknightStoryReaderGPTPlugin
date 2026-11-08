import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  readReleaseNotes,
  releasePresentation,
} from '../scripts/release-notes.js';
import type { ReleaseReceipt } from '../scripts/release-artifact.js';

test('release notes come from the accepted commit even if the working tree has a later version', async () => {
  const base = path.resolve('.ai/local/tests');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, 'release-notes-'));
  const git = async (...args: string[]) =>
    (
      await promisify(execFile)('git', args, { cwd: root, windowsHide: true })
    ).stdout.trim();
  try {
    await git('init');
    await git('config', 'user.name', 'Original release fixture');
    await git('config', 'user.email', 'fixture@example.invalid');
    await mkdir(path.join(root, 'docs/releases'), { recursive: true });
    const file = path.join(root, 'docs/releases/1.1.4-notes.md');
    const original = '# v1.1.4 · 侧栏跳转\n\n- 固定提交中的发行说明。\n';
    await writeFile(file, original);
    await git('add', '.');
    await git('commit', '-m', 'Original accepted release notes');
    const sourceCommit = await git('rev-parse', 'HEAD');
    await writeFile(file, '# v9.9.9\n\n后续工作树内容。');
    const receipt: ReleaseReceipt = {
      package: 'reader',
      version: '1.1.4',
      filename: 'reader-1.1.4.tgz',
      sourceCommit,
      integrity: 'sha512-original',
      dirty: false,
      ciRun: '123',
      ciAttempt: '1',
      node: '26.13.0',
      npm: '12.2.1',
      platform: 'win32',
      arch: 'x64',
      packedBytes: 1,
      unpackedBytes: 1,
      bundled: [],
    };
    const notes = await readReleaseNotes(root, receipt);
    assert.equal(notes, original);
    assert.notEqual(notes, await readFile(file, 'utf8'));
    const presentation = releasePresentation(receipt, notes);
    assert.equal(presentation.title, 'v1.1.4 · 侧栏跳转');
    assert.ok(presentation.body.startsWith(original.trim()));
    assert.ok(presentation.body.includes(sourceCommit));
    assert.ok(presentation.body.includes(receipt.integrity));
    assert.ok(presentation.body.includes('Publish release'));
    for (const invalid of [
      '',
      '# v1.1.4',
      '# v1.1.40\n\n错误版本',
      '# v1.1.3\n\n旧版本',
    ])
      assert.throws(() => releasePresentation(receipt, invalid), /发行说明/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
