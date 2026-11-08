import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  registeredPackage,
  waitForRegisteredPackage,
} from '../scripts/publication-registry.js';

const expected = {
  name: 'reader-fixture',
  version: '1.0.0',
  integrity: 'sha512-original',
};
const published = () =>
  new Response(
    JSON.stringify({
      name: expected.name,
      version: expected.version,
      dist: { integrity: expected.integrity },
    }),
  );

test('registry propagation can take four minutes without republishing the archive', async () => {
  let elapsed = 0;
  let reads = 0;
  const result = await waitForRegisteredPackage(expected, {
    now: () => elapsed,
    delay: async (milliseconds) => {
      elapsed += milliseconds;
    },
    fetchRegistry: async (_url, init) => {
      assert.equal(new Headers(init.headers).get('Cache-Control'), 'no-cache');
      reads++;
      return elapsed < 250_000
        ? new Response(null, { status: 404 })
        : published();
    },
  });
  assert.equal(result.dist.integrity, expected.integrity);
  assert.equal(elapsed, 250_000);
  assert.equal(reads, 26);
});

test('a published exact archive returns immediately; a conflicting archive aborts without polling', async () => {
  assert.ok(await registeredPackage(expected, async () => published()));
  let delayed = false;
  await assert.rejects(
    waitForRegisteredPackage(expected, {
      fetchRegistry: async () =>
        new Response(
          JSON.stringify({
            name: expected.name,
            version: expected.version,
            dist: { integrity: 'sha512-different' },
          }),
        ),
      delay: async () => {
        delayed = true;
      },
    }),
  );
  assert.equal(delayed, false);
});

test('non-404 registry errors are not mistaken for propagation', async () => {
  await assert.rejects(
    waitForRegisteredPackage(expected, {
      fetchRegistry: async () => new Response(null, { status: 403 }),
    }),
    /HTTP 403/u,
  );
  await assert.rejects(
    waitForRegisteredPackage(expected, {
      fetchRegistry: async () => new Response('broken JSON'),
    }),
  );
});

test('a missing version stops after a bounded wait without claiming publication', async () => {
  let elapsed = 0;
  await assert.rejects(
    waitForRegisteredPackage(expected, {
      now: () => elapsed,
      delay: async (milliseconds) => {
        elapsed += milliseconds;
      },
      fetchRegistry: async () => new Response(null, { status: 404 }),
    }),
    /20 分钟内仍未返回/u,
  );
  assert.equal(elapsed, 1_200_000);
});
