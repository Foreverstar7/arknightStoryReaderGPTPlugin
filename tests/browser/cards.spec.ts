import { expect, test, type Locator } from '@playwright/test';

async function appearance(target: Locator) {
  return target.evaluate((element) =>
    [element, ...element.querySelectorAll('*')].map((node) => {
      const style = getComputedStyle(node);
      return {
        background: style.backgroundColor,
        border: style.borderColor,
        color: style.color,
        transform: style.transform,
        shadow: style.boxShadow,
      };
    }),
  );
}

test.beforeEach(async ({ request }) => {
  await request.post('/api/tools', {
    data: { name: 'reader_clear_history', arguments: {} },
  });
  await request.post('/api/tools', {
    data: {
      name: 'reader_settings',
      arguments: { autoImages: false, retentionDays: 7, theme: 'system' },
    },
  });
});

test('title, summary, progress and padding open from the start; dragging never opens and the next keyboard activation works', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '打开剧情：雾中来信' }).click();
  const card = page.locator('.chapter-card').first();
  const reader = page.getByRole('main', { name: '剧情正文' });
  for (const area of [
    'strong',
    '.chapter-summary',
    '.chapter-percent',
    'padding',
  ]) {
    await expect(card).toBeVisible();
    await page.evaluate(async () => {
      await Promise.allSettled(
        document.getAnimations().map((animation) => animation.finished),
      );
    });
    const box = await (
      area === 'padding' ? card : card.locator(area)
    ).boundingBox();
    if (!box) throw new Error(`缺少篇目卡区域：${area}`);
    await page.mouse.click(
      area === 'padding' ? box.x + 3 : box.x + box.width / 2,
      area === 'padding' ? box.y + box.height - 3 : box.y + box.height / 2,
    );
    await expect(reader).toBeVisible();
    await expect
      .poll(() => reader.evaluate((element) => element.scrollTop))
      .toBe(0);
    await reader.evaluate((element) => {
      element.scrollTop = 600;
    });
    await page.getByRole('button', { name: '篇章目录', exact: true }).click();
    await expect(
      page.getByRole('region', { name: '横向篇目轴' }),
    ).toBeVisible();
  }
  const axis = page.getByRole('region', { name: '横向篇目轴' });
  await page.evaluate(async () => {
    await Promise.allSettled(
      document.getAnimations().map((animation) => animation.finished),
    );
  });
  const box = await card.boundingBox();
  if (!box) throw new Error('缺少篇目卡');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 100, box.y + box.height / 2, {
    steps: 12,
  });
  await page.mouse.up();
  await expect(axis).toBeVisible();
  expect(await axis.evaluate((element) => element.scrollLeft)).toBeGreaterThan(
    50,
  );
  // A drag must not consume a subsequent native keyboard click (detail=0).
  await card.getByRole('button').focus();
  await page.keyboard.press('Enter');
  await expect(reader).toBeVisible();
  await expect
    .poll(() => reader.evaluate((element) => element.scrollTop))
    .toBe(0);
});

test('both card types keep all colors and geometry on hover while keyboard focus remains visible in both themes', async ({
  page,
}) => {
  await page.goto('/');
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    const story = page.getByRole('button', { name: '打开剧情：雾中来信' });
    await expect(story).toBeVisible();
    await page.mouse.move(0, 0);
    const beforeStory = await appearance(story);
    const storyBox = await story.boundingBox();
    await story.hover();
    expect(await appearance(story)).toEqual(beforeStory);
    expect(await story.boundingBox()).toEqual(storyBox);
    await expect(story).toHaveCSS('cursor', 'pointer');
    await story.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(story).toBeFocused();
    await expect(story).toHaveCSS('outline-style', 'solid');
    await page.keyboard.press('Enter');
    const chapter = page.locator('.chapter-card').first();
    await expect(chapter).toBeVisible();
    await page.mouse.move(0, 0);
    const beforeChapter = await appearance(chapter);
    const chapterBox = await chapter.boundingBox();
    await chapter.hover();
    expect(await appearance(chapter)).toEqual(beforeChapter);
    expect(await chapter.boundingBox()).toEqual(chapterBox);
    await expect(chapter).toHaveCSS('cursor', 'pointer');
    const open = chapter.getByRole('button');
    await open.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(open).toBeFocused();
    expect(
      await open.evaluate(
        (element) => getComputedStyle(element, '::after').outlineStyle,
      ),
    ).toBe('solid');
    await page.keyboard.press('Space');
    await expect(page.getByRole('main', { name: '剧情正文' })).toBeVisible();
    await page.getByRole('button', { name: '⌂ 主页', exact: true }).click();
    await expect(page.getByRole('heading', { name: '剧情档案' })).toBeVisible();
  }
});

test('touch taps open the whole card and a native horizontal swipe only scrolls the axis', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 320, height: 760 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: 'reduce',
  });
  try {
    const page = await context.newPage();
    await page.goto('/');
    await page.getByRole('button', { name: '打开剧情：雾中来信' }).tap();
    const card = page.locator('.chapter-card').first();
    const summary = await card.locator('.chapter-summary').boundingBox();
    if (!summary) throw new Error('缺少触摸测试简介');
    await page.touchscreen.tap(
      summary.x + summary.width / 2,
      summary.y + summary.height / 2,
    );
    await expect(page.getByRole('main', { name: '剧情正文' })).toBeVisible();
    await page.getByRole('button', { name: '篇章目录', exact: true }).tap();
    await expect(card).toBeVisible();
    const box = await card.boundingBox();
    if (!box) throw new Error('缺少触摸测试篇目卡');
    const axis = page.getByRole('region', { name: '横向篇目轴' });
    // touchEnd can leave native momentum scrolling in progress. Observe its
    // actual completion before testing the following normal padding tap.
    await axis.evaluate((element) => {
      element.setAttribute('data-test-pan-ended', 'false');
      element.addEventListener(
        'scrollend',
        () => element.setAttribute('data-test-pan-ended', 'true'),
        { once: true },
      );
    });
    const session = await context.newCDPSession(page);
    const y = box.y + box.height / 2;
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: 210, y }],
    });
    for (let x = 200; x >= 50; x -= 10) {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y }],
      });
    }
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await expect(axis).toBeVisible();
    await expect
      .poll(() => axis.evaluate((element) => element.scrollLeft))
      .toBeGreaterThan(50);
    await expect(axis).toHaveAttribute('data-test-pan-ended', 'true');
    await session.detach();
    // A normal tap still works after the browser cancels the pan gesture.
    await card.scrollIntoViewIfNeeded();
    const padding = await card.boundingBox();
    if (!padding) throw new Error('篇目卡不在可视区');
    await card.tap({
      position: { x: padding.width - 3, y: padding.height - 3 },
    });
    await expect(page.getByRole('main', { name: '剧情正文' })).toBeVisible();
  } finally {
    await context.close();
  }
});
