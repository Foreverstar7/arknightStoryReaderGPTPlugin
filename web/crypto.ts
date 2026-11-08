import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

/** Build-only adapter for the two synchronous SHA-256 consumers in shared src/.
 * No Node crypto import or desktop source replacement ships in the web bundle. */
export function createHash(algorithm: string) {
  if (algorithm !== 'sha256')
    throw new Error('Unsupported browser hash algorithm');
  const hash = sha256.create();
  return {
    update(value: string) {
      hash.update(new TextEncoder().encode(value));
      return this;
    },
    digest(encoding: string) {
      if (encoding !== 'hex')
        throw new Error('Unsupported browser hash encoding');
      return bytesToHex(hash.digest());
    },
  };
}
