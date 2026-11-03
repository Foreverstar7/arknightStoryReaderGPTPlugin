import { AsyncLocalStorage } from 'node:async_hooks';
import { mkdirSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ReaderError } from '../shared/errors.js';

export const cacheScopes = [
  'text',
  'prts',
  'metadata',
  'mapping',
  'images',
] as const;
export type CacheScope = (typeof cacheScopes)[number];
type Epochs = Record<CacheScope, number>;
const requests = new AsyncLocalStorage<{ file: string; epochs: Epochs }>();
const connections = new Map<string, DatabaseSync>();

export class CacheStorageError extends ReaderError {
  constructor(
    readonly operation: string,
    readonly phase: string,
    cause: unknown,
  ) {
    super(
      'storage',
      '内容缓存读写失败，请检查 cache/ 目录权限或稍后重试；阅读记录独立保留。',
      undefined,
      { cause },
    );
  }
}

/** Cache payloads and epochs commit together. Keep a connection per data root:
 * closing after every operation forces a WAL checkpoint and gives a clearing
 * process repeated long write locks. Network work never holds a transaction.
 * This database is disposable and separate from reading/records.sqlite.
 */
export class CacheCoordinator {
  private readonly file: string;
  constructor(root: string) {
    this.file = path.resolve(root, 'cache', 'content.sqlite');
  }
  /** Release the root at owner shutdown (also before removing isolated test data). */
  close(): void {
    connections.get(this.file)?.close();
    connections.delete(this.file);
  }
  locked<T>(operation: (db: DatabaseSync) => T, name: string): T {
    let db: DatabaseSync | undefined;
    let phase = 'mkdir';
    const started = Date.now();
    let acquired: number | undefined;
    try {
      mkdirSync(path.dirname(this.file), { recursive: true });
      phase = 'open';
      db = connections.get(this.file);
      if (!db) {
        db = new DatabaseSync(this.file, { timeout: 5000 });
        connections.set(this.file, db);
        phase = 'schema';
        // NORMAL preserves committed data on process crashes. On power loss the
        // disposable cache may lose recent commits; reading records retain FULL.
        db.exec('PRAGMA auto_vacuum = FULL');
        if (db.prepare('PRAGMA journal_mode').get()?.journal_mode !== 'wal')
          db.exec('PRAGMA journal_mode = WAL');
        db.exec('PRAGMA synchronous = NORMAL');
        db.exec(`
          CREATE TABLE IF NOT EXISTS epochs (scope TEXT PRIMARY KEY, epoch INTEGER NOT NULL);
          CREATE TABLE IF NOT EXISTS entries (
            scope TEXT NOT NULL, key TEXT NOT NULL, value TEXT, last_used REAL NOT NULL,
            PRIMARY KEY (scope, key)
          );
        `);
      }
      phase = 'begin';
      db.exec('BEGIN IMMEDIATE');
      acquired = Date.now();
      phase = 'operation';
      const result = operation(db);
      phase = 'commit';
      db.exec('COMMIT');
      return result;
    } catch (error) {
      if (db?.isTransaction) {
        try {
          db.exec('ROLLBACK');
        } catch (rollback) {
          error = new AggregateError(
            [error, rollback],
            'Cache rollback failed',
          );
        }
      }
      if (error instanceof ReaderError) throw error;
      throw new CacheStorageError(name, phase, error);
    } finally {
      // A failed initialization must not publish a partially prepared connection.
      if (phase === 'schema') this.close();
      if (process.env.READER_CACHE_TRACE === '1')
        process.stderr.write(
          JSON.stringify({
            pid: process.pid,
            name,
            phase,
            started,
            acquired,
            ended: Date.now(),
          }) + '\n',
        );
    }
  }
  private epoch(db: DatabaseSync, scope: CacheScope): number {
    const value = db
      .prepare('SELECT epoch FROM epochs WHERE scope = ?')
      .get(scope)?.epoch;
    if (value === undefined) return 0;
    if (typeof value !== 'number') throw new Error('Invalid cache epoch');
    return value;
  }
  private context() {
    const context = requests.getStore();
    return context?.file === this.file ? context : undefined;
  }
  run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.context()) return operation();
    const epochs = this.locked(
      (db): Epochs => ({
        text: this.epoch(db, 'text'),
        prts: this.epoch(db, 'prts'),
        metadata: this.epoch(db, 'metadata'),
        mapping: this.epoch(db, 'mapping'),
        images: this.epoch(db, 'images'),
      }),
      'request.epochs',
    );
    return requests.run({ file: this.file, epochs }, operation);
  }
  requestKey(scope: CacheScope): string {
    return `${this.context()?.epochs[scope] ?? this.locked((db) => this.epoch(db, scope), `${scope}.epoch`)}`;
  }
  current(db: DatabaseSync, scope: CacheScope): boolean {
    const expected = this.context()?.epochs[scope];
    return expected === undefined || expected === this.epoch(db, scope);
  }
  assertCurrent(scope: CacheScope): void {
    if (!this.locked((db) => this.current(db, scope), `${scope}.assertCurrent`))
      throw new ReaderError(
        'conflict',
        '内容缓存已在另一操作中清理，请重新打开或查看所需资源。',
      );
  }
  legacyAllowed(db: DatabaseSync, scope: CacheScope): boolean {
    return this.epoch(db, scope) === 0;
  }
  async clear(scopes: readonly CacheScope[]): Promise<void> {
    // Commit invalidation and deletion atomically. Legacy JSON files are read-only
    // in this version; after this fence they cannot be imported or resurrected.
    this.locked(
      (db) => {
        const bump = db.prepare(
          'INSERT INTO epochs (scope, epoch) VALUES (?, 1) ON CONFLICT(scope) DO UPDATE SET epoch = epoch + 1',
        );
        const remove = db.prepare('DELETE FROM entries WHERE scope = ?');
        for (const scope of scopes) {
          bump.run(scope);
          remove.run(scope);
        }
      },
      `clear:${scopes.join(',')}`,
    );
    // No file deletion under the database write lock. New requests only write
    // SQLite, so removing legacy files cannot delete fresh post-clear content.
    const directory = path.dirname(this.file);
    try {
      for (const scope of scopes) {
        const target = path.resolve(directory, scope);
        if (path.dirname(target) !== directory || !cacheScopes.includes(scope))
          throw new Error('Invalid cache cleanup target');
        await rm(target, { recursive: true, force: true });
      }
    } catch (error) {
      throw new CacheStorageError(
        `clear:${scopes.join(',')}`,
        'legacy.delete',
        error,
      );
    }
  }
}
