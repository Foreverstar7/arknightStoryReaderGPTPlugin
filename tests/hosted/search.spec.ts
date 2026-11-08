import { expect, test, type Page } from '@playwright/test';

const runtimeErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
});
test.afterEach(({ page }) => {
  expect(runtimeErrors.get(page)).toEqual([]);
});

function app(page: Page) {
  return page.frameLocator('#app');
}
async function stableSize(page: Page) {
  const sizes = page.locator('#sizes');
  await expect
    .poll(async () => {
      const before = await sizes.textContent();
      await page.waitForTimeout(250);
      return before === (await sizes.textContent());
    })
    .toBe(true);
  const values: unknown = JSON.parse((await sizes.textContent()) ?? '[]');
  expect(Array.isArray(values) && values.length > 0 && values.length < 25).toBe(
    true,
  );
}
async function completeInline(page: Page) {
  await expect
    .poll(async () =>
      app(page)
        .locator('body')
        .evaluate((body) => {
          const root = document.documentElement;
          const boxes = [
            ...body.querySelectorAll(
              '.search-card, .search-heading, .search-empty, .search-error, button',
            ),
          ].map((node) => node.getBoundingClientRect());
          return (
            boxes.every(
              (box) =>
                box.top >= 0 &&
                box.bottom <= innerHeight + 1 &&
                box.left >= 0 &&
                box.right <= innerWidth + 1,
            ) &&
            root.scrollWidth <= innerWidth &&
            body.scrollHeight <= innerHeight + 1
          );
        }),
    )
    .toBe(true);
  await stableSize(page);
}
test('delayed results expand the real MCP iframe after the loading measurement', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#status')).toHaveText('MCP iframe 已初始化');
  await expect(app(page).getByRole('status')).toHaveText('正在查找剧情…');
  await expect
    .poll(
      async () =>
        JSON.parse((await page.locator('#sizes').textContent()) ?? '[]').length,
    )
    .toBeGreaterThan(0);
  const loading = await page
    .locator('#app')
    .evaluate((node) => node.getBoundingClientRect().height);
  await page.getByRole('button', { name: '交付结果' }).click();
  await expect(app(page).locator('.search-card')).toHaveCount(3);
  await completeInline(page);
  expect(
    await page
      .locator('#app')
      .evaluate((node) => node.getBoundingClientRect().height),
  ).toBeGreaterThan(loading);
  await test.info().attach('negotiated-sizes', {
    body: (await page.locator('#sizes').textContent()) ?? '[]',
    contentType: 'application/json',
  });
  await page.screenshot({
    path: '.ai/local/search-card-check/fixed-delayed.png',
    fullPage: true,
  });
});

test('empty, failure/retry and repeated results remain visible and shrink again', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#status')).toHaveText('MCP iframe 已初始化');
  await page.getByRole('button', { name: '模拟网络失败' }).click();
  await expect(app(page).getByRole('alert')).toContainText(
    '原创搜索模拟网络失败',
  );
  await completeInline(page);
  await app(page).getByRole('button', { name: '重试搜索' }).click();
  await expect(app(page).locator('.search-card')).toHaveCount(3);
  await completeInline(page);
  await page.getByLabel('查询', { exact: true }).fill('不存在的原创剧情');
  await page.getByRole('button', { name: '交付结果' }).click();
  await expect(app(page).locator('.search-empty')).toBeVisible();
  await expect(app(page).locator('.search-card')).toHaveCount(0);
  await completeInline(page);
  await page.getByLabel('方式').selectOption('story');
  await page.getByLabel('查询', { exact: true }).fill('雾中来信');
  await page.getByRole('button', { name: '交付结果' }).click();
  await expect(app(page).locator('.search-card')).toHaveCount(1);
  await completeInline(page);
  await page.getByRole('button', { name: '模拟网络失败' }).click();
  await expect(app(page).getByRole('alert')).toBeVisible();
  await completeInline(page);
  await page.getByLabel('方式').selectOption('character');
  await page.getByLabel('查询', { exact: true }).fill('记录员');
  await page.getByRole('button', { name: '交付结果' }).click();
  await expect(app(page).locator('.search-card')).toHaveCount(3);
  await completeInline(page);
});

test('immediate results also negotiate a complete size', async ({ page }) => {
  await page.goto('/?delay=0');
  await expect(app(page).locator('.search-card')).toHaveCount(3);
  await completeInline(page);
});

