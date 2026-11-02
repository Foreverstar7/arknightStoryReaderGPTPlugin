import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import {
  imageInputSchema,
  snapshotSchema,
} from '../../src/shared/contracts.js';
import type { ReaderFailure } from '../../src/shared/errors.js';

const targetId = 'prts:骑兵与猎人';
const targetCard = (page: Page) =>
  page.locator(`[data-story-id="${targetId}"]`);

// Limit new cover scenarios to their named public samples. Other cover responses are
// explicit test injections, not claims about those sources; no unread bodies are fetched.
async function limitCovers(page: Page, allowed: string[]) {
  await page.route('**/api/tools', async (route) => {
    const data = route.request().postDataJSON();
    const input = imageInputSchema.safeParse(data.arguments);
    if (
      data.name === 'reader_image' &&
      input.success &&
      input.data.kind === 'cover' &&
      !allowed.includes(input.data.storyId)
    )
      await route.fulfill({
        status: 400,
        json: { code: 'unsupported', error: '测试限制：仅核对指定封面样本。' },
      });
    else await route.continue();
  });
}

test.beforeEach(async ({ request, page }) => {
  await request.post('/api/tools', {
    data: { name: 'reader_clear_history', arguments: {} },
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('real JPEG, grouped PNG and April year illustrations resolve; main logos stay unsupported, without fetching chapter bodies', async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const ids = [
    targetId,
    'prts:黑暗时代·上',
    'prts:活动剧情/集成战略 · 傀影与猩红孤钻',
    'prts:活动剧情/生息演算 · 沙中之火',
    'prts:活动剧情/四月辑录 · 断罪者的挑战状',
    'prts:活动剧情/集成战略 · 刻俄柏的灰蕈迷境',
    'prts:局部坏死',
  ];
  const bodies: string[] = [];
  page.on('request', (req) => {
    if (
      req.url().endsWith('/api/tools') &&
      req.postDataJSON().name === 'reader_chapter'
    )
      bodies.push(req.url());
  });
  await limitCovers(page, ids);
  await page.goto('/');
  const main = page.locator(`[data-story-id="${ids[1]}"]`);
  await expect(main.locator('[data-error-code="unsupported"]')).toContainText(
    '封面来源待适配',
  );
  await expect(main.locator('.image-error')).toHaveAttribute(
    'data-source-url',
    /#EP00$/u,
  );
  for (const id of [targetId, ids[2], ids[3], ids[4], ids[5], ids[6]]) {
    const card = page.locator(`[data-story-id="${id}"]`);
    await card.scrollIntoViewIfNeeded();
    await expect(card.getByRole('img')).toBeVisible();
    await expect(card.getByRole('img')).toHaveAttribute(
      'data-source-url',
      /^https:\/\/prts.wiki\/w\//u,
    );
    const decoded = await card.locator('image').evaluate(async (node) => {
      const image = new Image();
      const href = node.getAttribute('href') ?? '';
      image.src = href;
      await image.decode();
      return {
        mime: href.split(';')[0],
        width: image.naturalWidth,
        height: image.naturalHeight,
      };
    });
    expect(decoded.width).toBeGreaterThan(100);
    expect(decoded.height).toBeGreaterThan(100);
    if (id === ids[5] || id === ids[6])
      expect(decoded.mime).toBe('data:image/jpeg');
    else expect(decoded.mime).toBe('data:image/png');
    if (id === ids[5]) {
      await mkdir('.ai/local/screenshots', { recursive: true });
      await page.screenshot({
        path: '.ai/local/screenshots/covers-jpeg-real.png',
      });
    }
    if (id === ids[2]) {
      await mkdir('.ai/local/screenshots', { recursive: true });
      await page.screenshot({
        path: '.ai/local/screenshots/covers-real-grouped.png',
      });
    }
  }
  const april = page.locator(`[data-story-id="${ids[4]}"]`);
  await expect(april.getByRole('img')).toHaveAttribute(
    'data-source-url',
    /#2020$/u,
  );
  expect(bodies).toEqual([]);
  const snapshot = snapshotSchema.parse(
    await (
      await request.post('/api/tools', {
        data: { name: 'reader_snapshot', arguments: {} },
      })
    ).json(),
  );
  expect(snapshot.state.records).toEqual({});
  expect(snapshot.stories).toHaveLength(117);
  expect(
    snapshot.stories.reduce((count, story) => count + story.chapters.length, 0),
  ).toBe(1756);
});

test('idle/loading, typed failures and independent mouse/keyboard retries fit both themes and all supported viewports', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await limitCovers(page, [targetId]);
  const calls: { refresh?: boolean }[] = [];
  const bodies: string[] = [];
  const failures: [ReaderFailure['code'], string][] = [
    ['network', '封面请求失败'],
    ['parse', '封面解析不兼容'],
    ['resource_missing', '封面资源缺失'],
    ['unsupported', '封面来源待适配'],
    ['not_found', '封面资料页缺失'],
  ];
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/tools', async (route) => {
    const data = route.request().postDataJSON();
    if (data.name === 'reader_chapter') bodies.push('body');
    const input = imageInputSchema.safeParse(data.arguments);
    if (
      data.name !== 'reader_image' ||
      !input.success ||
      input.data.kind !== 'cover' ||
      input.data.storyId !== targetId
    ) {
      await route.fallback();
      return;
    }
    const failure = failures[calls.length];
    calls.push(input.data);
    if (calls.length === 1) await gate;
    if (failure)
      await route.fulfill({
        status: 400,
        json: {
          code: failure[0],
          error: '测试：相同提示文本，仅通过错误码区分。',
          sourceUrl: 'https://prts.wiki/w/Original',
        },
      });
    else await route.fallback();
  });
  await page.goto('/');
  const card = targetCard(page);
  await expect(card.locator('[data-image-state="idle"]')).toHaveCount(1);
  expect(calls).toHaveLength(0);
  await card.scrollIntoViewIfNeeded();
  await expect(card.locator('[data-image-state="loading"]')).toBeVisible();
  release();
  for (const [index, [code, label]] of failures.entries()) {
    await expect(card.locator(`[data-error-code="${code}"]`)).toContainText(
      label,
    );
    expect(await page.locator('button button').count()).toBe(0);
    const retry = card.getByRole('button', { name: '重试骑兵与猎人 封面' });
    if (code === 'parse') {
      await mkdir('.ai/local/screenshots', { recursive: true });
      for (const theme of ['light', 'dark'] as const) {
        await page.emulateMedia({
          colorScheme: theme,
          reducedMotion: 'reduce',
        });
        for (const viewport of [
          { width: 320, height: 760 },
          { width: 768, height: 900 },
          { width: 1440, height: 900 },
          { width: 1024, height: 400 },
        ]) {
          await page.setViewportSize(viewport);
          await card.scrollIntoViewIfNeeded();
          const coverBox = await card.locator('.cover').boundingBox();
          const retryBox = await retry.boundingBox();
          if (!coverBox || !retryBox)
            throw new Error('封面或重试缺少可操作区域');
          expect(retryBox.y).toBeGreaterThanOrEqual(coverBox.y);
          expect(retryBox.y + retryBox.height).toBeLessThanOrEqual(
            coverBox.y + coverBox.height,
          );
          expect(retryBox.height).toBeGreaterThanOrEqual(24);
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth),
          ).toBe(viewport.width);
          await retry.focus();
          await page.keyboard.press('Tab');
          await page.keyboard.press('Shift+Tab');
          await expect(retry).toBeFocused();
          await expect(retry).toHaveCSS('outline-style', 'solid');
          await page.screenshot({
            path: `.ai/local/screenshots/covers-error-${theme}-${viewport.width}x${viewport.height}.png`,
          });
        }
      }
    }
    if (index % 2 === 0) await retry.click();
    else {
      await retry.focus();
      await page.keyboard.press('Enter');
    }
    await expect(page.getByRole('heading', { name: '剧情档案' })).toBeVisible();
    expect(bodies).toEqual([]);
  }
  await expect(card.getByRole('img')).toBeVisible();
  expect(calls[0]?.refresh).toBeUndefined();
  expect(calls.slice(1).every((call) => call.refresh === true)).toBe(true);
  await card.getByRole('button', { name: '打开剧情：骑兵与猎人' }).focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('region', { name: '横向篇目轴' })).toBeVisible();
  expect(bodies).toEqual([]);
});

