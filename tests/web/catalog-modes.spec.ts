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
    await expect(page.locator('.web-bar')).toBeHidden();
    const first = Object.values((await storedState(page)).records)[0];
    if (!first) throw Error('Missing original record');
    expect(first.complete).toBe(false);
    // Stop before release to inspect the live preview; this is genuine browser input.
    const session = await context.newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: 290, y: 430 }],
    });
    for (const x of [270, 245, 215, 180, 140, 100])
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y: 432 }],
      });
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
