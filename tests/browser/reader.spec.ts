import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { snapshotSchema } from '../../src/shared/contracts.js';

test.beforeEach(async ({ request }) => {
  // The configured server uses an isolated .ai/local/e2e-state directory.
  await request.post('/api/tools', {
    data: { name: 'reader_clear_history', arguments: {} },
  });
});

test('navigation preserves the actual recent chapter and restores the latest position; direct chapter opens start at top', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '打开剧情：雾中来信' }).click();
  await page
    .getByRole('button', { name: '阅读 档案 01 一封未寄出的信' })
    .click();
  await expect(
    page.getByRole('heading', { name: '一封未寄出的信' }),
  ).toBeVisible();
  const reader = page.getByRole('main', { name: '剧情正文' });
  await reader.evaluate((element) => {
    element.scrollTop = 700;
  });
  await page.getByRole('button', { name: '⌂ 主页', exact: true }).click();
  // Navigation waits for the save; a click alone does not await an async React handler.
  await expect(
    page.getByRole('heading', { name: '剧情档案', exact: true }),
  ).toBeVisible();
  const data = snapshotSchema.parse(
    await (
      await request.post('/api/tools', {
        data: { name: 'reader_snapshot', arguments: {} },
      })
    ).json(),
  );
  const record = data.state.records['fixture-mist/1'];
  expect(record?.furthestWords).toBeGreaterThan(0);
  await expect(
    page.getByRole('button', { name: '篇章目录', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '篇章目录', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '雾中来信', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '⌂ 主页', exact: true }).click();
  await page.getByRole('button', { name: '打开剧情：灯火与归途' }).click();
  await expect(
    page.getByRole('button', { name: '最近阅读：一封未寄出的信' }),
  ).toBeVisible();
  await page.getByRole('button', { name: '最近阅读：一封未寄出的信' }).click();
  await expect
    .poll(() => reader.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(650);
  const restored = await reader.evaluate((element) => element.scrollTop);
  await page.getByRole('button', { name: '最近阅读：一封未寄出的信' }).click();
  expect(await reader.evaluate((element) => element.scrollTop)).toBeCloseTo(
    restored,
    0,
  );
  await page.reload();
  await expect
    .poll(() => reader.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(650);
  await page.getByRole('button', { name: '篇章目录', exact: true }).click();
  await page
    .getByRole('button', { name: '阅读 档案 01 一封未寄出的信' })
    .click();
  await expect
    .poll(() => reader.evaluate((element) => element.scrollTop))
    .toBe(0);
});

test('manual portraits, inline CG, keyboard settings and cache clearing work without asset downloads', async ({
  page,
}) => {
  const imageRequests: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'image') imageRequests.push(request.url());
  });
  await page.goto('/');
  await page.getByRole('button', { name: '打开剧情：雾中来信' }).click();
  await page
    .getByRole('button', { name: '阅读 档案 01 一封未寄出的信' })
    .click();
  const name = page.getByRole('button', { name: '查看 记录员 的立绘' }).first();
  await name.hover();
  await expect(page.getByRole('dialog', { name: '记录员 立绘' })).toHaveCount(
    0,
  );
  await name.click();
  await expect(page.getByRole('dialog', { name: '记录员 立绘' })).toBeVisible();
  await name.click();
  await expect(page.getByRole('dialog', { name: '记录员 立绘' })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: '◇ 查看 CG', exact: true }).click();
  await expect(
    page.getByRole('img', { name: '雾中的城市 · 原创构图示意' }),
  ).toBeVisible();
  await page.getByRole('button', { name: '设置', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: '阅读设置' })).toBeVisible();
  await page
    .getByRole('button', { name: '清理全部内容缓存', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText('阅读记录已保留');
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: '最近阅读：一封未寄出的信' }),
  ).toBeVisible();
  expect(imageRequests).toEqual([]);
});

test('empty data and a failed initial request expose clear states and retry', async ({
  page,
}) => {
  let first = true;
  await page.route('**/api/tools', async (route) => {
    if (first) {
      first = false;
      await route.fulfill({
        status: 503,
        json: { error: '测试：本机服务暂时不可用' },
      });
    } else await route.continue();
  });
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('本机服务暂时不可用');
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await expect(page.getByRole('heading', { name: '剧情档案' })).toBeVisible();
  await page.unroute('**/api/tools');
  await page.route('**/api/tools', async (route) => {
    const response = await route.fetch();
    const result = snapshotSchema.safeParse(await response.json());
    if (result.success)
      await route.fulfill({ json: { ...result.data, stories: [] } });
    else await route.fulfill({ response });
  });
  await page.reload();
  await expect(page.getByText('目录暂时没有可用剧情。')).toBeVisible();
});

