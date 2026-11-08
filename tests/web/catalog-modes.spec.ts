import { test, expect } from '@playwright/test';
import { installSource, storedState, title } from './source.js';
import { nativeSwipe } from '../helpers/touch.js';

test('web movement metadata and preference survive reload while bodies stay session-only; narrow/wide reflow keeps all cards', async ({
  page,
}) => {
  const source = await installSource(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  await expect(page.locator('.movement-badge')).toHaveText('原创乐章');
  await page.getByRole('radio', { name: '按乐章', exact: true }).check();
  await expect(
    page.getByRole('region', { name: '原创乐章剧情轴' }),
  ).toBeVisible();
  expect((await storedState(page)).records).toEqual({});
  await expect
    .poll(async () => (await storedState(page)).settings.catalogMode)
    .toBe('movement');
  await page.reload();
  await expect(
    page.getByRole('radio', { name: '按乐章', exact: true }),
  ).toBeChecked();
  await expect(page.locator('.story-card')).toHaveCount(1);
  for (const [width, height] of [
    [320, 760],
    [768, 900],
    [1440, 960],
    [1024, 400],
  ] as const) {
    await page.setViewportSize({ width, height });
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page
        .getByRole('button', { name: '收起顶部工具栏', exact: true })
        .click();
      await expect(page.locator('.web-bar')).toBeHidden();
      await page
        .getByRole('button', { name: '展开顶部工具栏', exact: true })
        .click();
      await expect(page.locator('.web-bar')).toBeVisible();
    }
  }
  expect(
    source.calls.filter(
      (call) => new URL(call).searchParams.get('titles') === '关卡一览/曲谱',
    ).length,
  ).toBeGreaterThan(0);
});

test('web native mobile gestures reclaim the site header, preview and switch chapters, and save an unfinished original chapter', async ({
  browser,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'Native CDP touch input is Chromium-only; button and layout behavior are checked in both engines.',
  );
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: 'reduce',
  });
  try {
    const page = await context.newPage();
    await installSource(page);
    await page.goto('./');
    await page
      .getByRole('button', { name: `打开剧情：${title}`, exact: true })
      .tap();
    await page.getByRole('button', { name: /^阅读 WX-1 / }).tap();
    await expect(
      page.getByRole('main', { name: '剧情正文', exact: true }),
    ).toBeVisible();
    await page.waitForTimeout(250);
    await nativeSwipe(page, { x: 260, y: 650 }, { x: 260, y: 320 });
    await expect(page.locator('.web-bar')).toBeVisible();
    await page.waitForTimeout(500);
    await page
      .getByRole('button', { name: '收起顶部工具栏', exact: true })
      .tap();
    await expect(page.locator('.web-bar')).toBeHidden();
    expect(
      await page
        .locator('.reader-scroll')
        .evaluate((node) => node.clientHeight),
    ).toBeGreaterThan(500);
    await page.screenshot({
      path: test.info().outputPath('manual-mobile.png'),
    });
    const first = Object.values((await storedState(page)).records)[0];
    if (!first) throw Error('Missing original record');
    expect(first.complete).toBe(false);
    // Stop before release to inspect the live preview; this is genuine browser input.
    const session = await context.newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: 290, y: 430 }],
    });
    for (const x of [270, 245, 215, 180, 140, 100]) {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y: 432 }],
      });
      await page.waitForTimeout(30);
    }
    await expect(page.locator('.swipe-preview')).toContainText('回声');
    await expect(page.locator('.swipe-preview')).toContainText('松手切换');
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await session.detach();
    await expect(page.locator('.reading-heading h1')).toHaveText('回声');
    expect((await storedState(page)).records[first.chapterId]?.complete).toBe(
      false,
    );
    await expect(page.locator('.reader-end button')).toHaveCount(0);
    await page
      .getByRole('button', { name: '展开顶部工具栏', exact: true })
      .tap();
    await page.getByRole('button', { name: /^上一篇：/ }).tap();
    await expect(page.locator('.reading-heading h1')).toHaveText('双岔');
  } finally {
    await context.close();
  }
});

test('desktop margins click across their height, stay transparent on hover, scroll natively and preserve text selection', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installSource(page);
  await page.goto('./');
  await page
    .getByRole('button', { name: `打开剧情：${title}`, exact: true })
    .click();
  await page.getByRole('button', { name: /^阅读 WX-1 / }).click();
  const reader = page.locator('.reader-scroll'),
    zone = page.locator('.reader-side-next');
  await expect(zone).toBeVisible();
  const box = await zone.boundingBox();
  const viewport = await reader.boundingBox();
  const copy = await page.locator('.reading-copy').boundingBox();
  if (!box || !viewport || !copy) throw Error('Missing reading margins');
  expect(box.x).toBeGreaterThanOrEqual(copy.x + copy.width);
  expect(box.height).toBeCloseTo(viewport.height, 0);
  const before = await zone.evaluate((node) => ({
    background: getComputedStyle(node).backgroundColor,
    color: getComputedStyle(node).color,
  }));
  await page.mouse.move(box.x + box.width * 0.7, box.y + 60);
  expect(
    await zone.evaluate((node) => ({
      background: getComputedStyle(node).backgroundColor,
      color: getComputedStyle(node).color,
    })),
  ).toEqual(before);
  expect(await zone.evaluate((node) => getComputedStyle(node).cursor)).toBe(
    'pointer',
  );
  await page.screenshot({ path: test.info().outputPath('desktop-margin.png') });
  await page.mouse.wheel(0, 250);
  await expect
    .poll(() => reader.evaluate((node) => node.scrollTop))
    .toBeGreaterThan(100);
  await page.locator('.body-copy').evaluate((node) => {
    const range = document.createRange();
    range.selectNodeContents(node.firstElementChild ?? node);
    const selection = getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await page.mouse.click(box.x + box.width * 0.7, box.y + 60);
  await expect(page.locator('.reading-heading h1')).toHaveText('双岔');
  await page.evaluate(() => getSelection()?.removeAllRanges());
  await page.mouse.click(box.x + box.width * 0.7, box.y + 60);
  await expect(page.locator('.reading-heading h1')).toHaveText('回声');
  const left = await page.locator('.reader-side-previous').boundingBox();
  if (!left) throw Error('Missing left margin');
  await page.mouse.click(left.x + left.width * 0.3, left.y + left.height - 60);
  await expect(page.locator('.reading-heading h1')).toHaveText('双岔');
  await page.setViewportSize({ width: 768, height: 900 });
  await expect(zone).toBeHidden();
});
