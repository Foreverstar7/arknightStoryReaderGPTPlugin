import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPositionSaveQueue } from '../src/ui/position-save-queue.js';
import type { RecordInput } from '../src/shared/contracts.js';
import { deferred } from './helpers/deferred.js';

const position = (fraction: number): RecordInput => ({
  chapterId: 'fixture-mist/1',
  revision: 'fixture-v1',
  last: { blockId: 'first', fraction },
  atEnd: false,
});

for (const failFirst of [false, true]) {
  test(`navigation flush drains a later queued save after the first ${failFirst ? 'fails' : 'succeeds'}, without overlapping writes`, async () => {
    const first = deferred();
    const second = deferred();
    const startedFirst = deferred();
    const startedSecond = deferred();
    const calls: RecordInput[] = [];
    const flush = createPositionSaveQueue(async (input) => {
      calls.push(input);
      if (calls.length === 1) {
        startedFirst.resolve();
        await first.promise;
        if (failFirst) throw new Error('reported by ReaderApp');
      } else {
        startedSecond.resolve();
        await second.promise;
      }
    });
    const pending = flush(position(0.2));
    await startedFirst.promise;
    const duplicate = flush(position(0.2));
    let drained = false;
    const navigation = flush(null).then(() => {
      drained = true;
    });
    const later = flush(position(0.6));
    assert.equal(calls.length, 1);
    first.resolve();
    await startedSecond.promise;
    await Promise.resolve();
    assert.equal(
      drained,
      false,
      'clear/navigation must still await the newer save',
    );
    second.resolve();
    await Promise.all([pending, duplicate, navigation, later]);
    await flush(position(0.6));
    assert.deepEqual(calls, [position(0.2), position(0.6)]);
  });
}

test('a failed save remains retryable at the same position and null positions never create records', async () => {
  let calls = 0;
  const flush = createPositionSaveQueue(async () => {
    if (++calls === 1) throw new Error('reported save failure');
  });
  await flush(null);
  assert.equal(calls, 0);
  await flush(position(0.3));
  await flush(position(0.3));
  await flush(position(0.3));
  assert.equal(calls, 2);
});
