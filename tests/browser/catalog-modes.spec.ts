import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { nativeSwipe } from '../helpers/touch.js';
import { snapshotSchema } from '../../src/shared/contracts.js';

test.beforeEach(async ({ request }) => {
  await request.post('/api/tools', {
    data: { name: 'reader_clear_history', arguments: {} },
  });
  await request.post('/api/tools', {
    data: {
      name: 'reader_settings',
      arguments: {
        autoImages: false,
        retentionDays: 7,
        theme: 'system',
        catalogMode: 'type',
      },
    },
  });
});

test('catalog modes retain all stories, persist preference, and return from a between-story link to the source position and focus', async ({
  page,
  request,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('.movement-badge').first()).toHaveText('雾中档案');
  await expect(page.locator('.story-card')).toHaveCount(3);
  await page.getByRole('radio', { name: '按乐章', exact: true }).check();
  const track = page.getByRole('region', { name: '雾中档案剧情轴' });
  await expect(track.locator('.score-axis > *')).toHaveClass([
    /score-story/,
    /score-junction/,
    /score-story/,
  ]);
  const junction = track.getByRole('button', {
    name: '跳转到远行记录：长路回声',
  });
  await junction.click();
  await expect(page.locator('.score-highlight')).toHaveAttribute(
    'data-story-id',
    'fixture-road',
  );
  await expect(
    page.getByRole('button', { name: '打开剧情：长路回声', exact: true }),
  ).toBeFocused();
  await page
    .getByRole('button', { name: '↩ 返回雾中档案', exact: true })
    .click();
  await expect(junction).toBeFocused();
  const snapshot = snapshotSchema.parse(
    await (
      await request.post('/api/tools', {
        data: { name: 'reader_snapshot', arguments: {} },
      })
    ).json(),
  );
  expect(snapshot.state.records).toEqual({});
  expect(snapshot.state.recentChapterId).toBeNull();
  await expect
    .poll(
      async () =>
        snapshotSchema.parse(
          await (
            await request.post('/api/tools', {
              data: { name: 'reader_snapshot', arguments: {} },
            })
          ).json(),
        ).state.settings.catalogMode,
    )
    .toBe('movement');
  await page.reload();
  await expect(
    page.getByRole('radio', { name: '按乐章', exact: true }),
  ).toBeChecked();
  await expect(page.locator('.story-card')).toHaveCount(3);
  await page.setViewportSize({ width: 1024, height: 400 });
  await page.getByRole('button', { name: '远行记录', exact: true }).click();
  await page
    .getByRole('button', { name: '跳转到雾中档案：灯火与归途', exact: true })
    .click();
  const target = await page.locator('.score-highlight').boundingBox();
  const bounds = await page.locator('.library-scroll').boundingBox();
  if (!target || !bounds) throw Error('Missing linked target');
  expect(target.y).toBeGreaterThanOrEqual(bounds.y);
  expect(target.y + target.height).toBeLessThanOrEqual(
    bounds.y + bounds.height,
  );
});

test('movement axis supports range, mouse drag without opening, keyboard and independent mode scroll positions', async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 760 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('radio', { name: '按乐章', exact: true }).check();
  const track = page.getByRole('region', { name: '雾中档案剧情轴' });
  const range = page.getByRole('slider', { name: '雾中档案浏览线' });
  await range.focus();
  await page.keyboard.press('End');
  await expect
    .poll(() => track.evaluate((node) => Math.round(node.scrollLeft)))
    .toBeGreaterThan(0);
  await range.focus();
  await page.keyboard.press('Home');
  await expect
    .poll(() => track.evaluate((node) => Math.round(node.scrollLeft)))
    .toBe(0);
  await page.locator('.library-scroll').evaluate((node) => {
    node.scrollTop = 0;
  });
  const card = track.locator('.story-card').first();
  const box = await card.boundingBox();
  if (!box) throw Error('Missing story card');
  await page.mouse.move(box.x + 240, box.y + 50);
  await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + 50, { steps: 10 });
  await page.mouse.up();
  await expect(
    page.getByRole('heading', { name: '剧情档案', exact: true }),
  ).toBeVisible();
  const left = await track.evaluate((node) => node.scrollLeft);
  expect(left).toBeGreaterThan(100);
  await page.getByRole('radio', { name: '按类型', exact: true }).check();
  await page.getByRole('radio', { name: '按乐章', exact: true }).check();
  await expect
    .poll(() => track.evaluate((node) => node.scrollLeft))
    .toBeCloseTo(left, 0);
  expect(
    await track.evaluate((node) => getComputedStyle(node).scrollbarWidth),
  ).toBe('none');
  await range.focus();
  await page.keyboard.press('End');
  await track.getByRole('button', { name: '打开剧情：灯火与归途' }).click();
  await expect(
    page.getByRole('heading', { name: '灯火与归途', exact: true }),
  ).toBeVisible();
});

