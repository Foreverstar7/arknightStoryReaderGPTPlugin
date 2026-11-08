import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash as nativeHash } from 'node:crypto';
import { createHash as browserHash } from '../web/crypto.js';
test('browser hash adapter preserves desktop UTF-8 SHA-256 anchors without replacing desktop crypto', () => {
  for (const value of [
    '',
    '原创剧情测试',
    '👩🏽‍💻\n分支\u0301',
    'a'.repeat(200000),
  ]) {
    assert.equal(
      browserHash('sha256').update(value).digest('hex'),
      nativeHash('sha256').update(value).digest('hex'),
    );
  }
  assert.throws(() => browserHash('md5'), /Unsupported/);
});
