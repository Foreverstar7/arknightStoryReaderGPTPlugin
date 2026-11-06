import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import {
  removeVerificationDirectory,
  VerificationConnection,
  withVerificationCleanup,
} from '../scripts/package-verification.js';

async function temporaryDirectory() {
  const base = path.resolve('.ai/local/tests');
  await mkdir(base, { recursive: true });
  return mkdtemp(path.join(base, 'verification 阅读器 '));
}

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
