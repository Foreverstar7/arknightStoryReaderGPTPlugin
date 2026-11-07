import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import {
  planRelease,
  publishedEvent,
  verifyArchive,
  verifyFrozenTag,
  verifyReceipt,
  versionFromTag,
  type ReleaseReceipt,
} from '../scripts/release-artifact.js';
import { saveDraft } from '../scripts/draft-assets.js';
import {
  githubReleases,
  type GithubRelease,
  type ReleaseStore,
} from '../scripts/github-release.js';
import type { ReleaseGit } from '../scripts/release-git.js';

const receipt: ReleaseReceipt = {
  package: 'reader',
  version: '1.2.3',
  filename: 'reader-1.2.3.tgz',
  sourceCommit: 'a'.repeat(40),
  integrity: `sha512-${createHash('sha512').update('original').digest('base64')}`,
  dirty: false,
  ciRun: '123',
};
const planInput = {
  name: 'reader',
  version: '1.2.3',
  head: 'b'.repeat(40),
  run: '456',
  tag: null,
  release: null,
  registered: false,
};

test('a version is built once; ordinary and generated-catalog commits do not recreate a draft', () => {
  assert.equal(planRelease(planInput).mode, 'build');
  for (const draft of [true, false]) {
    const plan = planRelease({
      ...planInput,
      tag: { commit: receipt.sourceCommit, message: 'legacy tag' },
      release: {
        draft,
        assets: ['reader-1.2.3.tgz', 'release.json', 'verification-prts.json'],
      },
    });
    assert.equal(plan.mode, 'skip');
    assert.equal(plan.source, receipt.sourceCommit);
  }
  assert.equal(planRelease({ ...planInput, registered: true }).mode, 'skip');
});

test('interrupted drafts reuse the original accepted run, including a retry before tag creation', () => {
  assert.deepEqual(
    planRelease({
      ...planInput,
      tag: { commit: receipt.sourceCommit, message: JSON.stringify(receipt) },
      release: { draft: true, assets: ['reader-1.2.3.tgz'] },
    }),
    {
      mode: 'resume',
      version: '1.2.3',
      source: receipt.sourceCommit,
      run: '123',
    },
  );
  assert.equal(
    planRelease({ ...planInput, acceptedRun: '456' }).mode,
    'resume',
  );
  assert.throws(() =>
    planRelease({
      ...planInput,
      tag: { commit: 'c'.repeat(40), message: JSON.stringify(receipt) },
    }),
  );
  assert.throws(() =>
    planRelease({ ...planInput, release: { draft: true, assets: [] } }),
  );
});

test('only published formal releases and matching clean receipts are accepted', () => {
  const event = {
    action: 'published',
    release: { id: 1, tag_name: 'v1.2.3', draft: false, prerelease: false },
  };
  assert.equal(publishedEvent.parse(event).action, 'published');
  for (const bad of [
    { ...event, action: 'created' },
    { ...event, release: { ...event.release, prerelease: true } },
    { ...event, release: { ...event.release, draft: true } },
  ])
    assert.throws(() => publishedEvent.parse(bad));
  for (const tag of [
    '1.2.3',
    'v1.2.3-beta.1',
    'v1.2',
    'v1.2.3/../../',
    'v1.2.3\n',
  ])
    assert.throws(() => versionFromTag(tag));
  const expected = {
    name: 'reader',
    version: '1.2.3',
    sourceCommit: receipt.sourceCommit,
  };
  for (const change of [
    { dirty: true },
    { version: '1.2.4' },
    { package: 'other' },
    { sourceCommit: 'b'.repeat(40) },
    { filename: '../reader.tgz' },
  ])
    assert.throws(() => verifyReceipt({ ...receipt, ...change }, expected));
  assert.equal(
    verifyFrozenTag(
      { commit: receipt.sourceCommit, message: 'legacy 1.0.0' },
      receipt,
    ),
    false,
  );
  assert.equal(
    verifyFrozenTag(
      { commit: receipt.sourceCommit, message: JSON.stringify(receipt) },
      receipt,
    ),
    true,
  );
  assert.throws(() =>
    verifyFrozenTag(
      {
        commit: receipt.sourceCommit,
        message: JSON.stringify({ ...receipt, ciRun: '999' }),
      },
      receipt,
    ),
  );
});

