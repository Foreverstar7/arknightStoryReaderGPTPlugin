import { expect, test } from '@playwright/test';

test('project-path assets load and preview tabs support keyboard and clicks', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('继续读');
  const reader = page.getByRole('tab', { name: '03 正文阅读' });
  await reader.click();
  await expect(
    page.getByRole('tabpanel', { name: '03 正文阅读' }),
  ).toBeVisible();
  await reader.press('Home');
  await expect(page.getByRole('tab', { name: '01 剧情目录' })).toBeFocused();
  await expect(
    page.getByRole('tabpanel', { name: '01 剧情目录' }),
  ).toBeVisible();
  await page.getByRole('tab', { name: '01 剧情目录' }).press('ArrowRight');
  await expect(
    page.getByRole('tabpanel', { name: '02 篇目列表' }),
  ).toBeVisible();
  for (const image of await page.locator('img:visible').all()) {
    await image.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        image.evaluate((element: HTMLImageElement) => element.naturalWidth),
      )
      .toBeGreaterThan(0);
  }
  expect(errors).toEqual([]);
});

test('responsive themes, installation links and disclosure remain usable without third-party requests', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    for (const viewport of [
      { width: 320, height: 760 },
      { width: 768, height: 900 },
      { width: 1440, height: 900 },
      { width: 1024, height: 400 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('./');
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const preview = page.locator('[role="tabpanel"]:visible img');
      await preview.scrollIntoViewIfNeeded();
      await expect
        .poll(() =>
          preview.evaluate((element: HTMLImageElement) => element.naturalWidth),
        )
        .toBeGreaterThan(0);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: test.info().outputPath(`${colorScheme}-${viewport.width}.png`),
        fullPage: true,
      });
      await page.getByRole('link', { name: '了解安装方式' }).click();
      await expect(
        page.getByRole('heading', { name: /准备好，\s*再翻开下一页。/u }),
      ).toBeInViewport();
      await expect(
        page.getByRole('link', { name: '打开安装指南' }),
      ).toHaveAttribute(
        'href',
        /github\.com\/Foreverstar7\/arknightStoryReaderGPTPlugin#quick-start/u,
      );
      const disclosure = page.getByText('这是官方项目吗？', { exact: false });
      await disclosure.click();
      await expect(
        page.getByText('这是个人维护的独立开源工具', { exact: false }),
      ).toBeVisible();
    }
  }
  expect(
    requests.every((url) => new URL(url).origin === 'http://127.0.0.1:4330'),
  ).toBe(true);
});
