import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { chapterCountSchema, type ChapterCount } from '../shared/contracts.js';
import { ReaderError } from '../shared/errors.js';

function decodeCount(raw: unknown): ChapterCount {
  if (typeof raw !== 'string') throw new Error('Invalid word count row');
  return chapterCountSchema.parse(JSON.parse(raw));
}

/** Public revision/count metadata, separate from expiring bodies and private history. */
export class WordCountStore {
  private readonly file: string;
  constructor(root: string) {
    this.file = path.resolve(root, 'index/word-counts.sqlite');
  }
  private transaction<T>(operation: (db: DatabaseSync) => T): T {
    let db: DatabaseSync | undefined;
    try {
      mkdirSync(path.dirname(this.file), { recursive: true });
      db = new DatabaseSync(this.file, { timeout: 5000 });
      db.exec(
        'CREATE TABLE IF NOT EXISTS counts (id TEXT PRIMARY KEY, data TEXT NOT NULL)',
      );
      db.exec('BEGIN IMMEDIATE');
      const result = operation(db);
      db.exec('COMMIT');
      return result;
    } catch (cause) {
      if (db?.isTransaction) db.exec('ROLLBACK');
      if (cause instanceof ReaderError) throw cause;
      throw new ReaderError(
        'storage',
        '篇目字数索引读写失败，阅读记录已保留。',
        undefined,
        { cause },
      );
    } finally {
      db?.close();
    }
  }
  all(): Map<string, ChapterCount> {
    return this.transaction(
      (db) =>
        new Map(
          db
            .prepare('SELECT data FROM counts')
            .all()
            .map((row) => {
              const count = decodeCount(row.data);
              return [count.chapterId, count];
            }),
        ),
    );
  }
  put(
    count: Omit<ChapterCount, 'verifiedAt'>,
    expectedRevision: string | undefined,
  ): ChapterCount {
    return this.transaction((db) => {
      const row = db
        .prepare('SELECT data FROM counts WHERE id = ?')
        .get(count.chapterId);
      const current = row ? decodeCount(row.data) : undefined;
      if (
        current?.revision !== expectedRevision &&
        current?.revision !== count.revision
      )
        throw new ReaderError(
          'conflict',
          '另一窗口已更新本篇字数，请重试；未覆盖较新的记录和统计。',
        );
      if (
        current?.revision === count.revision &&
        current.wordCount === count.wordCount &&
        current.contentKind === count.contentKind
      )
        return current;
      const verified = {
        ...count,
        verifiedAt: Math.max(Date.now(), (current?.verifiedAt ?? 0) + 1),
      };
      db.prepare(
        'INSERT INTO counts (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data',
      ).run(count.chapterId, JSON.stringify(verified));
      return verified;
    });
  }
}
