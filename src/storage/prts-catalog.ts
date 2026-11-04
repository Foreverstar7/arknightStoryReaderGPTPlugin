import { z } from 'zod';
import { JsonCache } from './json-cache.js';

const catalogSchema = z.object({
  rootWiki: z.string(),
  navigationWiki: z.string(),
});
type CatalogText = z.infer<typeof catalogSchema>;

export class PrtsCatalogCache {
  private readonly json: JsonCache;
  constructor(root: string, now = Date.now) {
    this.json = new JsonCache(root, 'prts', now);
  }
  run<T>(operation: () => Promise<T>): Promise<T> {
    return this.json.run(operation);
  }
  requestKey(): string {
    return this.json.requestKey();
  }
  assertCurrent(): void {
    this.json.assertCurrent();
  }
  get(days: number): Promise<CatalogText | null> {
    return this.json.get('catalog', catalogSchema, days);
  }
  put(value: CatalogText): Promise<void> {
    return this.json.put('catalog', value);
  }
  clear(): Promise<void> {
    return this.json.clear();
  }
}
