import { createHash, randomUUID } from 'node:crypto';
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { ReaderError } from '../data/source.js';
import { chapterSchema, type Chapter } from '../shared/contracts.js';

function missing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

async function atomicWrite(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(value), 'utf8');
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
}

const cacheSchema = z.object({
  lastUsedAt: z.number(),
  chapter: chapterSchema,
});
export class ContentCache {
  private readonly directory: string;
  private pending: Promise<unknown> = Promise.resolve();
  constructor(
    root: string,
    private readonly now: () => number = Date.now,
  ) {
    this.directory = path.join(root, 'cache', 'text');
  }
  private file(id: string): string {
    return path.join(
      this.directory,
      `${createHash('sha256').update(id).digest('hex')}.json`,
    );
  }
  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const task = this.pending.catch(() => undefined).then(operation);
    this.pending = task;
    return task;
  }
  get(id: string, retentionDays: number): Promise<Chapter | null> {
    return this.serialize(async () => {
      let raw: unknown;
      try {
        raw = JSON.parse(await readFile(this.file(id), 'utf8'));
      } catch (error) {
        if (missing(error) || error instanceof SyntaxError) return null;
        throw new ReaderError(
          'storage',
          '正文缓存无法读取，请检查目录权限后重试。',
        );
      }
      const cached = cacheSchema.safeParse(raw);
      if (!cached.success) return null;
      if (this.now() - cached.data.lastUsedAt > retentionDays * 86_400_000) {
        await rm(this.file(id), { force: true });
        return null;
      }
      await atomicWrite(this.file(id), {
        ...cached.data,
        lastUsedAt: this.now(),
      });
      return cached.data.chapter;
    });
  }
  put(chapter: Chapter): Promise<void> {
    return this.serialize(() =>
      atomicWrite(this.file(chapter.id), { chapter, lastUsedAt: this.now() }),
    );
  }
  clear(): Promise<void> {
    return this.serialize(async () => {
      // Fixed directory owned by this class; never accepts a caller-supplied filesystem path.
      await rm(this.directory, { recursive: true, force: true });
    });
  }
  expire(retentionDays: number): Promise<void> {
    return this.serialize(async () => {
      let names: string[];
      try {
        names = await readdir(this.directory);
      } catch (error) {
        if (missing(error)) return;
        throw error;
      }
      for (const name of names.filter((name) =>
        /^[a-f0-9]{64}\.json$/.test(name),
      )) {
        const file = path.join(this.directory, name);
        let raw: unknown;
        try {
          raw = JSON.parse(await readFile(file, 'utf8'));
        } catch (error) {
          if (!(error instanceof SyntaxError)) throw error;
        }
        const entry = cacheSchema.safeParse(raw);
        if (
          !entry.success ||
          this.now() - entry.data.lastUsedAt > retentionDays * 86_400_000
        ) {
          await rm(file, { force: true });
        }
      }
    });
  }
}
