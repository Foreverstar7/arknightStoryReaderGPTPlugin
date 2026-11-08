import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { FixtureSource } from '../src/data/fixture.js';
import { PrtsSource } from '../src/data/prts.js';
import {
  CAST_PAGES,
  parseActivityIntros,
  parseAppearances,
  parseMainIntro,
} from '../src/data/prts-search.js';
import { searchStories } from '../src/domain/search.js';
import { searchInputSchema, searchForModel } from '../src/shared/search.js';
import { ReaderService } from '../src/server/service.js';
import { CacheCoordinator } from '../src/storage/cache-coordinator.js';
import { ReaderError } from '../src/shared/errors.js';

test('catalog and exact cast matching do not require bodies, merge results, paginate and retain unmatched names', async () => {
  const source = new FixtureSource();
  const stories = await source.catalog();
  const first = stories[0];
  assert.ok(first);
  const titles = searchStories(
    stories,
    searchInputSchema.parse({
      queries: [first.title, first.title, '不存在的剧情'],
    }),
  );
  assert.equal(titles.total, 1);
  assert.deepEqual(titles.unmatchedQueries, ['不存在的剧情']);
  assert.equal(titles.results[0]?.id, first.id);
  const input = searchInputSchema.parse({
    by: 'character',
    queries: ['记录员'],
    limit: 1,
  });
  const result = searchStories(stories, input, await source.appearances());
  assert.equal(result.total, 3);
  assert.equal(result.results.length, 1);
  assert.equal(result.hasMore, true);
  assert.notEqual(
    searchStories(stories, { ...input, offset: 1 }, await source.appearances())
      .results[0]?.id,
    result.results[0]?.id,
  );
  const uncertain = [
    {
      chapterId: first.chapters[0]?.id ?? '',
      names: ['记录员？'],
      sourceUrl: 'https://prts.wiki/w/Test',
    },
  ];
  assert.equal(searchStories(stories, input, uncertain).total, 0);
  assert.equal(
    'matchedChapters' in (searchForModel(result).results[0] ?? {}),
    false,
  );
  assert.equal(JSON.stringify(result).includes('paragraphs'), false);
});

test('cast parser excludes comments and retains ambiguous source names; source failures remain errors', () => {
  const row = '|[[X1-1 原创/BEG]]||记录员,记录员？,？？？,甲&乙,\n';
  const wiki = `<!--|[[假的/BEG]]||假的,-->\n!关卡!!出场人物\n${row}`;
  const result = parseAppearances(wiki, 'https://prts.wiki/w/Cast');
  assert.equal(result.length, 1);
  assert.deepEqual(result[0]?.names, [
    '记录员',
    '记录员？',
    '？？？',
    '甲',
    '乙',
  ]);
  assert.throws(
    () => parseAppearances('<html>error</html>', 'https://prts.wiki/w/Cast'),
    { code: 'parse' },
  );
  assert.throws(
    () =>
      parseAppearances(
        wiki + '|[[坏的行/BEG]]|缺少出场列',
        'https://prts.wiki/w/Cast',
      ),
    { code: 'parse' },
  );
});

test('source intros accept current plain/poem entries and deduplicate responsive main poems without inventing missing entries', () => {
  const intros = parseActivityIntros(
    '==原创甲==\n<poem>第一行\n第二行</poem>\n==原创乙==\n旧版普通段落。',
  );
  assert.equal(intros.get('原创甲'), '第一行\n第二行');
  assert.equal(intros.get('原创乙'), '旧版普通段落。');
  assert.equal(intros.get('未知'), undefined);
  assert.throws(() => parseActivityIntros('==原创甲==\n{{未知模板}}'), {
    code: 'parse',
  });
  const main =
    '{| class="wikitable" style="margin-bottom:0;"\n!colspan="5"|<big>第八章 <big>原创甲</big></big>\n<poem>明确导语。</poem>\n<poem>明确导语。</poem>';
  assert.equal(parseMainIntro(main, '原创甲'), '明确导语。');
  assert.equal(parseMainIntro(main, '原创乙'), undefined);
  assert.throws(() => parseMainIntro('上游结构已改变', '原创甲'), {
    code: 'parse',
  });
  assert.throws(
    () =>
      parseMainIntro(
        main.replace('明确导语。</poem>', '另一段导语。</poem>'),
        '原创甲',
      ),
    { code: 'parse' },
  );
});

test('cold PRTS search acquires only catalog/cast metadata, works offline from cache, and clearing it preserves reading state', async () => {
  const base = path.resolve('.ai/local/test-data');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, 'search-'));
  assert.ok(root.startsWith(base + path.sep));
  const calls: string[] = [];
  let offline = false;
  const read = async (title: string) => {
    calls.push(title);
    if (offline) throw new ReaderError('network', '原创断网场景');
    if (title === '剧情一览') return '{{剧情导航}}';
    if (title === '模板:剧情导航')
      return '{|\n![[剧情一览|活动剧情一览]]\n|-\n!width="20%"|原创剧情\n!支线\n|[[X1-1 原创篇目/BEG|X1-1 原创篇目]]\n|}';
    if (CAST_PAGES.includes(title))
      return '!关卡!!出场人物\n|[[X1-1 原创篇目/BEG]]||记录员,\n';
    if (title === '模板:活动信息/quote')
      return '==原创剧情==\n<poem>原创剧情导语。</poem>';
    throw new Error(`Unexpected body/image download: ${title}`);
  };
  try {
    const service = new ReaderService(new PrtsSource(root, read), root);
    const before = await service.records.read();
    const result = await service.call('reader_search', {
      by: 'character',
      queries: ['记录员'],
    });
    assert.equal(result.total, 1);
    assert.equal(result.results[0]?.matchedChapters[0]?.code, 'X1-1');
    assert.equal(calls.length, 4);
    assert.equal(
      (await service.call('reader_story_info', { storyId: 'prts:原创剧情' }))
        .summary,
      '原创剧情导语。',
    );
    offline = true;
    const count = calls.length;
    assert.equal(
      (
        await service.call('reader_search', {
          by: 'character',
          queries: ['记录员'],
        })
      ).total,
      1,
    );
    assert.equal(calls.length, count);
    assert.deepEqual(await service.records.read(), before);
    await assert.rejects(
      () =>
        service.call('reader_search', {
          by: 'character',
          queries: ['记录员'],
          refresh: true,
        }),
      { code: 'network' },
    );
    await service.call('reader_clear_cache', { scope: 'all' });
    assert.deepEqual(await service.records.read(), before);
    await assert.rejects(
      () => service.call('reader_search', { queries: ['原创剧情'] }),
      { code: 'network' },
    );
  } finally {
    new CacheCoordinator(root).close();
    await rm(root, { recursive: true, force: true });
  }
});
