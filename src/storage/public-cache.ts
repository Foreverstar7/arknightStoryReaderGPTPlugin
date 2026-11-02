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

const entrySchema = z.object({ lastUsedAt: z.number(), value: z.unknown() });
const missing = (error: unknown) =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT';

/** Public metadata/mappings/images only. Keys never become filesystem paths. */
export class PublicCache {
  private readonly directory: string;
  private pending: Promise<unknown> = Promise.resolve();
  constructor(
    root: string,
    kind: 'mapping' | 'metadata' | 'images',
    private readonly now = Date.now,
  ) {
    this.directory = path.resolve(root, 'cache', kind);
  }
  private file(key: string) {
    return path.join(
      this.directory,
      `${createHash('sha256').update(key).digest('hex')}.json`,
    );
  }
  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const task = this.pending.catch(() => undefined).then(operation);
    this.pending = task;
    return task;
  }
  private async write(file: string, value: unknown) {
    await mkdir(this.directory, { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      await writeFile(
        temporary,
        JSON.stringify({ value, lastUsedAt: this.now() }),
      );
      await rename(temporary, file);
    } finally {
      await rm(temporary, { force: true });
    }
  }
  get<T>(key: string, schema: z.ZodType<T>, days: number): Promise<T | null> {
    return this.serialize(async () => {
      const file = this.file(key);
      let raw: unknown;
      try {
        raw = JSON.parse(await readFile(file, 'utf8'));
      } catch (error) {
        if (missing(error) || error instanceof SyntaxError) return null;
        throw new ReaderError(
          'storage',
          '公开资源缓存无法读取，请检查目录权限。',
        );
      }
      const entry = entrySchema.safeParse(raw);
      const value = schema.safeParse(
        entry.success ? entry.data.value : undefined,
      );
      if (
        !entry.success ||
        !value.success ||
        this.now() - entry.data.lastUsedAt > days * 86_400_000
      ) {
        await rm(file, { force: true });
        return null;
      }
      await this.write(file, value.data);
      return value.data;
    });
  }
  put(key: string, value: unknown): Promise<void> {
    return this.serialize(() => this.write(this.file(key), value));
  }
  clear(): Promise<void> {
    // The resolved fixed target is this class's cache directory, never reading/.
    return this.serialize(() =>
      rm(this.directory, { recursive: true, force: true }),
    );
  }
  expire(days: number): Promise<void> {
    return this.serialize(async () => {
      let names: string[];
      try {
        names = await readdir(this.directory);
      } catch (error) {
        if (missing(error)) return;
        throw error;
      }
      for (const name of names.filter((name) =>
        /^[a-f0-9]{64}\.json$/u.test(name),
      )) {
        const file = path.join(this.directory, name);
        let entry;
        try {
          entry = entrySchema.safeParse(
            JSON.parse(await readFile(file, 'utf8')),
          );
        } catch (error) {
          if (missing(error)) continue;
          if (!(error instanceof SyntaxError)) throw error;
        }
        if (
          !entry?.success ||
          this.now() - entry.data.lastUsedAt > days * 86_400_000
        )
          await rm(file, { force: true });
      }
    });
  }
}
