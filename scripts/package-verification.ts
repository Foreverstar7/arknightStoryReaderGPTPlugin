import assert from 'node:assert/strict';
import { readFile, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { z } from 'zod';
import { npmCommand } from './npm-command.js';

export async function prepareOfflineNpmPackage(
  tarball: string,
  cache: string,
  directory: string,
  identity: { name: string; version: string },
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
  // npm exec exposes the requested package's bin directory through PATH. Resolve
  // package.json from those search paths without importing application code.
  const probe = [
    "const path = require('node:path');",
    "const paths = (process.env.PATH ?? '').split(path.delimiter);",
    "const packageJson = require.resolve(process.argv[1] + '/package.json', { paths });",
    'console.log(JSON.stringify({ node: process.version, packageJson }));',
  ].join(' ');
  const { stdout } = await npmCommand(
    [...args, process.execPath, '-e', probe, identity.name],
    directory,
  );
  const prepared = z
    .object({
      node: z.literal(process.version),
      packageJson: z.string().min(1),
    })
    .parse(JSON.parse(stdout));
  const packageRoot = await realpath(path.dirname(prepared.packageJson));
  const cacheRoot = await realpath(cache);
  const relative = path.relative(cacheRoot, packageRoot);
  assert.ok(
    relative &&
      !path.isAbsolute(relative) &&
      relative !== '..' &&
      !relative.startsWith(`..${path.sep}`),
    'npm selected a package outside the isolated cache.',
  );
  const manifest = z
    .object({
      name: z.literal(identity.name),
      version: z.literal(identity.version),
      bin: z.record(z.string(), z.string()),
    })
    .parse(
      JSON.parse(
        await readFile(path.join(packageRoot, 'package.json'), 'utf8'),
      ),
    );
  return { args, root: packageRoot, bin: manifest.bin };
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
