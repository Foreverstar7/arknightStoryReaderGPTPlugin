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
// explicit test injections, not claims about those sources. Story preparation is
// disabled only in these cover tests; the S4 suites verify real preparation.
async function limitCovers(page: Page, allowed: string[]) {
  await page.route('**/api/tools', async (route) => {
    const data = route.request().postDataJSON();
    const input = imageInputSchema.safeParse(data.arguments);
    if (data.name === 'reader_prepare_chapter')
      await route.fulfill({
        status: 400,
        json: { code: 'unsupported', error: '封面专项测试不运行正文准备。' },
      });
    else if (
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

test('all approved remaining covers decode in full; text covers never request images; both pages preserve geometry, state and navigation', async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  const before = snapshotSchema.parse(
    await (
      await request.post('/api/tools', {
        data: { name: 'reader_snapshot', arguments: {} },
      })
    ).json(),
  );
  const mainTitles = [
    '黑暗时代·上',
    '黑暗时代·下',
    '异卵同生',
    '二次呼吸',
    '急性衰竭',
  ];
  const textIds = ['prts:主线剧情/特殊 · 剧情', 'prts:活动剧情/特殊 · 剧情'];
  const crisisId = 'prts:活动剧情/特殊 · 危机合约';
  const samples = before.stories.filter(
    (story) =>
      story.type === '四月辑录' ||
      mainTitles.includes(story.title) ||
      story.title === '日暮寻路' ||
      story.id === crisisId ||
      textIds.includes(story.id),
  );
  expect(samples).toHaveLength(16);
  expect(
    samples
      .filter((story) => textIds.includes(story.id))
      .map((story) => story.chapters.length),
  ).toEqual([8, 3]);
  expect(samples.find((story) => story.id === crisisId)?.chapters).toHaveLength(
    3,
  );
  const calls: { kind?: string; storyId?: string; name: string }[] = [];
  page.on('request', (req) => {
    if (req.url().endsWith('/api/tools')) {
      const data = req.postDataJSON();
      calls.push({ name: data.name, ...data.arguments });
    }
  });
  await limitCovers(
    page,
    samples.map((story) => story.id),
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await mkdir('.ai/local/screenshots', { recursive: true });
  for (const [index, story] of samples.entries()) {
    const card = page.locator(`[data-story-id="${story.id}"]`);
    await card.scrollIntoViewIfNeeded();
    const isText = textIds.includes(story.id);
    if (isText) {
      await expect(card.locator('[data-cover-kind="text"]')).toBeVisible();
      await expect(card.getByRole('img')).toHaveAccessibleName(
        /补充剧情 · 应用文字封面/u,
      );
      await expect(
        card.locator('.image-error,.image-loading,.image-idle,.image-deferred'),
      ).toHaveCount(0);
    } else {
      await expect(card.getByRole('img')).toBeVisible({ timeout: 30_000 });
      const decoded = await card.locator('image').evaluate(async (node) => {
        const image = new Image();
        image.src = node.getAttribute('href') ?? '';
        await image.decode();
        return {
          width: image.naturalWidth,
          height: image.naturalHeight,
          mime: image.src.split(';')[0],
          bytes: atob(image.src.split(',')[1] ?? '').length,
        };
      });
      const isMain = mainTitles.includes(story.title);
      const isCrisis = story.id === crisisId;
      expect([decoded.width, decoded.height]).toEqual(
        isMain ? [512, 512] : isCrisis ? [463, 121] : [1560, 500],
      );
      expect(decoded.mime).toBe(
        story.title === '日暮寻路' ? 'data:image/jpeg' : 'data:image/png',
      );
      if (story.title === '日暮寻路') expect(decoded.bytes).toBe(17_835_330);
      await expect(card.getByRole('img')).toHaveAttribute(
        'preserveAspectRatio',
        'xMidYMid meet',
      );
      await expect(card.getByRole('img')).toHaveAttribute(
        'data-cover-presentation',
        isMain || isCrisis ? 'contain' : 'banner',
      );
      await expect(card.getByRole('img')).toHaveAttribute(
        'data-source-url',
        /^https:\/\/prts.wiki\/w\//u,
      );
    }
    await card.getByRole('button', { name: /^打开剧情/u }).focus();
    await page.keyboard.press('Enter');
    const mini = page.locator('.mini-cover .cover');
    await expect(mini.getByRole('img')).toBeVisible({ timeout: 30_000 });
    await expect(mini.locator('.image-error,.image-deferred')).toHaveCount(0);
    if (!isText)
      await mini.locator('image').evaluate(async (node) => {
        const image = new Image();
        image.src = node.getAttribute('href') ?? '';
        await image.decode();
      });
    await page.screenshot({
      path: `.ai/local/screenshots/remaining-cover-${index}.png`,
    });
    await page.getByRole('button', { name: '⌂ 主页', exact: true }).click();
    await expect(card).toBeInViewport();
  }
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    for (const viewport of [
      { width: 320, height: 760 },
      { width: 768, height: 900 },
      { width: 1440, height: 900 },
      { width: 1024, height: 400 },
    ]) {
      await page.setViewportSize(viewport);
      for (const id of ['prts:黑暗时代·上', textIds[0], crisisId]) {
        const card = page.locator(`[data-story-id="${id}"]`);
        await card.scrollIntoViewIfNeeded();
        const frame = await card.locator('.cover').boundingBox();
        if (!frame) throw new Error('missing home cover');
        expect(frame.width / frame.height).toBeCloseTo(1560 / 500, 2);
        await card.getByRole('button', { name: /^打开剧情/u }).click();
        const mini = page.locator('.mini-cover .cover');
        await expect(mini.getByRole('img')).toBeVisible();
        const box = await mini.boundingBox();
        if (!box) throw new Error('missing chapter cover');
        expect(box.width / box.height).toBeCloseTo(1560 / 500, 2);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBe(viewport.width);
        await page.screenshot({
          path: `.ai/local/screenshots/remaining-${id === crisisId ? 'logo' : id === textIds[0] ? 'text' : 'square'}-${colorScheme}-${viewport.width}x${viewport.height}.png`,
        });
        await page.getByRole('button', { name: '⌂ 主页', exact: true }).click();
        await expect(card).toBeInViewport();
      }
    }
  }
  expect(calls.filter((call) => call.name === 'reader_chapter')).toEqual([]);
  expect(
    calls.filter(
      (call) =>
        call.name === 'reader_image' && textIds.includes(call.storyId ?? ''),
    ),
  ).toEqual([]);
  const after = snapshotSchema.parse(
    await (
      await request.post('/api/tools', {
        data: { name: 'reader_snapshot', arguments: {} },
      })
    ).json(),
  );
  expect(after.stories).toEqual(before.stories);
  expect(after.state).toEqual(before.state);
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
      // Inject a declared banner with corrupt bytes to exercise browser decode retry.
      await route.fulfill({
        json: {
          width: 1560,
          height: 500,
          resource: 'original.png',
          sourceUrl: 'https://prts.wiki/w/File:original.png',
          layers: [
            {
              dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB',
              sourceUrl: 'https://media.prts.wiki/original.png',
              x: 0,
              y: 0,
              width: 1560,
              height: 500,
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
  // Clearing storage also invalidates cover reuse for a new page; the visible
  // image stays in place while a later mount can independently fail and retry.
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page
    .getByRole('button', { name: '清理全部内容缓存', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText('阅读记录已保留');
  await page.keyboard.press('Escape');
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

test('returning home preserves loaded covers in the incoming snapshot without re-fetching or exposing hidden library controls', async ({
  page,
}) => {
  await limitCovers(page, [targetId]);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    const original = document.startViewTransition.bind(document);
    document.startViewTransition = (update) =>
      original(async () => {
        if (typeof update === 'function') await update();
        else await update?.update?.();
        const library = document.querySelector('.library-scroll');
        if (library && library.getClientRects().length > 0)
          document.documentElement.dataset.homeCoverState =
            library
              .querySelector(
                '[data-story-id="prts:骑兵与猎人"] [data-image-state]',
              )
              ?.getAttribute('data-image-state') ?? 'missing';
      });
  });
  const calls: string[] = [];
  page.on('request', (request) => {
    if (!request.url().endsWith('/api/tools')) return;
    const data = request.postDataJSON();
    if (data.name === 'reader_image')
      calls.push(JSON.stringify(data.arguments));
  });
  await page.goto('/');
  const card = targetCard(page);
  await card.scrollIntoViewIfNeeded();
  await expect(card.getByRole('img')).toBeVisible();
  const position = await page
    .locator('.library-scroll')
    .evaluate((node) => node.scrollTop);
  await card.getByRole('button', { name: '打开剧情：骑兵与猎人' }).click();
  await expect(page.locator('.mini-cover').getByRole('img')).toBeVisible();
  await expect(page.locator('.library')).toBeHidden();
  await expect(
    page.getByRole('button', { name: '打开剧情：骑兵与猎人' }),
  ).toHaveCount(0);
  await expect(page.locator('.library .source-image')).not.toHaveCount(0);
  const beforeReturn = calls.length;
  await page.getByRole('button', { name: '⌂ 主页', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute(
    'data-home-cover-state',
    'ready',
  );
  await expect(card.getByRole('img')).toBeVisible();
  await expect
    .poll(() =>
      page.locator('.library-scroll').evaluate((node) => node.scrollTop),
    )
    .toBe(position);
  await page.evaluate(async () => {
    await Promise.allSettled(
      document.getAnimations().map((animation) => animation.finished),
    );
  });
  expect(calls.length).toBe(beforeReturn);
  await page.screenshot({
    path: '.ai/local/screenshots/home-banner-return.png',
  });
});

test('approved square, logo, text and large banner persist in the first chapter snapshot and survive rapid navigation and resize', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const ids = [
    'prts:黑暗时代·上',
    'prts:活动剧情/特殊 · 危机合约',
    'prts:主线剧情/特殊 · 剧情',
    'prts:日暮寻路',
  ];
  await limitCovers(page, ids);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    const original = document.startViewTransition.bind(document);
    document.startViewTransition = (update) =>
      original(async () => {
        if (typeof update === 'function') await update();
        else await update?.update?.();
        const cover = document.querySelector('.mini-cover .cover');
        if (cover)
          document.documentElement.dataset.chapterCoverSnapshot =
            cover.getAttribute('data-cover-kind') === 'text'
              ? 'text'
              : (cover
                  .querySelector('[data-image-state]')
                  ?.getAttribute('data-image-state') ?? 'missing');
      });
  });
  const imageCalls: string[] = [];
  page.on('request', (req) => {
    if (
      req.url().endsWith('/api/tools') &&
      req.postDataJSON().name === 'reader_image'
    )
      imageCalls.push(req.postDataJSON().arguments.storyId);
  });
  await page.goto('/');
  for (const id of ids) {
    const card = page.locator(`[data-story-id="${id}"]`);
    await card.scrollIntoViewIfNeeded();
    await expect(card.getByRole('img')).toBeVisible({ timeout: 30_000 });
    const before = imageCalls.filter((value) => value === id).length;
    await card.getByRole('button', { name: /^打开剧情/u }).click();
    await expect(page.locator('html')).toHaveAttribute(
      'data-chapter-cover-snapshot',
      id.includes('主线剧情/') ? 'text' : 'ready',
    );
    await page.setViewportSize({ width: 768, height: 640 });
    await expect(page.locator('.mini-cover').getByRole('img')).toBeVisible();
    await page.getByRole('button', { name: '⌂ 主页', exact: true }).click();
    await expect(card).toBeInViewport();
    await card.getByRole('button', { name: /^打开剧情/u }).click();
    await page.getByRole('button', { name: '⌂ 主页', exact: true }).click();
    await expect(card).toBeInViewport();
    await page.evaluate(async () => {
      await Promise.allSettled(document.getAnimations().map((a) => a.finished));
    });
    expect(imageCalls.filter((value) => value === id).length).toBe(before);
    await expect(card.getByRole('img')).toBeVisible();
  }
});

test('a cover response started before clearing cannot repopulate image reuse for later pages', async ({
  page,
}) => {
  const id = 'prts:黑暗时代·上';
  await limitCovers(page, [id]);
  let release: (() => void) | undefined;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  let ready = false;
  let calls = 0;
  await page.route('**/api/tools', async (route) => {
    const data = route.request().postDataJSON();
    if (data.name !== 'reader_image' || data.arguments.storyId !== id) {
      await route.fallback();
      return;
    }
    calls++;
    if (calls === 1) {
      const response = await route.fetch();
      ready = true;
      await blocked;
      await route.fulfill({ response });
    } else await route.fallback();
  });
  try {
    await page.goto('/');
    const card = page.locator(`[data-story-id="${id}"]`);
    await card.scrollIntoViewIfNeeded();
    await expect.poll(() => ready).toBe(true);
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page
      .getByRole('button', { name: '清理全部内容缓存', exact: true })
      .click();
    await expect(page.getByRole('status')).toContainText('阅读记录已保留');
    await page.keyboard.press('Escape');
    if (!release) throw new Error('missing response gate');
    release();
    await expect(card.getByRole('img')).toBeVisible();
    await card.getByRole('button', { name: /^打开剧情/u }).click();
    await expect(page.locator('.mini-cover').getByRole('img')).toBeVisible();
    expect(calls).toBe(2);
  } finally {
    release?.();
  }
});