test('320px, medium, desktop and low-height layouts in both themes remain usable with reduced motion', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await mkdir('.ai/local/screenshots', { recursive: true });
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    for (const viewport of [
      { width: 320, height: 760 },
      { width: 768, height: 900 },
      { width: 1440, height: 900 },
      { width: 1024, height: 400 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('/');
      await expect(page.locator('.app-shell')).toHaveAttribute(
        'aria-busy',
        'false',
      );
      if (await page.getByRole('main', { name: '剧情正文' }).count())
        await page.getByRole('button', { name: '⌂ 主页', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: '剧情档案', exact: true }),
      ).toBeVisible();
      const suffix = `${theme}-${viewport.width}x${viewport.height}`;
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      ).toBe(false);
      await page.screenshot({
        path: `.ai/local/screenshots/library-${suffix}.png`,
      });
      await page.getByRole('button', { name: '打开剧情：雾中来信' }).click();
      await expect(
        page.getByRole('region', { name: '横向篇目轴' }),
      ).toBeVisible();
      await page.getByRole('slider', { name: '篇目浏览线' }).focus();
      await page.keyboard.press('End');
      const overflow = await page
        .getByRole('region', { name: '横向篇目轴' })
        .evaluate((element) => element.scrollWidth - element.clientWidth);
      await expect
        .poll(() =>
          page
            .getByRole('region', { name: '横向篇目轴' })
            .evaluate((element) =>
              Math.abs(
                element.scrollLeft -
                  (element.scrollWidth - element.clientWidth),
              ),
            ),
        )
        .toBeLessThanOrEqual(1);
      expect(overflow).toBeGreaterThanOrEqual(0);
      await page.keyboard.press('Home');
      await page.screenshot({
        path: `.ai/local/screenshots/chapters-${suffix}.png`,
      });
      await page
        .getByRole('button', { name: '阅读 档案 01 一封未寄出的信' })
        .click();
      await expect(page.getByRole('main', { name: '剧情正文' })).toBeVisible();
      if (viewport.width === 320) {
        await page.getByRole('button', { name: '☰ 篇目列表' }).click();
        await expect(
          page.getByRole('complementary', { name: '当前剧情篇目' }),
        ).toBeVisible();
        await page.getByRole('button', { name: '☰ 篇目列表' }).click();
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      ).toBe(false);
      await page.screenshot({
        path: `.ai/local/screenshots/reader-${suffix}.png`,
      });
    }
  }
});

test('every navigation animates, adjacent chapters sweep in opposite directions, and resize/reduced motion settle correctly', async ({
  page,
}) => {
  // The wave lasts 440ms; expect.poll's default backoff can skip it entirely.
  // Observe actual CSS starts in the page instead of sampling only live frames.
  await page.addInitScript(() => {
    const names = new Set<string>();
    document.addEventListener('animationstart', (event) => {
      names.add(event.animationName);
      document.documentElement.dataset.observedAnimations = [...names].join(
        '\n',
      );
    });
  });
  const observedAnimations = () =>
    page.evaluate(
      () =>
        document.documentElement.dataset.observedAnimations?.split('\n') ?? [],
    );
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 1100, height: 760 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: '打开剧情：雾中来信' }).click();
  await expect.poll(observedAnimations).toContain('page-enter');
  await page
    .getByRole('button', { name: '阅读 档案 01 一封未寄出的信' })
    .click();
  await expect(
    page.getByRole('heading', { name: '一封未寄出的信', exact: true }),
  ).toBeVisible();
  const reader = page.getByRole('main', { name: '剧情正文' });
  await reader.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await page.getByRole('button', { name: '下一篇 →', exact: true }).click();
  await expect.poll(observedAnimations).toContain('reader-wave-next');
  await page.screenshot({
    path: '.ai/local/screenshots/turn-next.png',
    animations: 'allow',
  });
  await expect(
    page.getByRole('heading', { name: '钟楼的方向', exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => reader.evaluate((element) => element.scrollTop))
    .toBe(0);
  await reader.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await page.getByRole('button', { name: '← 上一篇', exact: true }).click();
  await expect.poll(observedAnimations).toContain('reader-wave-previous');
  await page.setViewportSize({ width: 320, height: 600 });
  await expect
    .poll(() => reader.evaluate((element) => element.scrollTop))
    .toBe(0);
  await page.getByRole('button', { name: '⌂ 主页', exact: true }).click();
  await expect.poll(observedAnimations).toContain('home-enter');
  await expect(
    page.getByRole('button', { name: '篇章目录', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '篇章目录', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '雾中来信', exact: true }),
  ).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: '最近阅读：一封未寄出的信' }).click();
  await expect(reader).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  expect(
    await page.evaluate(() =>
      document
        .getAnimations()
        .filter((animation) => animation instanceof CSSAnimation)
        .map((animation) => animation.animationName),
    ),
  ).not.toContain('reader-reveal');
  expect(errors).toEqual([]);
});
