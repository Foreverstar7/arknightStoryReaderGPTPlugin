import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ensureLatest,
  publishAcceptedArchive,
} from '../scripts/npm-publication.js';

const expected = {
  name: '@fixture/reader',
  version: '1.0.0',
  integrity: 'sha512-accepted',
};

test('published matching versions resume completion without another upload; conflicting versions abort', async () => {
  let uploads = 0;
  let tagWrites = 0;
  await publishAcceptedArchive(expected, {
    fetchRegistry: async () => publication(),
    publishArchive: async () => {
      uploads++;
    },
    updateLatest: async () => {
      tagWrites++;
    },
  });
  assert.equal(uploads, 0);
  assert.equal(tagWrites, 0);
  await assert.rejects(
    publishAcceptedArchive(expected, {
      fetchRegistry: async () =>
        publication(expected.version, 'sha512-conflict'),
      publishArchive: async () => {
        uploads++;
      },
      updateLatest: async () => {
        tagWrites++;
      },
    }),
  );
  assert.equal(uploads, 0);
  assert.equal(tagWrites, 0);
});

test('a new archive is uploaded once and confirmed before latest is checked', async () => {
  let uploaded = false;
  await publishAcceptedArchive(expected, {
    fetchRegistry: async () =>
      uploaded ? publication() : new Response(null, { status: 404 }),
    publishArchive: async () => {
      assert.equal(uploaded, false);
      uploaded = true;
    },
    updateLatest: async () => {
      assert.fail('publish --tag latest already selected the accepted version');
    },
  });
  assert.equal(uploaded, true);
});

test('legacy tags can migrate existing packages but can never upload a missing npm version', async () => {
  await assert.rejects(
    publishAcceptedArchive(expected, {
      allowPublish: false,
      fetchRegistry: async () => new Response(null, { status: 404 }),
      publishArchive: async () => {
        assert.fail('legacy migration must not republish');
      },
      updateLatest: async () => {
        assert.fail('no package exists');
      },
    }),
    /不重新发布/u,
  );
  let updated = false;
  await publishAcceptedArchive(expected, {
    allowPublish: false,
    fetchRegistry: async (input) =>
      String(input).endsWith('/latest') && !updated
        ? publication('0.1.26', 'sha512-old')
        : publication(),
    publishArchive: async () => {
      assert.fail('legacy package already exists');
    },
    updateLatest: async () => {
      updated = true;
    },
  });
  assert.equal(updated, true);
});
function publication(
  version = expected.version,
  integrity = expected.integrity,
) {
  return new Response(
    JSON.stringify({ name: expected.name, version, dist: { integrity } }),
  );
}

test('missing or substituted exact packages never change the stable tag', async () => {
  for (const response of [
    () => new Response(null, { status: 404 }),
    () => publication(expected.version, 'sha512-substituted'),
  ]) {
    let updates = 0;
    await assert.rejects(
      ensureLatest(expected, {
        fetchRegistry: async () => response(),
        updateLatest: async () => {
          updates++;
        },
      }),
    );
    assert.equal(updates, 0);
  }
});

test('rerunning promotion with matching latest only verifies and needs no tag write', async () => {
  let updates = 0;
  await ensureLatest(expected, {
    fetchRegistry: async () => publication(),
    updateLatest: async () => {
      updates++;
    },
  });
  assert.equal(updates, 0);
});

test('promotion writes once and waits through a missing or old latest readback', async () => {
  let elapsed = 0;
  let updates = 0;
  await ensureLatest(expected, {
    fetchRegistry: async (input, init) => {
      assert.equal(new Headers(init?.headers).get('Cache-Control'), 'no-cache');
      if (String(input).endsWith('/1.0.0')) return publication();
      assert.equal(
        String(input),
        'https://registry.npmjs.org/%40fixture%2Freader/latest',
      );
      if (!updates) return publication('0.1.26', 'sha512-previous');
      if (elapsed < 10_000) return new Response(null, { status: 404 });
      return elapsed < 40_000
        ? publication('0.1.26', 'sha512-previous')
        : publication();
    },
    updateLatest: async () => {
      updates++;
    },
    now: () => elapsed,
    delay: async (milliseconds) => {
      elapsed += milliseconds;
    },
  });
  assert.equal(updates, 1);
  assert.equal(elapsed, 40_000);
});

test('the same version with conflicting latest integrity aborts before or after a tag write', async () => {
  for (const failBeforeWrite of [true, false]) {
    let updates = 0;
    let delays = 0;
    await assert.rejects(
      ensureLatest(expected, {
        fetchRegistry: async (input) => {
          if (String(input).endsWith('/1.0.0')) return publication();
          return failBeforeWrite || updates
            ? publication(expected.version, 'sha512-substituted')
            : publication('0.1.26', 'sha512-previous');
        },
        updateLatest: async () => {
          updates++;
        },
        delay: async () => {
          delays++;
        },
      }),
    );
    assert.equal(updates, failBeforeWrite ? 0 : 1);
    assert.equal(delays, 0);
  }
});

test('permission errors and malformed registry responses fail without repeating writes', async () => {
  let updates = 0;
  await assert.rejects(
    ensureLatest(expected, {
      fetchRegistry: async (input) =>
        String(input).endsWith('/1.0.0')
          ? publication()
          : publication('0.1.26', 'sha512-previous'),
      updateLatest: async () => {
        updates++;
        throw new Error('OIDC cannot manage dist-tags');
      },
    }),
    /OIDC/u,
  );
  assert.equal(updates, 1);
  for (const response of [
    () => new Response(null, { status: 403 }),
    () => new Response('malformed JSON'),
  ]) {
    await assert.rejects(
      ensureLatest(expected, {
        fetchRegistry: async (input) =>
          String(input).endsWith('/1.0.0') ? publication() : response(),
        updateLatest: async () => {
          assert.fail('invalid registry state must not update latest');
        },
      }),
    );
  }
});

test('unconfirmed tag propagation stops within five minutes after one write', async () => {
  let elapsed = 0;
  let updates = 0;
  await assert.rejects(
    ensureLatest(expected, {
      fetchRegistry: async (input) =>
        String(input).endsWith('/1.0.0')
          ? publication()
          : publication('0.1.26', 'sha512-previous'),
      updateLatest: async () => {
        updates++;
      },
      now: () => elapsed,
      delay: async (milliseconds) => {
        elapsed += milliseconds;
      },
    }),
    /5 分钟内未确认/u,
  );
  assert.equal(updates, 1);
  assert.equal(elapsed, 300_000);
});
