import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import {
  CacheCoordinator,
  CacheStorageError,
  type CacheScope,
} from './cache-coordinator.js';

const entrySchema = z.object({ lastUsedAt: z.number().finite() }).passthrough();
const missing = (error: unknown) =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT';

/** JSON values are transactional SQLite rows. Legacy files are imported lazily;
 * tombstones prevent expired/invalid rows from resurrecting their old JSON copy.
 * Neither the cache database nor legacy cleanup ever accesses reading/.
 */
export class JsonCache {
  private readonly directory: string;
  readonly coordinator: CacheCoordinator;
  constructor(
    root: string,
    readonly scope: CacheScope,
    private readonly now = Date.now,
  ) {
    this.directory = path.resolve(root, 'cache', scope);
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
  private key(key: string) {
    return this.scope === 'prts'
      ? 'catalog'
      : createHash('sha256').update(key).digest('hex');
  }
  private legacy(key: string) {
    try {
      const entry = entrySchema.safeParse(
        JSON.parse(
          readFileSync(path.join(this.directory, `${key}.json`), 'utf8'),
        ),
      );
      return entry.success ? entry.data : undefined;
    } catch (error) {
      if (missing(error) || error instanceof SyntaxError) return undefined;
      throw error;
    }
  }
  private save(
    db: DatabaseSync,
    key: string,
    value: string | null,
    lastUsed: number,
  ) {
    db.prepare(
      'INSERT INTO entries (scope, key, value, last_used) VALUES (?, ?, ?, ?) ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value, last_used = excluded.last_used',
    ).run(this.scope, key, value, lastUsed);
  }
  async get<T>(
    key: string,
    schema: z.ZodType<T>,
    days: number,
  ): Promise<T | null> {
    return this.coordinator.locked((db) => {
      if (!this.coordinator.current(db, this.scope)) return null;
      const cacheKey = this.key(key);
      const row = db
        .prepare(
          'SELECT value, last_used FROM entries WHERE scope = ? AND key = ?',
        )
        .get(this.scope, cacheKey);
      let raw: unknown;
      let lastUsed: unknown;
      if (row) {
        lastUsed = row.last_used;
        if (typeof row.value === 'string') {
          try {
            raw = JSON.parse(row.value);
          } catch (error) {
            if (!(error instanceof SyntaxError)) throw error;
          }
        }
      } else if (this.coordinator.legacyAllowed(db, this.scope)) {
        const entry = this.legacy(cacheKey);
        lastUsed = entry?.lastUsedAt;
        raw =
          this.scope === 'text'
            ? entry?.chapter
            : this.scope === 'prts'
              ? entry
              : entry?.value;
      }
      const value = schema.safeParse(raw);
      if (
        raw === undefined ||
        !value.success ||
        typeof lastUsed !== 'number' ||
        !Number.isFinite(lastUsed) ||
        this.now() - lastUsed > days * 86_400_000
      ) {
        this.save(db, cacheKey, null, this.now());
        return null;
      }
      if (row)
        db.prepare(
          'UPDATE entries SET last_used = ? WHERE scope = ? AND key = ?',
        ).run(this.now(), this.scope, cacheKey);
      else this.save(db, cacheKey, JSON.stringify(value.data), this.now());
      return value.data;
    }, `${this.scope}.get`);
  }
  async put(key: string, value: unknown): Promise<void> {
    const json = JSON.stringify(value);
    if (json === undefined)
      throw new TypeError('Cache value must be JSON serializable');
    this.coordinator.locked((db) => {
      if (this.coordinator.current(db, this.scope))
        this.save(db, this.key(key), json, this.now());
    }, `${this.scope}.put`);
  }
  async clear(): Promise<void> {
    await this.coordinator.clear([this.scope]);
  }
  async expire(days: number): Promise<void> {
    const obsolete = this.coordinator.locked((db) => {
      if (!this.coordinator.current(db, this.scope)) return [];
      db.prepare(
        'UPDATE entries SET value = NULL WHERE scope = ? AND last_used < ?',
      ).run(this.scope, this.now() - days * 86_400_000);
      let names: string[];
      try {
        names = readdirSync(this.directory);
      } catch (error) {
        if (missing(error)) return [];
        throw error;
      }
      const obsolete: string[] = [];
      for (const name of names.filter((name) =>
        /^(?:[a-f0-9]{64}|catalog)\.json$/u.test(name),
      )) {
        const key = name.slice(0, -5);
        const row = db
          .prepare('SELECT key FROM entries WHERE scope = ? AND key = ?')
          .get(this.scope, key);
        const legacy =
          row || !this.coordinator.legacyAllowed(db, this.scope)
            ? undefined
            : this.legacy(key);
        if (!legacy || this.now() - legacy.lastUsedAt > days * 86_400_000) {
          if (!row) this.save(db, key, null, this.now());
          obsolete.push(path.join(this.directory, name));
        }
      }
      return obsolete;
    }, `${this.scope}.expire`);
    try {
      for (const file of obsolete) await rm(file, { force: true });
    } catch (error) {
      throw new CacheStorageError(
        `${this.scope}.expire`,
        'legacy.delete',
        error,
      );
    }
  }
}
