import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  WALK_CONTENT_DURATION,
  WALK_HOLDS,
  WALK_SCROLL_SVH,
  walkthroughFrame,
} from '../website/walkthrough-timing.js';

test('scrolling through a stop holds the exact pose, then resumes from that pose in either direction', () => {
  for (const hold of WALK_HOLDS) {
    const early = walkthroughFrame(hold.start + hold.span * 0.1);
    const late = walkthroughFrame(hold.end - hold.span * 0.1);
    assert.deepEqual(early, late);
    assert.equal(early.hold, hold.id);
    assert.ok(walkthroughFrame(hold.start - 0.1).time < early.time);
    assert.ok(walkthroughFrame(hold.end + 0.1).time > late.time);
    assert.equal(walkthroughFrame(hold.end + 0.1).hold, null);
  }
});

test('large jumps, reverse scrolling and out-of-range positions preserve the same bounded ordered timeline', () => {
  const forward = Array.from({ length: 1001 }, (_, index) =>
    walkthroughFrame((index / 1000) * WALK_SCROLL_SVH),
  );
  for (let index = 1; index < forward.length; index++) {
    const previous = forward[index - 1];
    const current = forward[index];
    assert.ok(previous && current && current.time >= previous.time);
  }
  for (let index = 1000; index >= 0; index--)
    assert.deepEqual(
      walkthroughFrame((index / 1000) * WALK_SCROLL_SVH),
      forward[index],
    );
  assert.equal(walkthroughFrame(-100).time, 0);
  assert.equal(walkthroughFrame(Number.NaN).time, 0);
  assert.equal(
    walkthroughFrame(WALK_SCROLL_SVH + 100).time,
    WALK_CONTENT_DURATION,
  );
});
