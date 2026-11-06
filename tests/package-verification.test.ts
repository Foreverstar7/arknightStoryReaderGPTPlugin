import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import {
  prepareOfflineNpmPackage,
  removeVerificationDirectory,
  VerificationConnection,
  withVerificationCleanup,
} from '../scripts/package-verification.js';
import { npmCommand } from '../scripts/npm-command.js';

async function temporaryDirectory() {
  const base = path.resolve('.ai/local/tests');
  await mkdir(base, { recursive: true });
  return mkdtemp(path.join(base, 'verification 阅读器 '));
}

test('fresh offline npm preparation installs the actual tgz without lifecycle scripts and the same cache executes its bin', async () => {
  const root = await mkdtemp(
    path.join(tmpdir(), 'reader npm preparation 阅读器 '),
  );
  try {
    const fixture = path.join(root, 'fixture');
    await mkdir(fixture);
    await writeFile(
      path.join(root, 'package.json'),
      JSON.stringify({ private: true }),
    );
    await writeFile(
      path.join(fixture, 'package.json'),
      JSON.stringify({
        name: 'reader-verification-install-fixture',
        version: '1.0.0',
        bin: { 'reader-verification-install-fixture': 'cli.cjs' },
        scripts: { preinstall: 'node -e "process.exit(99)"' },
      }),
    );
    await writeFile(
      path.join(fixture, 'cli.cjs'),
      '#!/usr/bin/env node\nconsole.log("fixture bin ready");\n',
    );
    await npmCommand(
      ['pack', '--ignore-scripts', '--pack-destination', root],
      fixture,
    );
    const archive = path.join(
      root,
      'reader-verification-install-fixture-1.0.0.tgz',
    );
    const cache = path.join(root, 'fresh-cache');
    await assert.rejects(stat(cache), { code: 'ENOENT' });
    const args = await prepareOfflineNpmPackage(archive, cache, root);
    assert.equal((await stat(path.join(cache, '_npx'))).isDirectory(), true);
    const entries = await readdir(path.join(cache, '_npx'));
    assert.equal(entries.length, 1);
    const entry = entries[0];
    assert.ok(entry);
    const marker = path.join(
      cache,
      '_npx',
      entry,
      'node_modules',
      'reader-verification-install-fixture',
      'prepared-marker',
    );
    await writeFile(marker, 'keep the prepared installation');
    const { stdout } = await npmCommand(
      [...args, 'reader-verification-install-fixture'],
      root,
    );
    assert.equal(stdout.trim(), 'fixture bin ready');
    assert.equal(
      await readFile(marker, 'utf8'),
      'keep the prepared installation',
    );
  } finally {
    await removeVerificationDirectory(root);
  }
});

test('verification retains the primary failure and attempts every cleanup even when closing fails', async () => {
  const primary = new Error('MCP initialize timed out');
  const close = new Error('client close failed');
  const removal = new Error('EBUSY');
  const order: string[] = [];
  await assert.rejects(
    withVerificationCleanup(async () => {
      throw primary;
    }, [
      async () => {
        order.push('close');
        throw close;
      },
      async () => {
        order.push('remove');
        throw removal;
      },
    ]),
    (error: unknown) => {
      assert.ok(error instanceof AggregateError);
      assert.equal(error.cause, primary);
      assert.deepEqual(error.errors, [primary, close, removal]);
      return true;
    },
  );
  assert.deepEqual(order, ['close', 'remove']);
});

test('cleanup failure prevents a successful verification result', async () => {
  const failure = new Error('sandbox remains locked');
  await assert.rejects(
    withVerificationCleanup(
      async () => 'passed',
      [
        async () => {
          throw failure;
        },
      ],
    ),
    (error: unknown) => error === failure,
  );
});

test('a timed-out MCP handshake closes the owned subprocess and removes its working directory', async () => {
  const root = await temporaryDirectory();
  const connection = new VerificationConnection();
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      '-e',
      "process.stdin.resume(); process.stdin.on('end', () => setTimeout(() => process.exit(0), 3000));",
    ],
    cwd: root,
  });
  try {
    await assert.rejects(
      withVerificationCleanup(
        () => connection.connect(transport, '1.0.0', { timeout: 300 }),
        [() => connection.close(), () => removeVerificationDirectory(root)],
      ),
      /timed out/iu,
    );
    assert.equal(transport.pid, null);
    await assert.rejects(stat(root), { code: 'ENOENT' });
  } finally {
    await connection.close();
    await removeVerificationDirectory(root);
  }
});

for (const transient of [true, false]) {
  test(
    `Windows sandbox removal ${transient ? 'waits for a transient cwd lock' : 'reports a persistent cwd lock'}`,
    { skip: process.platform !== 'win32' },
    async () => {
      const root = await temporaryDirectory();
      const child = spawn(
        process.execPath,
        [
          '-e',
          "process.on('message', () => process.exit(0)); process.send('ready');",
        ],
        {
          cwd: root,
          stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
          windowsHide: true,
        },
      );
      const closed = once(child, 'close');
      let release: NodeJS.Timeout | undefined;
      try {
        await once(child, 'message');
        await assert.rejects(rm(root, { recursive: true }), { code: 'EBUSY' });
        if (transient) {
          release = setTimeout(() => child.send('exit'), 250);
          await removeVerificationDirectory(root);
          await assert.rejects(stat(root), { code: 'ENOENT' });
        } else {
          await assert.rejects(removeVerificationDirectory(root), {
            code: 'EBUSY',
          });
        }
      } finally {
        if (release) clearTimeout(release);
        child.kill();
        await closed;
        await removeVerificationDirectory(root);
      }
    },
  );
}