test('score failures have their own retry and never remove the usable type catalog', async ({
  page,
}) => {
  let fail = true;
  await page.route('**/api/tools', async (route) => {
    const input = route.request().postDataJSON();
    if (
      input.name === 'reader_snapshot' &&
      input.arguments?.includeScore &&
      fail
    ) {
      const response = await route.fetch();
      await route.fulfill({
        response,
        json: {
          ...(await response.json()),
          score: { status: 'failed', message: 'Original source failure' },
        },
      });
      return;
    }
    await route.continue();
  });
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: '重试乐章资料' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: '打开剧情：雾中来信' }),
  ).toBeVisible();
  fail = false;
  await page.getByRole('button', { name: '重试乐章资料' }).click();
  await expect(page.locator('.movement-badge').first()).toHaveText('雾中档案');
});

test('manual chrome changes retain the visible body anchor and wide-screen arrows stay outside the text', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: '打开剧情：雾中来信' }).click();
  await page
    .getByRole('button', { name: '阅读 档案 01 一封未寄出的信' })
    .click();
  await page.locator('.reader-scroll').evaluate((node) => {
    node.scrollTop = 600;
  });
  const anchor = await page.locator('.reader-scroll').evaluate((node) => {
    const top = node.getBoundingClientRect().top;
    const block = Array.from(
      node.querySelectorAll<HTMLElement>('[data-block]'),
    ).find((item) => item.getBoundingClientRect().bottom > top);
    if (!block) throw Error('Missing visible block');
    return { id: block.dataset.block, top: block.getBoundingClientRect().top };
  });
  await page
    .getByRole('button', { name: '收起顶部工具栏', exact: true })
    .click();
  expect(
    Math.abs(
      (await page
        .locator(`[data-block="${anchor.id}"]`)
        .evaluate((node) => node.getBoundingClientRect().top)) - anchor.top,
    ),
  ).toBeLessThanOrEqual(1);
  await page
    .getByRole('button', { name: '展开顶部工具栏', exact: true })
    .click();
  expect(
    Math.abs(
      (await page
        .locator(`[data-block="${anchor.id}"]`)
        .evaluate((node) => node.getBoundingClientRect().top)) - anchor.top,
    ),
  ).toBeLessThanOrEqual(1);
  await expect(page.getByRole('button', { name: /^向后阅读：/ })).toBeVisible();
  const arrow = await page.locator('.reader-side-next').boundingBox();
  const body = await page.locator('.body-copy').boundingBox();
  if (!arrow || !body) throw Error('Missing reading layout');
  expect(arrow.x).toBeGreaterThan(body.x + body.width);
  // A narrow desktop sidebar still uses the explicit button; automatic hiding
  // belongs to narrow touch devices, rather than every small desktop window.
  await page.setViewportSize({ width: 320, height: 760 });
  await page.locator('.reader-scroll').evaluate((node) => {
    node.scrollTop = 200;
  });
  await page.waitForTimeout(200);
  await page.locator('.reader-scroll').evaluate((node) => {
    node.scrollTop = 500;
  });
  await expect(page.locator('#reader-chrome')).toBeVisible();
});

