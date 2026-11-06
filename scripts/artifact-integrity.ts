import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// Integrity is the npm publication contract, not a general file-comparison check.
export function verifyTarball(bytes: Uint8Array, integrity: string) {
  assert.equal(
    'sha512-' + createHash('sha512').update(bytes).digest('base64'),
    integrity,
    '待发布归档与已验收的 npm integrity 不一致。',
  );
}
