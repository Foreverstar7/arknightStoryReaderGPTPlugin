import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { z } from 'zod';
import { readingStateSchema } from '../src/shared/contracts.js';

function worker(root: string) {
  const child = fork(path.resolve('tests/helpers/cache-worker.ts'), [root], {
    execArgv: ['--import', 'tsx'],
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });
  const waiting = new Map<
    string,
    {
      started: () => void;
      resolve: (data: unknown) => void;
      reject: (error: Error) => void;
    }
  >();
  let counter = 0;
  let errors = '';
  child.stderr?.on('data', (data: Buffer) => {
    errors += data.toString();
  });
  child.on('message', (raw: unknown) => {
    const message = z
      .object({
        id: z.string(),
        event: z.enum(['started', 'result', 'error']),
        data: z.unknown().optional(),
        error: z.string().optional(),
      })
      .parse(raw);
    const pending = waiting.get(message.id);
    if (!pending) return;
    if (message.event === 'started') pending.started();
    else {
      waiting.delete(message.id);
      if (message.event === 'error') pending.reject(new Error(message.error));
      else pending.resolve(message.data);
    }
  });
  child.on('exit', () => {
    for (const pending of waiting.values())
      pending.reject(new Error(`worker exited: ${errors}`));
    waiting.clear();
  });
  return {
    diagnostics: () => errors,
    start(input: object) {
      const id = `${++counter}`;
      let started = () => {};
      const ready = new Promise<void>((resolve) => {
        started = resolve;
      });
      const result = new Promise<unknown>((resolve, reject) => {
        waiting.set(id, { started, resolve, reject });
      });
      child.send({ ...input, id });
      return { id, ready, result };
    },
    async close() {
      if (child.exitCode !== null) return;
      const exited = once(child, 'exit');
      child.disconnect();
      await exited;
    },
  };
}
const inspection = z.object({
  chapter: z.unknown(),
  image: z.unknown(),
  mapping: z.string().nullable(),
  state: readingStateSchema,
});

test(
  'independent processes fence late text/image downloads, permit fresh demand, retain mapping on image-only clears and keep scroll saves offline',
  { timeout: 60_000 },
  async () => {
    const base = path.resolve('.ai/local/test-data');
    await mkdir(base, { recursive: true });
    const root = await mkdtemp(path.join(base, 'cache-race-'));
    const first = worker(root);
    const second = worker(root);
    try {
      await first.start({ action: 'record' }).result;
      const before = inspection.parse(
        await second.start({ action: 'inspect' }).result,
      ).state;
      const text = first.start({ action: 'text', hold: true });
      await text.ready;
      await second.start({ action: 'clear', scope: 'all' }).result;
      await first.start({ action: 'release', target: text.id }).result;
      await text.result;
      let after = inspection.parse(
        await second.start({ action: 'inspect' }).result,
      );
      assert.equal(after.chapter, null);
      assert.deepEqual(after.state, before);
      await first.start({ action: 'record' }).result;
      assert.equal(
        inspection.parse(await second.start({ action: 'inspect' }).result)
          .chapter,
        null,
      );
      const image = first.start({ action: 'image', hold: true });
      await image.ready;
      await second.start({ action: 'clear', scope: 'images' }).result;
      await first.start({ action: 'release', target: image.id }).result;
      await image.result;
      after = inspection.parse(
        await second.start({ action: 'inspect' }).result,
      );
      assert.equal(after.image, null);
      assert.ok(after.mapping);
      assert.deepEqual(
        after.state.records['fixture-mist/1']?.last,
        before.records['fixture-mist/1']?.last,
      );
      // A new request on the same first process must not join its pre-clear promise.
      const held = first.start({ action: 'image', hold: true });
      await held.ready;
      await second.start({ action: 'clear', scope: 'images' }).result;
      await first.start({ action: 'image' }).result;
      await first.start({ action: 'release', target: held.id }).result;
      await held.result;
      assert.notEqual(
        inspection.parse(await second.start({ action: 'inspect' }).result)
          .image,
        null,
      );
      await Promise.all([
        first.start({ action: 'stress', scope: 'images', loops: 24 }).result,
        second.start({ action: 'stress', scope: 'all', loops: 24 }).result,
      ]);
      await second.start({ action: 'clear', scope: 'all' }).result;
      after = inspection.parse(await first.start({ action: 'inspect' }).result);
      assert.equal(after.chapter, null);
      assert.equal(after.mapping, null);
      assert.equal(after.image, null);
      assert.equal(
        after.state.records['fixture-mist/1']?.furthestWords,
        before.records['fixture-mist/1']?.furthestWords,
      );
    } finally {
      await Promise.all([first.close(), second.close()]);
      if (process.env.READER_CACHE_TRACE === '1')
        process.stderr.write(first.diagnostics() + second.diagnostics());
      await rm(root, { recursive: true, force: true });
    }
  },
);
