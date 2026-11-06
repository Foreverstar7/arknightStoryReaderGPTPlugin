import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { checkVersions, setVersion } from '../scripts/release-version.js';
import { stableMarketplace } from '../scripts/marketplace.js';
import { hostOptions } from '../scripts/host-options.js';
import { packResultSchema } from '../scripts/package-layout.js';

test('one version command updates every declaration and leaves accepted marketplace unchanged', async () => {
  const base = path.resolve('.ai/local/tests');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, 'versions-'));
  try {
    await mkdir(path.join(root, 'src/shared'), { recursive: true });
    for (const file of ['package.json', 'plugin.json'])
      await writeFile(
        path.join(root, file),
        JSON.stringify({ name: 'reader', version: '1.0.0', keep: 'original' }),
      );
    await writeFile(
      path.join(root, 'package-lock.json'),
      JSON.stringify({
        name: 'reader',
        version: '1.0.0',
        packages: {
          '': { name: 'reader', version: '1.0.0' },
          'node_modules/dep': { version: '3.0.0' },
        },
      }),
    );
    await writeFile(
      path.join(root, 'src/shared/version.ts'),
      "export const VERSION = '1.0.0';\n",
    );
    await writeFile(path.join(root, 'marketplace.json'), 'accepted: 1.0.0');
    await checkVersions(root);
    await assert.rejects(setVersion(root, '^2.0.0'));
    assert.equal((await checkVersions(root)).version, '1.0.0');
    await setVersion(root, '1.0.1');
    assert.equal((await checkVersions(root)).version, '1.0.1');
    assert.equal(
      await readFile(path.join(root, 'marketplace.json'), 'utf8'),
      'accepted: 1.0.0',
    );
    assert.match(
      await readFile(path.join(root, 'package.json'), 'utf8'),
      /"keep": "original"/u,
    );
    assert.match(
      await readFile(path.join(root, 'package-lock.json'), 'utf8'),
      /"version": "3.0.0"/u,
    );
    await writeFile(
      path.join(root, 'plugin.json'),
      JSON.stringify({ name: 'reader', version: '1.0.2' }),
    );
    await assert.rejects(checkVersions(root), /版本/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('stable marketplace uses an exact npm version and stays separate from dev source', () => {
  const catalog = stableMarketplace('@account/reader', '1.2.3');
  assert.equal(catalog.name, 'arknights-reader');
  assert.deepEqual(catalog.plugins[0]?.source, {
    source: 'npm',
    package: '@account/reader',
    version: '1.2.3',
    registry: 'https://registry.npmjs.org',
  });
  for (const version of [
    'latest',
    'next',
    '^1.2.3',
    'file:package.tgz',
    '1.2.3-beta.1',
  ])
    assert.throws(() => stableMarketplace('reader', version));
});

test('host probe derives identity from any selected marketplace, not hardcoded dev ID', async () => {
  const base = path.resolve('.ai/local/tests');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, 'host options 阅读器 '));
  try {
    await mkdir(path.join(root, '.agents/plugins'), { recursive: true });
    const catalog = path.join(root, '.agents/plugins/marketplace.json');
    await writeFile(
      catalog,
      JSON.stringify(stableMarketplace('reader', '1.2.3')),
    );
    for (const marketplace of [root, catalog]) {
      const options = await hostOptions(
        ['--marketplace', marketplace, '--isolated'],
        process.cwd(),
      );
      assert.equal(options.pluginId, 'arknights-story-reader@arknights-reader');
      assert.equal(options.marketplaceRoot, root);
      assert.equal(options.isolated, true);
    }
    await assert.rejects(
      hostOptions(['--marketplace', root, '--plugin', 'absent'], process.cwd()),
      /没有指定插件/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('pack reader validates the fixed npm 12 named-result contract', () => {
  const result = {
    name: 'reader',
    version: '1.2.3',
    filename: 'reader-1.2.3.tgz',
    size: 1,
    unpackedSize: 2,
    integrity: 'sha512-example',
    bundled: ['zod'],
    files: [{ path: 'package.json', size: 1 }],
  };
  assert.equal(
    packResultSchema.parse({ reader: result }).reader?.version,
    '1.2.3',
  );
  assert.throws(() => packResultSchema.parse([result]));
  assert.throws(() => packResultSchema.parse({}));
  assert.throws(() =>
    packResultSchema.parse({ reader: { ...result, bundled: undefined } }),
  );
});

test('publication rejects a substituted archive even if its filename is unchanged', async () => {
  const { verifyTarball } = await import('../scripts/artifact-integrity.js');
  // Standard SHA-512 test vector for abc.
  const integrity =
    'sha512-3a81oZNherrMQXNJriBBMRLm+k6JqX6iCp7u5ktV05ohkpkqJ0/BqDa6PCOj/uu9RU1EI2Q86A4qmslPpUyknw==';
  verifyTarball(Buffer.from('abc'), integrity);
  assert.throws(
    () => verifyTarball(Buffer.from('substituted'), integrity),
    /integrity/u,
  );
});
