import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ReaderError } from '../data/source.js';
import {
  initialState,
  readingStateSchema,
  type ReadingState,
} from '../shared/contracts.js';

/** SQLite owns inter-process locking; never depend on a JavaScript-only write queue. */
export class ReadingStore {
  private readonly directory: string;
  constructor(root: string) {
    this.directory = path.join(root, 'reading');
  }

  private legacyState(): ReadingState {
    try {
      return readingStateSchema.parse(
        JSON.parse(
          readFileSync(path.join(this.directory, 'state.json'), 'utf8'),
        ),
      );
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
        return initialState();
      throw new ReaderError(
        'storage',
        '旧阅读记录读取失败；原文件已保留，请检查 reading/state.json。',
      );
    }
  }

  private transaction(
    update?: (state: ReadingState) => ReadingState,
  ): ReadingState {
    mkdirSync(this.directory, { recursive: true });
    let db: DatabaseSync | undefined;
    try {
      db = new DatabaseSync(path.join(this.directory, 'records.sqlite'), {
        timeout: 5000,
      });
      db.exec(
        'CREATE TABLE IF NOT EXISTS reading_state (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL)',
      );
      db.exec('BEGIN IMMEDIATE');
      const row = db
        .prepare('SELECT data FROM reading_state WHERE id = 1')
        .get();
      let state: ReadingState;
      if (row) {
        if (typeof row.data !== 'string')
          throw new Error('Invalid stored state');
        state = readingStateSchema.parse(JSON.parse(row.data));
      } else {
        // One-time migration is inside the same lock. The original JSON is retained.
        state = this.legacyState();
      }
      if (update) state = readingStateSchema.parse(update(state));
      if (update || !row)
        db.prepare(
          'INSERT INTO reading_state (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data',
        ).run(JSON.stringify(state));
      db.exec('COMMIT');
      return state;
    } catch (error) {
      if (db?.isTransaction) db.exec('ROLLBACK');
      if (error instanceof ReaderError) throw error;
      throw new ReaderError(
        'storage',
        '阅读记录数据库读写失败；原文件已保留，请检查 reading/records.sqlite 后重试。',
      );
    } finally {
      db?.close();
    }
  }
  async read(): Promise<ReadingState> {
    return this.transaction();
  }
  async change(
    update: (state: ReadingState) => ReadingState,
  ): Promise<ReadingState> {
    return this.transaction(update);
  }
}
