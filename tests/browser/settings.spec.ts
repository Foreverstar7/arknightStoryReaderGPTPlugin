import { expect, test, type APIRequestContext } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { snapshotSchema } from '../../src/shared/contracts.js';
import { selectTheme } from './settings-helpers.js';

async function seed(
  request: APIRequestContext,
  theme: 'system' | 'light' | 'dark' = 'system',
) {
  await request.post('/api/tools', {
    data: { name: 'reader_clear_history', arguments: {} },
  });
  await request.post('/api/tools', {
    data: {
      name: 'reader_settings',
      arguments: { theme, autoImages: false, retentionDays: 7 },
    },
  });
}
async function settings(request: APIRequestContext) {
  return snapshotSchema.parse(
    await (
      await request.post('/api/tools', {
        data: { name: 'reader_snapshot', arguments: {} },
      })
    ).json(),
  ).state.settings;
}

test('switches preserve legacy theme preferences and persist keyboard changes, system changes and failed saves', async ({
  page,
  request,
}) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  for (const theme of ['light', 'dark', 'system'] as const) {
    await seed(request, theme);
    await page.goto('/');
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(
      page.getByRole('switch', { name: '主题跟随系统' }),
    ).toHaveAttribute('aria-checked', String(theme === 'system'));
    await expect(
      page.getByRole('switch', { name: '深色模式', exact: true }),
    ).toHaveAttribute('aria-checked', String(theme !== 'light'));
    expect((await settings(request)).theme).toBe(theme);
  }
  const follow = page.getByRole('switch', { name: '主题跟随系统' }),
    dark = page.getByRole('switch', { name: '深色模式', exact: true });
  await expect(dark).toBeDisabled();
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(dark).toHaveAttribute('aria-checked', 'false');
  await follow.focus();
  await page.keyboard.press('Space');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(dark).toBeEnabled();
  await dark.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const images = page.getByRole('switch', { name: '自动显示图片' });
  await expect(images).toBeEnabled();
  await images.focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('dialog').getByRole('status')).toHaveText(
    '已保存图片显示设置。',
  );
  await page.reload();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await expect(images).toHaveAttribute('aria-checked', 'true');
  expect((await settings(request)).theme).toBe('dark');
  await page.route('**/api/tools', async (route) => {
    const call = route.request().postDataJSON();
    if (call.name === 'reader_settings')
      await route.fulfill({
        status: 503,
        json: { code: 'storage', error: '测试：设置暂时无法保存' },
      });
    else await route.continue();
  });
  await images.click();
  await expect(page.getByRole('dialog').getByRole('status')).toHaveText(
    '测试：设置暂时无法保存',
  );
  await expect(images).toHaveAttribute('aria-checked', 'true');
  expect((await settings(request)).autoImages).toBe(true);
  await page.unroute('**/api/tools');
  await images.click();
  await expect(page.getByRole('dialog').getByRole('status')).toHaveText(
    '已保存图片显示设置。',
  );
  await follow.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'system');
  await page.evaluate(() => {
    document.documentElement.dataset.hostTheme = 'dark';
  });
  await expect(dark).toHaveAttribute('aria-checked', 'true');
  await page.evaluate(() => {
    delete document.documentElement.dataset.hostTheme;
  });
});

test('settings switches fit all viewport sizes and both themes with visible keyboard focus and reduced motion', async ({
  page,
  request,
}) => {
  await seed(request);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await mkdir('.ai/local/screenshots/compat', { recursive: true });
  for (const theme of ['light', 'dark'] as const) {
    await selectTheme(page, theme);
    for (const viewport of [
      { width: 320, height: 760 },
      { width: 768, height: 900 },
      { width: 1440, height: 900 },
      { width: 1024, height: 400 },
    ]) {
      await page.setViewportSize(viewport);
      const images = page.getByRole('switch', { name: '自动显示图片' });
      await images.focus();
      await page.keyboard.press('Tab');
      await page.keyboard.press('Shift+Tab');
      await expect(images).toBeFocused();
      await expect(images).toBeInViewport();
      expect(
        await images.evaluate((e) => getComputedStyle(e).outlineStyle),
      ).not.toBe('none');
      const box = await images.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect(
        await page
          .getByRole('dialog')
          .evaluate((e) => e.scrollWidth <= e.clientWidth),
      ).toBe(true);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await page.screenshot({
        path: `.ai/local/screenshots/compat/settings-${theme}-${viewport.width}x${viewport.height}.png`,
      });
      const clear = page.getByRole('button', {
        name: '清理剧情文本和图片缓存',
        exact: true,
      });
      await clear.scrollIntoViewIfNeeded();
      await expect(clear).toBeInViewport();
      await expect(
        page.getByText(
          '同时清理人物及资源映射。保留阅读记录、设置和已核验的字数统计。',
        ),
      ).toBeVisible();
    }
  }
});

test('touch switches toggle once and persist', async ({
  browser,
  baseURL,
  request,
}) => {
  await seed(request, 'light');
  const context = await browser.newContext({
    baseURL,
    hasTouch: true,
    viewport: { width: 320, height: 760 },
  });
  const page = await context.newPage();
  try {
    await page.goto('/');
    await page.getByRole('button', { name: '设置', exact: true }).tap();
    const images = page.getByRole('switch', { name: '自动显示图片' });
    await images.tap();
    await expect(page.getByRole('dialog').getByRole('status')).toHaveText(
      '已保存图片显示设置。',
    );
    await expect(images).toHaveAttribute('aria-checked', 'true');
    await page.reload();
    await page.getByRole('button', { name: '设置', exact: true }).tap();
    await expect(images).toHaveAttribute('aria-checked', 'true');
  } finally {
    await context.close();
    await seed(request);
  }
});
