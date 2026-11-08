import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { parsePrtsScore, PrtsScoreData } from '../src/data/prts-score.js';
import { FixtureSource } from '../src/data/fixture.js';
import { ReaderService } from '../src/server/service.js';
import { CacheCoordinator } from '../src/storage/cache-coordinator.js';
import type { Story } from '../src/shared/contracts.js';
import { deferred } from './helpers/deferred.js';

// Original records exercise the source grammar without copying game prose.
const member = (name: string, movement: string) =>
  `{{/乐章|名称=${name}|乐章=${movement}|描述={{tag|style=a|text=b}}}}`;
const wiki = `==乐章概览==
{{/概览|MS|明天|Ms|link=主题曲 明天}}
{{/概览|AX|远行|Ax}}
{{/概览|CO|集录|Co}}
==主题曲 明天==
[[关卡一览/主题曲#EP00|00]] [[#长路回声|{{mdi|arrow-down}}长路回声]] [[关卡一览/主题曲#EP01|01]]
==远行==
${member('长路回声', '远行')}
{{/交点|名称=起点|故事线=MS|link=故意不可靠的装饰链接}}
${member('灯火与归途', '远行')}
==集录==
{{cbox|text=仅作收录而非故事线}}
{{/交点|名称=灯火与归途|故事线=AX|流入=1}}
${member('雾中来信', '集录')}`;
async function catalog(): Promise<Story[]> {
  const fixture = await new FixtureSource().catalog();
  return [
    ...fixture,
    ...[0, 1].map((index) => ({
      id: `main:${index}`,
      title: index === 0 ? '起点' : '启程',
      category: '主线剧情',
      type: '主线',
      coverLabel: '原创',
      source: 'fixture' as const,
      chapters: [
        {
          id: `main:${index}/1`,
          code: `${index}-1`,
          title: '原创',
          wordCount: null,
        },
      ],
    })),
  ];
}
async function temporary(run: (root: string) => Promise<void>) {
  const base = path.resolve('.ai/local/test-data');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, 'score-'));
  try {
    await run(root);
  } finally {
    new CacheCoordinator(root).close();
    await rm(root, { recursive: true, force: true });
  }
}

test('score preserves membership, ordered between-story junctions and explicit incoming direction without trusting decorative URLs', async () => {
  const stories = await catalog();
  const before = structuredClone(stories);
  const score = parsePrtsScore(wiki, stories);
  assert.deepEqual(stories, before);
  assert.deepEqual(score.unmatchedNames, []);
  assert.deepEqual(
    score.movements[0]?.nodes.map((node) =>
      node.kind === 'story' ? node.storyId : node.targetStoryId,
    ),
    ['main:0', 'fixture-road', 'main:1'],
  );
  assert.deepEqual(
    score.movements[1]?.nodes.map((node) =>
      node.kind === 'story' ? node.storyId : node.targetStoryId,
    ),
    ['fixture-road', 'main:0', 'fixture-lights'],
  );
  const incoming = score.movements[2]?.nodes[0];
  assert.ok(incoming?.kind === 'junction');
  assert.equal(incoming.direction, 'incoming');
  assert.equal(incoming.targetMovementId, 'score:AX');
  assert.equal(score.movements[2]?.collection, true);
});

test('unmatched names stay explicit and unknown stories do not become fabricated score members', async () => {
  const full = await catalog();
  const stories = full.filter((story) => story.id !== 'fixture-lights');
  const score = parsePrtsScore(wiki, stories);
  assert.deepEqual(score.unmatchedNames, ['灯火与归途']);
  assert.equal(
    score.movements
      .flatMap((movement) => movement.nodes)
      .filter((node) => node.kind === 'story').length,
    4,
  );
  const first = stories[0];
  assert.ok(first);
  assert.throws(
    () => parsePrtsScore(wiki, [...stories, { ...first, id: 'ambiguous' }]),
    /多部剧情/,
  );
  assert.throws(
    () => parsePrtsScore(wiki.replace('故事线=AX', '故事线=CO'), full),
    /收录矛盾/,
  );
  assert.throws(
    () => parsePrtsScore(wiki.replace('|乐章=远行', '|乐章=错误'), stories),
    /分区矛盾/,
  );
  assert.throws(() => parsePrtsScore('source changed', stories), /结构改变/);
});

test('score metadata shares requests, works from cache offline and is invalidated by cache clear', async () => {
  await temporary(async (root) => {
    const stories = await catalog();
    let calls = 0;
    const waiting = deferred();
    const data = new PrtsScoreData(root, async () => {
      calls++;
      await waiting.promise;
      return wiki;
    });
    const first = data.get(stories, 7);
    const second = data.get(stories, 7);
    waiting.resolve();
    assert.deepEqual(await first, await second);
    assert.equal(calls, 1);
    const offline = new PrtsScoreData(root, async () => {
      throw new Error('offline');
    });
    assert.deepEqual(await offline.get(stories, 7), await first);
    await assert.rejects(() => offline.get(stories, 7, true), /offline/);
    await new CacheCoordinator(root).clear(['metadata']);
    await assert.rejects(() => offline.get(stories, 7), /offline/);
  });
});

test('a score source failure never blocks ordinary catalog snapshots or changes reading state', async () => {
  await temporary(async (root) => {
    class BrokenScore extends FixtureSource {
      override async score(): Promise<never> {
        throw Error('score source unavailable');
      }
    }
    const service = new ReaderService(new BrokenScore(), root);
    const before = await service.snapshot();
    const withScore = await service.snapshot(false, true);
    assert.deepEqual(withScore.stories, before.stories);
    assert.deepEqual(withScore.state, before.state);
    assert.deepEqual(withScore.score, {
      status: 'failed',
      message: 'score source unavailable',
    });
    assert.equal((await service.snapshot()).score, undefined);
  });
});

test('clearing metadata while a score request is pending fences its late response and permits a fresh request', async () => {
  await temporary(async (root) => {
    const stories = await catalog();
    const started = deferred();
    const release = deferred();
    const data = new PrtsScoreData(root, async () => {
      started.resolve();
      await release.promise;
      return wiki;
    });
    const pending = data.get(stories, 7);
    const rejected = assert.rejects(pending, /清理/);
    await started.promise;
    await new CacheCoordinator(root).clear(['metadata']);
    release.resolve();
    await rejected;
    const fresh = new PrtsScoreData(root, async () => wiki);
    assert.equal((await fresh.get(stories, 7)).movements.length, 3);
  });
});
