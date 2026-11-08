import type { z } from 'zod';
import type { ChapterCount } from '../src/shared/contracts.js';
import { ReaderError } from '../src/shared/errors.js';
import { BrowserDatabase, type StoredState } from './database.js';

// These scopes match the unmodified desktop adapters, selected only by the web build.
export const cacheScopes = [
  'text',
  'prts',
  'metadata',
  'mapping',
  'images',
] as const;
export type CacheScope = (typeof cacheScopes)[number];
type Epochs = Record<CacheScope, number>;
type Entry = { json: string; lastUsed: number };
type Runtime = {
  database: BrowserDatabase;
  epochs: Epochs;
  active: Set<Epochs>;
  entries: Map<CacheScope, Map<string, Entry>>;
};
const runtimes = new Map<string, Runtime>();
function runtime(root: string): Runtime {
  let state = runtimes.get(root);
  if (!state) {
    state = {
      database: new BrowserDatabase(root),
      epochs: { text: 0, prts: 0, metadata: 0, mapping: 0, images: 0 },
      active: new Set(),
      entries: new Map(),
    };
    runtimes.set(root, state);
  }
  return state;
}
export class ReadingStore {
  private readonly db: BrowserDatabase;
  constructor(root: string) {
    this.db = runtime(root).database;
  }
  read(): Promise<StoredState> {
    return this.db.state();
  }
  change(update: (state: StoredState) => StoredState): Promise<StoredState> {
    return this.db.state(update);
  }
}
export class WordCountStore {
  private readonly db: BrowserDatabase;
  constructor(root: string) {
    this.db = runtime(root).database;
  }
  all() {
    return this.db.counts();
  }
  put(
    count: Omit<ChapterCount, 'verifiedAt'>,
    expectedRevision: string | undefined,
  ) {
    return this.db.count(count, expectedRevision);
  }
}
export class CacheCoordinator {
  private readonly state: Runtime;
  constructor(root: string) {
    this.state = runtime(root);
  }
  async run<T>(operation: () => Promise<T>): Promise<T> {
    const epochs = { ...this.state.epochs };
    this.state.active.add(epochs);
    try {
      const result = await operation();
      for (const scope of cacheScopes)
        if (epochs[scope] !== this.state.epochs[scope]) this.conflict();
      return result;
    } finally {
      this.state.active.delete(epochs);
    }
  }
  private conflict(): never {
    throw new ReaderError(
      'conflict',
      '本次打开的临时内容已释放，请重新打开所需篇目。',
    );
  }
  requestKey(scope: CacheScope): string {
    return String(this.state.epochs[scope]);
  }
  assertCurrent(scope: CacheScope): void {
    // Browsers have no AsyncLocalStorage. Conservatively reject commits while
    // any request from before a clear remains active; stale bodies cannot return.
    for (const epochs of this.state.active)
      if (epochs[scope] !== this.state.epochs[scope]) this.conflict();
  }
  async clear(scopes: readonly CacheScope[]): Promise<void> {
    for (const scope of scopes) {
      this.state.epochs[scope]++;
      this.state.entries.delete(scope);
    }
  }
}
export class JsonCache {
  readonly coordinator: CacheCoordinator;
  private readonly state: Runtime;
  constructor(
    root: string,
    readonly scope: CacheScope,
    private readonly now = Date.now,
  ) {
    this.state = runtime(root);
    this.coordinator = new CacheCoordinator(root);
  }
  run<T>(operation: () => Promise<T>): Promise<T> {
    return this.coordinator.run(operation);
  }
  requestKey(): string {
    return this.coordinator.requestKey(this.scope);
  }
  assertCurrent(): void {
    this.coordinator.assertCurrent(this.scope);
  }
  async get<T>(
    key: string,
    schema: z.ZodType<T>,
    days: number,
  ): Promise<T | null> {
    this.assertCurrent();
    const entries = this.state.entries.get(this.scope);
    const entry = entries?.get(key);
    if (!entry) return null;
    if (this.now() - entry.lastUsed > days * 86400000) {
      entries?.delete(key);
      return null;
    }
    const decoded = schema.safeParse(JSON.parse(entry.json));
    if (!decoded.success) {
      entries?.delete(key);
      return null;
    }
    entry.lastUsed = this.now();
    return decoded.data;
  }
  async put(key: string, value: unknown): Promise<void> {
    this.assertCurrent();
    const json = JSON.stringify(value);
    if (json === undefined)
      throw new TypeError('Memory value must be JSON serializable');
    let entries = this.state.entries.get(this.scope);
    if (!entries) {
      entries = new Map();
      this.state.entries.set(this.scope, entries);
    }
    entries.set(key, { json, lastUsed: this.now() });
  }
  clear(): Promise<void> {
    return this.coordinator.clear([this.scope]);
  }
  async expire(days: number): Promise<void> {
    const entries = this.state.entries.get(this.scope);
    for (const [key, entry] of entries ?? [])
      if (this.now() - entry.lastUsed > days * 86400000) entries?.delete(key);
  }
}
