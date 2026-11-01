import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import { ReaderError } from '../data/source.js';

const entrySchema = z.object({
  lastUsedAt: z.number(),
  rootWiki: z.string(),
  navigationWiki: z.string(),
});
type CatalogText = Pick<
  z.infer<typeof entrySchema>,
  'rootWiki' | 'navigationWiki'
>;

/** Only public source content lives here; reading/ is never accessed. */
export class PrtsCatalogCache {
  private readonly directory: string;
  constructor(
    root: string,
    private readonly now = Date.now,
  ) {
    this.directory = path.join(root, 'cache', 'prts');
  }
  async get(retentionDays: number): Promise<CatalogText | null> {
    const file = path.join(this.directory, 'catalog.json');
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(file, 'utf8'));
    } catch (error) {
      if (
        error instanceof SyntaxError ||
        (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      )
        return null;
      throw new ReaderError(
        'storage',
        'PRTS 目录缓存无法读取，请检查本机目录权限。',
      );
    }
    const entry = entrySchema.safeParse(raw);
    if (!entry.success) return null;
    if (this.now() - entry.data.lastUsedAt > retentionDays * 86_400_000) {
      await rm(file, { force: true });
      return null;
    }
    await this.put(entry.data);
    return entry.data;
  }
  async put(value: CatalogText): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    const file = path.join(this.directory, 'catalog.json');
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      await writeFile(
        temporary,
        JSON.stringify({ ...value, lastUsedAt: this.now() }),
        'utf8',
      );
      await rename(temporary, file);
    } finally {
      await rm(temporary, { force: true });
    }
  }
  async clear(): Promise<void> {
    // A fixed cache-only directory, never a caller-supplied path.
    await rm(this.directory, { recursive: true, force: true });
  }
}
