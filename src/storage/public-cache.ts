import { JsonCache } from './json-cache.js';

export class PublicCache extends JsonCache {
  constructor(
    root: string,
    kind: 'mapping' | 'metadata' | 'images',
    now = Date.now,
  ) {
    super(root, kind, now);
  }
}
