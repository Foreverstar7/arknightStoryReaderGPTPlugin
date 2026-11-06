import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { npmCommand } from './npm-command.js';

export async function prepareOfflineNpmPackage(
  tarball: string,
  cache: string,
  directory: string,
) {
  const args = [
    'exec',
    '--yes',
    '--offline',
    '--ignore-scripts',
    '--cache',
    cache,
    '--package',
    tarball,
    '--',
  ];
  // npm installs the requested tgz into its fresh, isolated cache before running
  // this harmless command. Installation uses npmCommand's existing 120 s limit;
  // the later MCP handshake retains the SDK's 60 s limit.
  const { stdout } = await npmCommand(
    [...args, process.execPath, '--version'],
    directory,
  );
  assert.equal(stdout.trim(), process.version);
  return args;
}

export async function verificationStep<T>(
  name: string,
  action: () => Promise<T>,
): Promise<T> {
  const started = performance.now();
  console.error(`[package:verify] ${name}: start`);
  try {
    const result = await action();
    console.error(
      `[package:verify] ${name}: passed (${Math.round(performance.now() - started)} ms)`,
    );
    return result;
  } catch (cause) {
    throw new Error(
      `[package:verify] ${name}: failed (${Math.round(performance.now() - started)} ms)`,
      { cause },
    );
  }
}

export async function withVerificationCleanup<T>(
  action: () => Promise<T>,
  cleanups: readonly (() => Promise<unknown>)[],
): Promise<T> {
  let failed = false;
  let primaryError: unknown;
  try {
    return await action();
  } catch (error) {
    failed = true;
    primaryError = error;
    throw error;
  } finally {
    const errors: unknown[] = [];
    for (const cleanup of cleanups) {
      try {
        await cleanup();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) {
      if (failed)
        throw new AggregateError(
          [primaryError, ...errors],
          'Package verification failed; cleanup also failed (first error is the verification failure).',
          { cause: primaryError },
        );
      if (errors.length === 1) throw errors[0];
      throw new AggregateError(errors, 'Package verification cleanup failed.');
    }
  }
}

export class VerificationConnection {
  private client: Client | undefined;
  private transport: StdioClientTransport | undefined;
  private processClosed: Promise<void> | undefined;

  async connect(
    transport: StdioClientTransport,
    version: string,
    options?: Parameters<Client['connect']>[1],
  ) {
    assert.equal(
      this.client,
      undefined,
      'Close the previous connection first.',
    );
    const client = new Client({ name: 'npm-package-acceptance', version: '1' });
    // Own the connection before initialization: a timeout must still be closed.
    this.client = client;
    this.transport = transport;
    this.processClosed = new Promise<void>((resolve) => {
      const previous = transport.onclose;
      transport.onclose = () => {
        resolve();
        previous?.();
      };
    });
    await client.connect(transport, options);
    assert.equal(client.getServerVersion()?.version, version);
    return client;
  }

  async close() {
    await withVerificationCleanup(
      async () => this.client?.close(),
      // The SDK may detach a failed transport from the client during connect.
      [
        async () => this.transport?.close(),
        async () => {
          if (!this.processClosed) return;
          // A failed SDK handshake starts close without awaiting it. A second
          // close can resolve while its child still holds cwd. Await onclose;
          // 5 s covers the SDK's two 2 s grace periods plus process-exit delivery.
          let timer: NodeJS.Timeout | undefined;
          try {
            await Promise.race([
              this.processClosed,
              new Promise<never>((_resolve, reject) => {
                timer = setTimeout(
                  () =>
                    reject(
                      new Error(
                        'MCP subprocess did not close within 5 seconds.',
                      ),
                    ),
                  5_000,
                );
              }),
            ]);
          } finally {
            clearTimeout(timer);
          }
        },
      ],
    );
    this.client = undefined;
    this.transport = undefined;
    this.processClosed = undefined;
  }
}

export async function removeVerificationDirectory(directory: string) {
  // Windows can briefly retain cwd/file handles after a subprocess exits.
  // Use Node's bounded retry (1.5 s total backoff); persistent locks still fail.
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}
