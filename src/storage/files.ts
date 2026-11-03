import { chapterSchema, type Chapter } from '../shared/contracts.js';
import { JsonCache } from './json-cache.js';

export class ContentCache {
  private readonly json: JsonCache;
  constructor(root: string, now = Date.now) {
    this.json = new JsonCache(root, 'text', now);
  }
  get(id: string, days: number): Promise<Chapter | null> {
    return this.json.get(id, chapterSchema, days);
  }
  put(chapter: Chapter): Promise<void> {
    return this.json.put(chapter.id, chapter);
  }
  clear(): Promise<void> {
    return this.json.clear();
  }
  expire(days: number): Promise<void> {
    return this.json.expire(days);
  }
}