test('pagination increases intrinsic height and keeps its last card reachable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 640, height: 700 });
  await page.goto('/?delay=100&limit=2');
  await expect(app(page).locator('.search-card')).toHaveCount(2);
  await completeInline(page);
  const first = await page
    .locator('#app')
    .evaluate((node) => node.getBoundingClientRect().height);
  await app(page).getByRole('button', { name: '查看更多结果' }).click();
  await expect(app(page).locator('.search-card')).toHaveCount(3);
  await expect(
    app(page).getByRole('button', { name: '查看更多结果' }),
  ).toHaveCount(0);
  await completeInline(page);
  expect(
    await page
      .locator('#app')
      .evaluate((node) => node.getBoundingClientRect().height),
  ).toBeGreaterThan(first);
});

async function boundedReader(page: Page) {
  if ((await page.locator('body').getAttribute('data-mode')) === 'fullscreen') {
    expect(
      await page
        .locator('#app')
        .evaluate((frame) => frame.getBoundingClientRect().height),
    ).toBe(page.viewportSize()?.height);
  }
  await expect
    .poll(() =>
      app(page)
        .locator('.search-reader')
        .evaluate((reader) => {
          const shell = reader
            .querySelector('.app-shell')
            ?.getBoundingClientRect();
          const bar = reader
            .querySelector('.search-return')
            ?.getBoundingClientRect();
          return Boolean(
            shell &&
            bar &&
            shell.bottom <= innerHeight + 1 &&
            shell.top >= bar.bottom - 1 &&
            document.documentElement.scrollHeight <= innerHeight + 1,
          );
        }),
    )
    .toBe(true);
  await stableSize(page);
}

test('card to fullscreen keeps directory, body scrolling and return usable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?delay=100&responseOnly');
  await expect(app(page).locator('.search-card')).toHaveCount(3);
  await completeInline(page);
  await app(page)
    .getByRole('button', { name: '查看《雾中来信》篇章目录' })
    .focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'fullscreen');
  await expect(app(page).locator('.chapters h1')).toHaveText('雾中来信');
  await expect(
    app(page).locator('[data-search-match="true"]').first(),
  ).toBeVisible();
  await boundedReader(page);
  await app(page)
    .getByRole('button', { name: '阅读 档案 01 一封未寄出的信', exact: true })
    .click();
  await expect(app(page).locator('.reader-scroll')).toBeVisible();
  await app(page).locator('.reader-scroll').hover();
  await page.mouse.wheel(0, 550);
  await expect
    .poll(() =>
      app(page)
        .locator('.reader-scroll')
        .evaluate((node) => node.scrollTop),
    )
    .toBeGreaterThan(0);
  await boundedReader(page);
  await app(page).getByRole('button', { name: '← 返回搜索结果' }).click();
  await expect(app(page).locator('.search-card')).toHaveCount(3);
  await expect(app(page).locator('html')).toHaveAttribute(
    'data-display-mode',
    'fullscreen',
  );
  await expect(app(page).locator('.search-results')).toBeVisible();
  await page.getByRole('button', { name: '切回内嵌' }).click();
  await completeInline(page);
});

test('a host that refuses fullscreen retains a bounded reader and can return to natural results', async ({
  page,
}) => {
  await page.goto('/?delay=100');
  await expect(app(page).locator('.search-card')).toHaveCount(3);
  await completeInline(page);
  await page.getByLabel('拒绝全屏').check();
  const cover = await app(page)
    .locator('.search-card .cover')
    .first()
    .boundingBox();
  if (!cover) throw new Error('The first search cover is missing');
  // The card button's ::after intentionally covers the art; click the visible
  // cover coordinates as a person would, rather than requiring the div to
  // receive pointer events through that button.
  await page.mouse.click(cover.x + cover.width / 2, cover.y + cover.height / 2);
  await expect(app(page).locator('.chapters h1')).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'inline');
  await boundedReader(page);
  await app(page).getByRole('button', { name: '← 返回搜索结果' }).click();
  await completeInline(page);
});

