import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { z } from 'zod';

test('shared image regression samples retain portrait causes and each supported composition form', async () => {
  const samples = z
    .object({
      failures: z
        .array(
          z.object({ reference: z.string().min(1), cause: z.string().min(1) }),
        )
        .nonempty(),
      cgOmissions: z.object({
        occurrenceList: z
          .array(
            z.object({
              chapterId: z.string().startsWith('prts:'),
              reference: z.string().min(1),
              command: z.string().min(1),
            }),
          )
          .nonempty(),
      }),
    })
    .parse(
      JSON.parse(
        await readFile('tests/fixtures/prts-image-baseline.json', 'utf8'),
      ),
    );
  const forms = new Set(
    samples.cgOmissions.occurrenceList.map((x) => x.command),
  );
  for (const form of ['cgitem', 'largebg', 'verticalbg'])
    assert.ok(forms.has(form));
  assert.equal(
    new Set(samples.failures.map((x) => x.reference)).size,
    samples.failures.length,
  );
});
