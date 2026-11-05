import { AsyncLocalStorage } from 'node:async_hooks';
import { inspect } from 'node:util';
import { z } from 'zod';
import { FixtureSource } from '../../src/data/fixture.js';
import { PrtsResources } from '../../src/data/prts-resources.js';
import { ReaderService } from '../../src/server/service.js';
import { ContentCache } from '../../src/storage/files.js';
import { JsonCache } from '../../src/storage/json-cache.js';

const root = z.string().parse(process.argv[2]);
const fixture = new FixtureSource();
const context = new AsyncLocalStorage<{ id: string; hold: boolean }>();
const gates = new Map<string, () => void>();
let hasOpened = false;
async function pause() {
  const current = context.getStore();
  if (!current?.hold) return;
  const gate = new Promise<void>((resolve) => gates.set(current.id, resolve));
  process.send?.({ id: current.id, event: 'started' });
  await gate;
  gates.delete(current.id);
}
const service = new ReaderService(
  {
    label: fixture.label,
    catalog: () => fixture.catalog(),
    chapter: async (id) => {
      await pause();
      return fixture.chapter(id);
    },
  },
  root,
);
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
  'base64',
);
const resources = new PrtsResources(
  root,
  async () => 'scene,https://media.prts.wiki/a/ab/Avg_scene.png',
  async () => {
    await pause();
    return new Response(png, { headers: { 'content-type': 'image/png' } });
  },
);
const commandSchema = z.object({
  id: z.string(),
  action: z.enum([
    'text',
    'image',
    'release',
    'clear',
    'stress',
    'inspect',
    'record',
  ]),
  target: z.string().optional(),
  scope: z.enum(['images', 'all']).default('all'),
  hold: z.boolean().default(false),
  loops: z.number().int().min(1).max(50).default(1),
});
type Command = z.infer<typeof commandSchema>;
async function execute(command: Command): Promise<unknown> {
  switch (command.action) {
    case 'release':
      gates.get(command.target ?? '')?.();
      return {};
    case 'text':
      return {
        revision: (await service.chapter('fixture-mist/1', true)).revision,
      };
    case 'image':
      return { width: (await resources.cg('scene', 7)).width };
    case 'clear':
      return service.call('reader_clear_cache', { scope: command.scope });
    case 'record': {
      const chapter = await fixture.chapter('fixture-mist/1');
      if (!hasOpened) {
        await service.chapter(chapter.id);
        hasOpened = true;
      }
      await service.record({
        chapterId: chapter.id,
        revision: chapter.revision,
        last: { blockId: 'report', fraction: 0.5 },
        atEnd: false,
      });
      return {};
    }
    case 'stress': {
      const cache = new JsonCache(root, 'images');
      for (let n = 0; n < command.loops; n++) {
        if (command.scope === 'all')
          await service.call('reader_clear_cache', { scope: 'all' });
        else {
          await cache.put('stress', { n });
          const value = await cache.get(
            'stress',
            z.object({ n: z.number().int() }),
            7,
          );
          if (value && !Number.isInteger(value.n))
            throw new Error('torn write');
          await cache.expire(7);
          await service.cache.get('fixture-mist/1', 7);
        }
      }
      return {};
    }
    case 'inspect':
      return {
        chapter: await new ContentCache(root).get('fixture-mist/1', 7),
        image: await resources.images.get(
          'https://media.prts.wiki/a/ab/Avg_scene.png',
          z.unknown(),
          7,
        ),
        mapping: await resources.mappings.get(
          'Widget:Data_Image',
          z.string(),
          7,
        ),
        state: await service.records.read(),
      };
  }
}
process.on('message', (raw: unknown) => {
  const command = commandSchema.parse(raw);
  void context.run(command, async () => {
    try {
      process.send?.({
        id: command.id,
        event: 'result',
        data: await execute(command),
      });
    } catch (error) {
      process.send?.({
        id: command.id,
        event: 'error',
        error: `worker ${process.pid} ${command.action} scope=${command.scope}: ${inspect(error, { depth: 8 })}`,
      });
    }
  });
});
process.on('disconnect', () => process.exit(0));