test('shared movement and chrome layouts fit four windows and both themes, including reduced motion and keyboard controls', async ({
  page,
}) => {
  await mkdir('.ai/local/score-implementation/screenshots', {
    recursive: true,
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('radio', { name: '按乐章', exact: true }).check();
  for (const [width, height] of [
    [320, 760],
    [768, 900],
    [1440, 960],
    [1024, 400],
  ] as const) {
    await page.setViewportSize({ width, height });
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme });
      await page.locator('.library-scroll').evaluate((node) => {
        node.scrollTop = 0;
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const track = page.getByRole('region', { name: '雾中档案剧情轴' });
      const cards = await track.locator('.story-card').evaluateAll((nodes) =>
        nodes.map((node) => ({
          x: node.getBoundingClientRect().x,
          y: node.getBoundingClientRect().y,
        })),
      );
      if (width <= 600) {
        expect(cards[1]?.y).toBeGreaterThan(cards[0]?.y ?? 0);
        await expect(
          page.getByRole('combobox', { name: '选择乐章' }),
        ).toBeVisible();
        await expect(
          page.getByRole('slider', { name: '雾中档案浏览线' }),
        ).toBeHidden();
      }
      await page.screenshot({
        path: `.ai/local/score-implementation/screenshots/movements-${width}-${height}-${colorScheme}.png`,
      });
      await page
        .getByRole('button', { name: '收起顶部工具栏', exact: true })
        .focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('#reader-chrome')).toBeHidden();
      await page
        .getByRole('button', { name: '展开顶部工具栏', exact: true })
        .click();
      await expect(page.locator('#reader-chrome')).toBeVisible();
    }
  }
});

test('mobile vertical scrolling hides chrome, deliberate horizontal release changes chapter, and selection and edge gestures stay in place', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  try {
    await page.goto('/');
    await page.getByRole('button', { name: '打开剧情：雾中来信' }).tap();
    await page
      .getByRole('button', { name: '阅读 档案 01 一封未寄出的信' })
      .tap();
    await expect(
      page.getByRole('heading', { name: '一封未寄出的信', exact: true }),
    ).toBeVisible();
    await page.waitForTimeout(250);
    await nativeSwipe(page, { x: 260, y: 650 }, { x: 260, y: 320 });
    await expect(
      page.getByRole('button', { name: '展开顶部工具栏', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: '一封未寄出的信', exact: true }),
    ).toBeAttached();
    await nativeSwipe(page, { x: 260, y: 360 }, { x: 260, y: 470 });
    await expect(
      page.getByRole('button', { name: '收起顶部工具栏', exact: true }),
    ).toBeVisible();
    await page.waitForTimeout(500);
    await page
      .getByRole('button', { name: '收起顶部工具栏', exact: true })
      .tap();
    await expect(page.locator('#reader-chrome')).toBeHidden();
    await nativeSwipe(page, { x: 260, y: 360 }, { x: 260, y: 470 });
    await expect(page.locator('#reader-chrome')).toBeHidden();
    await nativeSwipe(page, { x: 260, y: 430 }, { x: 215, y: 432 });
    await expect(
      page.getByRole('heading', { name: '一封未寄出的信', exact: true }),
    ).toBeAttached();
    await nativeSwipe(page, { x: 8, y: 430 }, { x: 160, y: 432 });
    await expect(
      page.getByRole('heading', { name: '一封未寄出的信', exact: true }),
    ).toBeAttached();
    await page.locator('.body-copy').evaluate((node) => {
      const selection = getSelection();
      const range = document.createRange();
      range.selectNodeContents(node.firstElementChild ?? node);
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
    await nativeSwipe(page, { x: 290, y: 430 }, { x: 100, y: 432 });
    await expect(
      page.getByRole('heading', { name: '一封未寄出的信', exact: true }),
    ).toBeAttached();
    await page.evaluate(() => getSelection()?.removeAllRanges());
    const multiTouch = await context.newCDPSession(page);
    await multiTouch.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ id: 0, x: 290, y: 430 }],
    });
    await multiTouch.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ id: 0, x: 100, y: 432 }],
    });
    await multiTouch.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { id: 0, x: 100, y: 432 },
        { id: 1, x: 190, y: 432 },
      ],
    });
    await multiTouch.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await multiTouch.detach();
    await expect(
      page.getByRole('heading', { name: '一封未寄出的信', exact: true }),
    ).toBeAttached();
    await nativeSwipe(page, { x: 290, y: 430 }, { x: 100, y: 432 });
    await expect(
      page.getByRole('heading', { name: '钟楼的方向', exact: true }),
    ).toBeVisible();
    await expect(page.locator('.reader-end button')).toHaveCount(0);
    await expect(page.locator('.reader-side-turn').first()).toBeHidden();
    await page
      .getByRole('button', { name: '展开顶部工具栏', exact: true })
      .tap();
    await page.getByRole('button', { name: /^上一篇：/ }).tap();
    await expect(
      page.getByRole('heading', { name: '一封未寄出的信', exact: true }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});
