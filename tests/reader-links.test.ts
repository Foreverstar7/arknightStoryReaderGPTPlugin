import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  readerLinkRequest,
  readerSidebarUrl,
  readerStoryPath,
} from '../src/shared/reader-links.js';
import { stableMarketplace } from '../scripts/marketplace.js';

test('sidebar links retain exact story/chapter identifiers and the explicit installation identity', async () => {
  const target = {
    storyId: 'prts:剧情/中文 ?#&%',
    matchedChapterIds: ['prts:篇目/A ?&', 'prts:篇目/B', 'prts:篇目/B'],
  };
  for (const marketplace of ['arknights-reader', 'arknights-reader-dev']) {
    const url = new URL(
      readerSidebarUrl(`arknights-story-reader@${marketplace}`, target),
    );
    assert.equal(url.protocol, 'codex:');
    assert.equal(url.hostname, 'plugins');
    assert.equal(
      url.pathname,
      `/arknights-story-reader@${marketplace}/app/reader_open`,
    );
    assert.deepEqual(readerLinkRequest({ url: url.searchParams.get('path') }), {
      target: {
        ...target,
        matchedChapterIds: [...new Set(target.matchedChapterIds)],
      },
    });
    assert.notEqual(
      readerSidebarUrl(`arknights-story-reader@${marketplace}`, target),
      url.href,
    );
  }
  const manifest = JSON.parse(await readFile('mcp.json', 'utf8'));
  const stable = stableMarketplace('reader', '1.1.4');
  assert.equal(
    manifest.mcpServers.reader.env.READER_PLUGIN_TARGET,
    `${stable.plugins[0]?.name}@${stable.name}`,
  );
  assert.throws(() => readerSidebarUrl('unqualified-plugin', target));
  assert.throws(() => readerSidebarUrl('reader@source" injected="yes', target));
});

test('initial, repeated and legacy deep-link inputs validate without interpreting external URLs as routes', () => {
  const target = {
    storyId: 'prts:某/剧情',
    matchedChapterIds: ['prts:章节/1'],
  };
  const path = readerStoryPath(target);
  assert.deepEqual(readerLinkRequest({ url: path }), { target });
  assert.deepEqual(readerLinkRequest({ url: path }), { target });
  assert.deepEqual(
    readerLinkRequest({
      path: ['stories', target.storyId],
      query: [['match', target.matchedChapterIds[0]]],
    }),
    { target },
  );
  assert.deepEqual(readerLinkRequest({ url: '/' }), { target: null });
  assert.equal(readerLinkRequest(undefined), undefined);
  for (const input of [
    { url: 'https://example.invalid/stories/a' },
    { url: '//example.invalid/stories/a' },
    { url: '/stories/a#fragment' },
    { url: '/stories/' },
    { url: '/stories/%' },
    { url: '/stories/a?match=' },
    { url: '/stories/a?unknown=1' },
    { path: ['stories', 'a'], query: [42] },
    'not a host-context object',
  ]) {
    assert.ok(
      readerLinkRequest(input) && 'error' in (readerLinkRequest(input) ?? {}),
    );
  }
  assert.deepEqual(readerLinkRequest({ url: '/stories/%2e%2e' }), {
    target: { storyId: '..', matchedChapterIds: [] },
  });
});
