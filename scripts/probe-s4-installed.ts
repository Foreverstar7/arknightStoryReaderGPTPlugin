import { CacheCoordinator } from '../src/storage/cache-coordinator.js';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import {
  chapterSchema,
  chapterCountSchema,
  readingStateSchema,
  snapshotSchema,
} from '../src/shared/contracts.js';
import { ReadingStore } from '../src/storage/reading-store.js';
import { ContentCache } from '../src/storage/files.js';
import { JsonCache } from '../src/storage/json-cache.js';
import { readReaderLaunch } from './reader-launch.js';

const installed = path.resolve(
  process.argv[2] ?? '.local/marketplace/plugins/arknights-story-reader',
);
const base = path.resolve('.ai/local/probes');
await mkdir(base, { recursive: true });
const data = await mkdtemp(path.join(base, 's4-installed-'));
const clients = [
  new Client({ name: 's4-one', version: '1' }),
  new Client({ name: 's4-two', version: '1' }),
];
const [first, second] = clients;
assert.ok(first && second);
const id = 'fixture-mist/1';
const launch = await readReaderLaunch(installed);
try {
  await new ReadingStore(data).change((state) => ({
    ...state,
    recentChapterId: id,
    records: {
      [id]: {
        chapterId: id,
        storyId: 'fixture-mist',
        revision: 'unavailable-legacy-fixture',
        last: { blockId: 'missing-old-position', fraction: 0.5 },
        furthestWords: 700,
        totalWords: 1000,
        complete: false,
        updatedAt: '2026-11-01T00:00:00.000Z',
      },
    },
  }));
  await Promise.all(
    clients.map((client) =>
      client.connect(
        new StdioClientTransport({
          ...launch,
          env: {
            ...launch.env,
            READER_SOURCE: 'fixture',
            READER_DATA_DIR: data,
          },
        }),
      ),
    ),
  );
  const untouched = await new ReadingStore(data).read();
  const catalog = snapshotSchema.parse(
    (await first.callTool({ name: 'reader_snapshot', arguments: {} }))
      .structuredContent,
  );
  const story = catalog.stories.find((story) => story.id === 'fixture-mist');
  assert.ok(story);
  for (const meta of story.chapters) {
    const count = chapterCountSchema.parse(
      (
        await second.callTool({
          name: 'reader_prepare_chapter',
          arguments: { chapterId: meta.id },
        })
      ).structuredContent,
    );
    assert.equal(count.chapterId, meta.id);
    assert.ok(count.wordCount > 0);
  }
  assert.deepEqual(await new ReadingStore(data).read(), untouched);
  const counted = snapshotSchema.parse(
    (await first.callTool({ name: 'reader_snapshot', arguments: {} }))
      .structuredContent,
  );
  const prepared = counted.stories.find((item) => item.id === story.id);
  assert.ok(prepared);
  assert.ok(
    prepared.chapters.every((meta) => meta.wordCountRevision !== undefined),
  );
  const chapter = chapterSchema.parse(
    (
      await first.callTool({
        name: 'reader_chapter',
        arguments: { chapterId: id },
      })
    ).structuredContent,
  );
  await second.callTool({
    name: 'reader_chapter',
    arguments: { chapterId: id },
  });
  const migrated = snapshotSchema.parse(
    (await first.callTool({ name: 'reader_snapshot', arguments: {} }))
      .structuredContent,
  ).state;
  assert.equal(migrated.records[id]?.progressKnown, false);
  assert.equal(migrated.records[id]?.migration?.previous.furthestWords, 700);
  const conflict = await second.callTool({
    name: 'reader_record',
    arguments: {
      chapterId: id,
      revision: 'unavailable-legacy-fixture',
      last: { blockId: 'missing-old-position', fraction: 0 },
      atEnd: false,
    },
  });
  assert.equal(conflict.isError, true);
  const end = chapter.blocks.at(-1);
  const start = chapter.blocks[0];
  assert.ok(end && start);
  const completed = readingStateSchema.parse(
    (
      await first.callTool({
        name: 'reader_record',
        arguments: {
          chapterId: id,
          revision: chapter.revision,
          last: { blockId: end.id, fraction: 1 },
          atEnd: true,
        },
      })
    ).structuredContent,
  );
  assert.equal(completed.records[id]?.complete, true);
  assert.equal(completed.records[id]?.progressKnown, true);
  const before = await new ReadingStore(data).read();
  await new JsonCache(data, 'images').put('original-test-image', 'disposable');
  await second.callTool({
    name: 'reader_clear_cache',
    arguments: { scope: 'images' },
  });
  assert.deepEqual(await new ReadingStore(data).read(), before);
  assert.ok(await new ContentCache(data).get(id, 7));
  await second.callTool({
    name: 'reader_clear_cache',
    arguments: { scope: 'all' },
  });
  const reread = readingStateSchema.parse(
    (
      await first.callTool({
        name: 'reader_record',
        arguments: {
          chapterId: id,
          revision: chapter.revision,
          last: { blockId: start.id, fraction: 0 },
          atEnd: false,
        },
      })
    ).structuredContent,
  );
  assert.equal(reread.records[id]?.complete, true);
  assert.equal(
    reread.records[id]?.furthestWords,
    completed.records[id]?.furthestWords,
  );
  assert.equal(await new ContentCache(data).get(id, 7), null);
  // History is a separate action and must leave public content/settings intact.
  await new ContentCache(data).put(chapter);
  const cleared = readingStateSchema.parse(
    (await second.callTool({ name: 'reader_clear_history', arguments: {} }))
      .structuredContent,
  );
  assert.equal(Object.keys(cleared.records).length, 0);
  assert.deepEqual(cleared.settings, before.settings);
  assert.ok(await new ContentCache(data).get(id, 7));
  const retained = snapshotSchema.parse(
    (await second.callTool({ name: 'reader_snapshot', arguments: {} }))
      .structuredContent,
  );
  assert.deepEqual(
    retained.stories.find((item) => item.id === story.id)?.chapters,
    prepared.chapters,
  );
  console.info(
    JSON.stringify(
      {
        server: first.getServerVersion(),
        packagedRuntime: launch.packagedRuntime,
        independentProcesses: clients.length,
        source: 'original fixture only',
        prefetchedChaptersWithoutReading: story.chapters.length,
        wordCountIndexSurvivesCacheAndHistoryClearing: true,
        legacyMigration: 'explicitly unknown; original retained',
        oldRevisionRejected: true,
        endThenRereadPreservesFurthest: true,
        clearImagesKeepsTextAndRecords: true,
        clearAllThenScrollDoesNotRefill: true,
        historyClearKeepsCacheAndSettings: true,
      },
      null,
      2,
    ),
  );
} finally {
  await Promise.all(clients.map((client) => client.close()));
  new CacheCoordinator(data).close();
  await rm(data, { recursive: true, force: true });
}