test('fullscreen initialization, context changes and error above results preserve internal scrolling', async ({
  page,
}) => {
  await page.setViewportSize({ width: 640, height: 400 });
  await page.goto('/?mode=fullscreen&delay=100');
  await expect(app(page).locator('.search-card')).toHaveCount(3);
  await expect(app(page).locator('html')).toHaveAttribute(
    'data-display-mode',
    'fullscreen',
  );
  await page.getByRole('button', { name: '模拟网络失败' }).click();
  await expect(app(page).getByRole('alert')).toBeVisible();
  await expect
    .poll(() =>
      app(page)
        .locator('.search-results')
        .evaluate((results) => {
          const box = results.getBoundingClientRect();
          return (
            box.top > 0 &&
            box.bottom <= innerHeight + 1 &&
            results.scrollHeight > results.clientHeight
          );
        }),
    )
    .toBe(true);
  await app(page).locator('.search-results').hover();
  await page.mouse.wheel(0, 700);
  await expect
    .poll(() =>
      app(page)
        .locator('.search-results')
        .evaluate((node) => node.scrollTop),
    )
    .toBeGreaterThan(0);
  await page.getByRole('button', { name: '切回内嵌' }).click();
  await completeInline(page);
  await page.getByRole('button', { name: '切到全屏' }).click();
  await expect(app(page).locator('html')).toHaveAttribute(
    'data-display-mode',
    'fullscreen',
  );
  await stableSize(page);
});

test('a capped inline host permits document scrolling to the last result', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 760 });
  await page.goto('/?delay=100&cap=400');
  await expect(app(page).locator('.search-card')).toHaveCount(3);
  const last = app(page).locator('.search-card-open').last();
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport();
  await stableSize(page);
  await last.click();
  await expect(app(page).locator('.chapters h1')).toBeVisible();
  await boundedReader(page);
});

for (const theme of ['light', 'dark'] as const) {
  for (const [width, height] of [
    [320, 760],
    [768, 900],
    [1440, 960],
    [1024, 400],
  ] as const) {
    test(`inline and fullscreen remain usable at ${width}x${height} in ${theme}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({
        colorScheme: theme === 'light' ? 'dark' : 'light',
        reducedMotion: 'reduce',
      });
      await page.goto(`/?delay=100&theme=${theme}`);
      await expect(app(page).locator('.search-card')).toHaveCount(3);
      await completeInline(page);
      expect(
        await app(page)
          .locator('html')
          .evaluate((node) => getComputedStyle(node).colorScheme),
      ).toBe(theme);
      await page.locator('#app').screenshot({
        path: `.ai/local/search-card-check/inline-${width}-${height}-${theme}.png`,
      });
      await app(page).locator('.search-card-open').first().click();
      await expect(app(page).locator('.chapters h1')).toBeVisible();
      await boundedReader(page);
      await app(page).locator('.chapter-open').first().scrollIntoViewIfNeeded();
      await expect(app(page).locator('.chapter-open').first()).toBeInViewport();
      await page.locator('#app').screenshot({
        path: `.ai/local/search-card-check/directory-${width}-${height}-${theme}.png`,
      });
      await app(page).getByRole('button', { name: '← 返回搜索结果' }).click();
      await page.getByRole('button', { name: '切回内嵌' }).click();
      await completeInline(page);
      await page.getByRole('button', { name: '切换主题' }).click();
      await expect
        .poll(() =>
          app(page)
            .locator('html')
            .evaluate((node) => getComputedStyle(node).colorScheme),
        )
        .toBe(theme === 'light' ? 'dark' : 'light');
      await completeInline(page);
    });
  }
}

test('continuous width changes reflow all cards without accumulating height', async ({
  page,
}) => {
  await page.goto('/?delay=100');
  await expect(app(page).locator('.search-card')).toHaveCount(3);
  let desktopHeight = 0;
  for (const width of [1440, 320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 760 });
    await completeInline(page);
    const height = await page
      .locator('#app')
      .evaluate((node) => node.getBoundingClientRect().height);
    if (!desktopHeight) desktopHeight = height;
    if (width === 1440) expect(height).toBe(desktopHeight);
  }
});

test('the global reader entry continues to fill its host and scroll internally', async ({
  page,
}) => {
  await page.goto('/?entry=reader&mode=fullscreen');
  await expect(app(page).locator('.library')).toBeVisible();
  await expect(app(page).locator('.search-flow')).toHaveCount(0);
  await expect
    .poll(() =>
      app(page)
        .locator('.app-shell')
        .evaluate(
          (shell) => shell.getBoundingClientRect().height === innerHeight,
        ),
    )
    .toBe(true);
  await stableSize(page);
});
