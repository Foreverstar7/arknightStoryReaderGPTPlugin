import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { snapshotSchema } from '../../src/shared/contracts.js';

async function first(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '打开剧情：骑兵与猎人' }).click();
  await expect(page.locator('.chapter-summary').first()).toContainText(
    '日正当中，黄沙漫天',
  );
  await page.getByRole('button', { name: '阅读 GT-1 日正当中 行动前' }).click();
  await expect(
    page.getByRole('heading', { name: '日正当中 行动前', exact: true }),
  ).toBeVisible();
}
test.beforeEach(async ({ request, page }) => {
  await request.post('/api/tools', {
    data: { name: 'reader_clear_history', arguments: {} },
  });
  await request.post('/api/tools', {
    data: {
      name: 'reader_settings',
      arguments: { autoImages: false, retentionDays: 7, theme: 'system' },
    },
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('live covers are viewport-triggered; manual portraits/CG stay idle on hover/scroll, retry, preserve PNG alpha and clear without refetch', async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const images: { kind: string; blockId?: string; storyId?: string }[] = [];
  const errors: string[] = [];
  const directRequests: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (req) => {
    if (req.url().includes('/api/tools')) {
      const data = req.postDataJSON();
      if (data?.name === 'reader_image') images.push(data.arguments);
    }
    if (/^https:\/\/(media|torappu)\.prts\.wiki/u.test(req.url()))
      directRequests.push(req.url());
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '剧情档案' })).toBeVisible();
  await expect.poll(() => images.length).toBeGreaterThan(0);
  expect(images.some((image) => image.storyId === 'prts:骑兵与猎人')).toBe(
    false,
  );
  expect(images.every((image) => image.kind === 'cover')).toBe(true);
  await page.getByRole('button', { name: '打开剧情：骑兵与猎人' }).click();
  await expect(
    page.getByRole('img', { name: '骑兵与猎人 封面' }),
  ).toBeVisible();
  await expect(page.locator('.chapter-summary').first()).toContainText(
    '日正当中，黄沙漫天',
  );
  await page.getByRole('button', { name: '阅读 GT-1 日正当中 行动前' }).click();
  const name = page.getByRole('button', { name: '查看 格拉尼 的立绘' }).first();
  await name.hover();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page
    .getByRole('button', { name: '查看 CG' })
    .first()
    .scrollIntoViewIfNeeded();
  expect(images.filter((image) => image.kind !== 'cover')).toHaveLength(0);

  let injected = false;
  await page.route('**/api/tools', async (route) => {
    const data = route.request().postDataJSON();
    if (
      !injected &&
      data.name === 'reader_image' &&
      data.arguments.kind === 'portrait'
    ) {
      injected = true;
      await route.fulfill({
        status: 503,
        json: { error: '测试注入：图片暂时不可达' },
      });
    } else await route.continue();
  });
  await name.focus();
  await page.keyboard.press('Enter');
  const portrait = page.getByRole('dialog', { name: '格拉尼 立绘' });
  await expect(portrait).toContainText('图片暂时不可达');
  // A live source retry can outlast Playwright's 5s visibility assertion.
  // Await the actual response, then separately check decoding and rendering.
  const retried = page.waitForResponse((response) => {
    if (!response.url().endsWith('/api/tools')) return false;
    const data = response.request().postDataJSON();
    return (
      data.name === 'reader_image' &&
      data.arguments.kind === 'portrait' &&
      data.arguments.refresh === true
    );
  });
  await portrait.getByRole('button', { name: '重试图片' }).click();
  expect((await retried).ok()).toBe(true);
  await expect(
    portrait.getByRole('img', { name: '格拉尼 · 当前场景立绘' }),
  ).toBeVisible();
  const alpha = await portrait.locator('image').evaluate(async (node) => {
    const image = new Image();
    image.src = node.getAttribute('href') ?? '';
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas unavailable');
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    return {
      corner: pixels[3],
      hasOpaque: pixels.some((value, index) => index % 4 === 3 && value > 0),
    };
  });
  expect(alpha).toEqual({ corner: 0, hasOpaque: true });
  await mkdir('.ai/local/screenshots', { recursive: true });
  await page.screenshot({
    path: '.ai/local/screenshots/s3-portrait-desktop.png',
  });
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await expect(portrait).toHaveCount(0);
  await page.keyboard.press('Escape');
  await name.click();
  await expect(portrait.getByRole('img')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(name).toBeFocused();
  await page.getByRole('button', { name: '查看 CG' }).first().click();
  await expect(
    page.locator('.cg-image').first().getByRole('img'),
  ).toBeVisible();
  await page.screenshot({ path: '.ai/local/screenshots/s3-cg-desktop.png' });
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const count = images.length;
  await page.getByRole('button', { name: '清理图片缓存', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('阅读记录已保留');
  await page.keyboard.press('Escape');
  const saved = snapshotSchema.parse(
    await (
      await request.post('/api/tools', {
        data: { name: 'reader_snapshot', arguments: {} },
      })
    ).json(),
  );
  expect(
    saved.state.records['prts:GT-1 日正当中/BEG']?.totalWords,
  ).toBeGreaterThan(0);
  expect(images).toHaveLength(count);
  expect(directRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test('automatic mode loads only nearby CG and hovered portraits; disabling keeps cached content and does not fetch', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 400 });
  const kinds: string[] = [];
  page.on('request', (req) => {
    if (req.url().includes('/api/tools')) {
      const data = req.postDataJSON();
      if (data?.name === 'reader_image' && data.arguments.kind !== 'cover')
        kinds.push(data.arguments.kind);
    }
  });
  await first(page);
  expect(kinds).toHaveLength(0);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('switch', { name: /自动显示图片/u }).check();
  await page.keyboard.press('Escape');
  await expect(
    page.locator('.cg-image').first().getByRole('img'),
  ).toBeVisible();
  expect(kinds.filter((kind) => kind === 'cg')).toHaveLength(1);
  expect(kinds).not.toContain('portrait');
  await page
    .getByRole('button', { name: '查看 格拉尼 的立绘' })
    .first()
    .hover();
  await expect(
    page.getByRole('dialog', { name: '格拉尼 立绘' }).getByRole('img'),
  ).toBeVisible();
  expect(kinds.filter((kind) => kind === 'portrait')).toHaveLength(1);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('switch', { name: /自动显示图片/u }).uncheck();
  await page.keyboard.press('Escape');
  const count = kinds.length;
  await page.getByRole('main', { name: '剧情正文' }).evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(page.getByText('本篇结束', { exact: true })).toBeVisible();
  expect(kinds).toHaveLength(count);
});

test('real covers, summaries and transparent floating images fit narrow, medium, desktop and low-height windows in both themes', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await first(page);
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    for (const viewport of [
      { width: 320, height: 760 },
      { width: 768, height: 900 },
      { width: 1440, height: 900 },
      { width: 1024, height: 400 },
    ]) {
      await page.setViewportSize(viewport);
      const name = page
        .getByRole('button', { name: '查看 格拉尼 的立绘' })
        .first();
      await name.click();
      const portrait = page.getByRole('dialog', { name: '格拉尼 立绘' });
      await expect(portrait.getByRole('img')).toBeVisible();
      const box = await portrait.boundingBox();
      expect(box).not.toBeNull();
      if (box) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
      }
      const suffix = `${theme}-${viewport.width}x${viewport.height}`;
      await page.screenshot({
        path: `.ai/local/screenshots/s3-portrait-${suffix}.png`,
      });
      await page.keyboard.press('Escape');
      await expect(name).toBeFocused();
      await page.locator('.cg-wrap').first().getByRole('button').click();
      const cg = page.locator('.cg-image').first().getByRole('img');
      await expect(cg).toBeVisible();
      await cg.scrollIntoViewIfNeeded();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      ).toBe(false);
      await page.screenshot({
        path: `.ai/local/screenshots/s3-cg-${suffix}.png`,
      });
      await page.locator('.cg-wrap').first().getByRole('button').click();
      await page.getByRole('button', { name: '篇章目录', exact: true }).click();
      await expect(
        page.getByRole('img', { name: '骑兵与猎人 封面' }),
      ).toBeVisible();
      await expect(page.locator('.chapter-summary').first()).toContainText(
        '日正当中，黄沙漫天',
      );
      await page.screenshot({
        path: `.ai/local/screenshots/s3-chapters-${suffix}.png`,
      });
      await page
        .getByRole('button', { name: '阅读 GT-1 日正当中 行动前' })
        .click();
    }
  }
});