async function fixture() {
  const base = path.resolve('.ai/local/tests');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, 'release-'));
  await mkdir(path.join(root, 'package'));
  for (const file of ['package.json', 'plugin.json'])
    await writeFile(
      path.join(root, 'package', file),
      JSON.stringify({ name: 'reader', version: '1.2.3' }),
    );
  await promisify(execFile)('tar', ['-czf', receipt.filename, 'package'], {
    cwd: root,
  });
  const bytes = await readFile(path.join(root, receipt.filename));
  const accepted = {
    ...receipt,
    integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
  };
  await writeFile(path.join(root, 'release.json'), JSON.stringify(accepted));
  await writeFile(
    path.join(root, 'verification-prts.json'),
    JSON.stringify({
      package: 'reader',
      version: '1.2.3',
      source: 'prts',
      offlineProtocol: true,
      productionTreeComplete: true,
    }),
  );
  return { root, accepted };
}

test('the actual archive must match both integrity and its embedded package/plugin identity', async () => {
  const { root, accepted } = await fixture();
  try {
    await verifyArchive(root, accepted);
    await writeFile(
      path.join(root, 'package/plugin.json'),
      JSON.stringify({ name: 'reader', version: '1.2.4' }),
    );
    await promisify(execFile)('tar', ['-czf', receipt.filename, 'package'], {
      cwd: root,
    });
    const altered = await readFile(path.join(root, receipt.filename));
    await assert.rejects(verifyArchive(root, accepted), /integrity/u);
    await assert.rejects(
      verifyArchive(root, {
        ...accepted,
        integrity: `sha512-${createHash('sha512').update(altered).digest('base64')}`,
      }),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('partial draft uploads resume without moving tags or replacing already accepted assets', async () => {
  const { root, accepted } = await fixture();
  try {
    let frozen: { commit: string; message: string } | null = null;
    let release: GithubRelease | null = null;
    let tags = 0;
    let creates = 0;
    let failUpload = true;
    const uploaded = new Map<number, Buffer>();
    const store: ReleaseStore = {
      hasArtifact: async () => true,
      find: async () => release,
      get: async () => {
        if (!release) throw new Error('no release');
        return release;
      },
      create: async () => {
        creates++;
        release = {
          id: 1,
          tag_name: 'v1.2.3',
          draft: true,
          prerelease: false,
          html_url: 'https://github.com/fixture/reader/releases/tag/v1.2.3',
          assets: [],
        };
        return release;
      },
      download: async (asset) => {
        const bytes = uploaded.get(asset.id);
        if (!bytes) throw new Error('missing asset');
        return Buffer.from(bytes);
      },
      upload: async (_id, name, bytes) => {
        if (name === 'release.json' && failUpload)
          throw new Error('interrupted upload');
        if (!release) throw new Error('no release');
        const asset = { id: uploaded.size + 1, name, state: 'uploaded' };
        uploaded.set(asset.id, Buffer.from(bytes));
        release.assets.push(asset);
        return asset;
      },
    };
    const git: ReleaseGit = {
      head: async () => 'b'.repeat(40),
      identity: async () => ({ name: 'reader', version: '1.2.3' }),
      tag: async () => frozen,
      createTag: async (_tag, value) => {
        tags++;
        frozen = { commit: value.sourceCommit, message: JSON.stringify(value) };
      },
    };
    await assert.rejects(saveDraft(store, git, accepted, root), /interrupted/u);
    failUpload = false;
    await saveDraft(store, git, accepted, root);
    await saveDraft(store, git, accepted, root);
    assert.equal(tags, 1);
    assert.equal(creates, 1);
    assert.equal(uploaded.size, 3);
    uploaded.set(1, Buffer.from('substituted'));
    await assert.rejects(saveDraft(store, git, accepted, root), /内容不一致/u);
    assert.equal(uploaded.size, 3);
    frozen = { commit: 'c'.repeat(40), message: JSON.stringify(accepted) };
    await assert.rejects(saveDraft(store, git, accepted, root), /不移动标签/u);
    assert.equal(tags, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('GitHub draft discovery includes drafts and fails closed on permission errors', async () => {
  const calls: string[] = [];
  const store = githubReleases(
    'fixture/reader',
    'fixture-token',
    async (input) => {
      calls.push(String(input));
      return new Response(
        JSON.stringify([
          {
            id: 1,
            tag_name: 'v1.2.3',
            draft: true,
            prerelease: false,
            html_url: 'https://github.com/fixture/reader/releases/tag/v1.2.3',
            assets: [],
          },
        ]),
      );
    },
  );
  assert.equal((await store.find('v1.2.3'))?.draft, true);
  assert.ok(calls.every((url) => !url.includes('/releases/tags/')));
  await assert.rejects(
    githubReleases(
      'fixture/reader',
      'fixture-token',
      async () => new Response(null, { status: 403 }),
    ).find('v1.2.3'),
    /HTTP 403/u,
  );
});
