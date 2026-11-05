import { expect, test, type Page } from '@playwright/test';
import { deferred } from '../helpers/deferred.js';
import {
  snapshotSchema,
  toolRequestSchema,
} from '../../src/shared/contracts.js';

async function first(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '打开剧情：雾中来信' }).click();
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/tools') &&
      response.request().postDataJSON()?.name === 'reader_record',
  );
  await page
    .getByRole('button', { name: '阅读 档案 01 一封未寄出的信' })
    .click();
  await expect(page.getByRole('main', { name: '剧情正文' })).toBeVisible();
  await saved;
}
test.beforeEach(async ({ request, page }) => {
  await request.post('/api/tools', {
    data: { name: 'reader_clear_history', arguments: {} },
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('failed position saves retry the same reader and keep their own error action', async ({
  page,
  request,
}) => {
  await first(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let saves = 0;
  await page.route('**/api/tools', async (route) => {
    const input = toolRequestSchema.parse(route.request().postDataJSON());
    if (input.name === 'reader_record' && ++saves === 1) {
      await route.fulfill({
        status: 500,
        json: { code: 'storage', error: '隔离测试：位置保存失败' },
      });
    } else await route.continue();
  });
  await page.getByRole('main', { name: '剧情正文' }).evaluate((element) => {
    element.scrollTop = 700;
    document.dispatchEvent(new Event('reader:flush'));
  });
  const alert = page.locator('.error-banner');
  await expect(alert).toContainText('阅读位置保存失败：隔离测试：位置保存失败');
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/tools') &&
      response.request().postDataJSON()?.name === 'reader_record' &&
      response.ok(),
  );
  await alert.getByRole('button', { name: '重试', exact: true }).click();
  await saved;
  await expect(alert).toHaveCount(0);
  const state = snapshotSchema.parse(
    await (
      await request.post('/api/tools', {
        data: { name: 'reader_snapshot', arguments: {} },
      })
    ).json(),
  ).state;
  expect(state.records['fixture-mist/1']?.furthestWords).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('clearing history awaits a newer queued save even if the earlier save fails', async ({
  page,
  request,
}) => {
  await first(page);
  const firstGate = deferred();
  const secondGate = deferred();
  let saves = 0;
  let clears = 0;
  await page.route('**/api/tools', async (route) => {
    const input = toolRequestSchema.parse(route.request().postDataJSON());
    if (input.name === 'reader_record') {
      saves++;
      if (saves === 1) {
        await firstGate.promise;
        return route.fulfill({
          status: 500,
          json: { code: 'storage', error: '隔离测试：前一保存失败' },
        });
      }
      if (saves === 2) await secondGate.promise;
    }
    if (input.name === 'reader_clear_history') clears++;
    await route.continue();
  });
  try {
    const reader = page.getByRole('main', { name: '剧情正文' });
    for (const offset of [700, 900]) {
      await reader.evaluate((element, value) => {
        element.scrollTop = value;
        document.dispatchEvent(new Event('reader:flush'));
      }, offset);
      if (offset === 700) await expect.poll(() => saves).toBe(1);
    }
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page
      .getByRole('button', { name: '清除全部阅读记录', exact: true })
      .click();
    await page
      .getByRole('button', { name: '确认清除全部', exact: true })
      .click();
    expect(clears).toBe(0);
    firstGate.resolve();
    await expect.poll(() => saves).toBe(2);
    // Wait for the reported predecessor failure so its queue microtasks have run.
    await expect(page.locator('.error-banner')).toContainText('前一保存失败');
    expect(clears).toBe(0);
    secondGate.resolve();
    await expect(
      page.getByText('全部阅读记录已清除。', { exact: true }),
    ).toBeVisible();
    expect(clears).toBe(1);
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('heading', { name: '剧情档案', exact: true }),
    ).toBeVisible();
    const state = snapshotSchema.parse(
      await (
        await request.post('/api/tools', {
          data: { name: 'reader_snapshot', arguments: {} },
        })
      ).json(),
    ).state;
    expect(state.records).toEqual({});
  } finally {
    firstGate.resolve();
    secondGate.resolve();
  }
});

test('a real view-transition callback failure reports a retryable navigation error instead of disappearing', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: '剧情档案', exact: true }),
  ).toBeVisible();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.evaluate(() => {
    const original = document.startViewTransition.bind(document);
    let fail = true;
    document.startViewTransition = (callback) =>
      original(async () => {
        if (fail) {
          fail = false;
          throw new Error('隔离测试：页面提交失败');
        }
        if (typeof callback === 'function') await callback();
        else await callback?.update?.();
      });
  });
  await page.getByRole('button', { name: '打开剧情：雾中来信' }).click();
  const alert = page.locator('.error-banner');
  await expect(alert).toContainText('隔离测试：页面提交失败');
  await expect(
    page.getByRole('heading', { name: '剧情档案', exact: true }),
  ).toBeVisible();
  await alert.getByRole('button', { name: '重试', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '雾中来信', exact: true }),
  ).toBeVisible();
  await expect(alert).toHaveCount(0);
  expect(errors).toEqual([]);
});