test('a decodable-result failure retries the asset, and the chapter-list cover has its own keyboard retry without opening a body', async ({
  page,
}) => {
  await limitCovers(page, [targetId]);
  let requests = 0;
  let miniFailure = false;
  let bodies = 0;
  await page.route('**/api/tools', async (route) => {
    const data = route.request().postDataJSON();
    if (data.name === 'reader_chapter') bodies++;
    if (data.name !== 'reader_image' || data.arguments.storyId !== targetId) {
      await route.fallback();
      return;
    }
    requests++;
    if (requests === 1) {
      // A truncated PNG passes the server's header check but cannot be decoded.
      await route.fulfill({
        json: {
          width: 1,
          height: 1,
          resource: 'original.png',
          sourceUrl: 'https://prts.wiki/w/File:original.png',
          layers: [
            {
              dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB',
              sourceUrl: 'https://media.prts.wiki/original.png',
              x: 0,
              y: 0,
              width: 1,
              height: 1,
            },
          ],
        },
      });
    } else if (miniFailure) {
      miniFailure = false;
      await route.fulfill({
        status: 400,
        json: { code: 'network', error: '测试：篇目页封面请求失败' },
      });
    } else await route.fallback();
  });
  await page.goto('/');
  const card = targetCard(page);
  await card.scrollIntoViewIfNeeded();
  await expect(card.locator('[data-error-code="parse"]')).toHaveAttribute(
    'title',
    /解码失败/u,
  );
  await card.getByRole('button', { name: /^重试/u }).click();
  await expect(card.getByRole('img')).toBeVisible();
  miniFailure = true;
  await card.getByRole('button', { name: '打开剧情：骑兵与猎人' }).click();
  const cover = page.locator('.mini-cover');
  await expect(cover.locator('[data-error-code="network"]')).toBeVisible();
  await page.setViewportSize({ width: 320, height: 760 });
  const retry = cover.getByRole('button', { name: /^重试/u });
  await retry.focus();
  await page.keyboard.press('Enter');
  await expect(cover.getByRole('img')).toBeVisible();
  await expect(page.getByRole('region', { name: '横向篇目轴' })).toBeVisible();
  expect(bodies).toBe(0);
});
