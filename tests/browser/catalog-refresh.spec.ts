import { expect, test, type Page } from '@playwright/test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { FixtureSource } from '../../src/data/fixture.js';
import { ReaderService } from '../../src/server/service.js';
import { CacheCoordinator } from '../../src/storage/cache-coordinator.js';
import {
  snapshotSchema,
  snapshotInputSchema,
  toolRequestSchema,
} from '../../src/shared/contracts.js';
import { deferred } from '../helpers/deferred.js';
import { selectTheme } from './settings-helpers.js';

async function setup(page: Page) {
  // These tests hold a source response while exercising state authority; page
  // animation duration must not consume the transport's real timeout budget.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const base = path.resolve('.ai/local/catalog-refresh-browser');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, 'run-'));
  const fixture = new FixtureSource();
  const original = await fixture.catalog();
  const sample = original[0];
  if (!sample) throw new Error('Missing original fixture');
  const added = {
    ...sample,
    id: 'fixture-refresh-new',
    title: '原创新增剧情',
    chapters: [],
  };
  let catalog = original;
  const service = new ReaderService(
    {
      label: fixture.label,
      catalog: async () => catalog,
      chapter: (id) => fixture.chapter(id),
    },
    root,
  );
  const controls = {
    calls: 0,
    failure: false,
    hold: deferred(),
    staleSnapshot: deferred(),
    holdOrdinary: false,
    ordinaryHeld: false,
    addStory: true,
  };
  await page.route('**/api/tools', async (route) => {
    const input = toolRequestSchema.parse(route.request().postDataJSON());
    const refresh =
      input.name === 'reader_snapshot' &&
      snapshotInputSchema.parse(input.arguments).refreshCatalog === true;
    if (refresh) controls.calls++;
    const response = await service.call(input.name, input.arguments);
    if (refresh) {
      const gate = controls.hold.promise;
      await gate;
      if (controls.failure) {
        await route.fulfill({
          status: 400,
          json: { code: 'network', error: '原创测试：暂时无法连接 PRTS。' },
        });
        return;
      }
      if (controls.addStory) catalog = [...original, added];
      // Deliberately keep the pre-refresh private state to catch stale overwrites.
      await route.fulfill({
        json: { ...snapshotSchema.parse(response), stories: catalog },
      });
      return;
    }
    if (input.name === 'reader_snapshot' && controls.holdOrdinary) {
      controls.holdOrdinary = false;
      controls.ordinaryHeld = true;
      await controls.staleSnapshot.promise;
    }
    await route.fulfill({ json: response });
  });
  return {
    controls,
    service,
    async close() {
      controls.hold.resolve();
      controls.staleSnapshot.resolve();
      await page.unrouteAll({ behavior: 'wait' });
      new CacheCoordinator(root).close();
      await rm(root, { recursive: true, force: true });
    },
  };
}

const refreshButton = (page: Page) =>
  page.getByRole('button', { name: '刷新目录', exact: true });
const status = (page: Page) => page.locator('#catalog-refresh-status');
const home = (page: Page) =>
  page.getByRole('button', { name: '⌂ 主页', exact: true });
async function readFirst(page: Page) {
  await page
    .getByRole('button', { name: '打开剧情：雾中来信', exact: true })
    .click();
  await page
    .getByRole('button', { name: '阅读 档案 01 一封未寄出的信' })
    .click();
  await expect(page.getByRole('main', { name: '剧情正文' })).toBeVisible();
}

test('startup shows cached content while refreshing and preserves live reading/settings on a late result', async ({
  page,
}) => {
  const { controls, service, close } = await setup(page);
  try {
    await page.goto('/');
    await expect(status(page)).toHaveText('正在刷新目录…');
    await expect(refreshButton(page)).toBeDisabled();
    await readFirst(page);
    const reader = page.getByRole('main', { name: '剧情正文' });
    await reader.evaluate((node) => {
      node.scrollTop = 700;
    });
    await expect
      .poll(
        async () =>
          (await service.records.read()).records['fixture-mist/1']
            ?.furthestWords ?? 0,
      )
      .toBeGreaterThan(0);
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await selectTheme(page, 'dark');
    await page.keyboard.press('Escape');
    const before = await reader.evaluate((node) => node.scrollTop);
    controls.hold.resolve();
    await expect(status(page)).toHaveText('目录刷新成功');
    await expect(reader).toBeVisible();
    expect(await reader.evaluate((node) => node.scrollTop)).toBe(before);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(
      page.getByRole('button', { name: '最近阅读：一封未寄出的信' }),
    ).toBeVisible();
    await home(page).click();
    await expect(
      page.getByRole('button', { name: '打开剧情：原创新增剧情' }),
    ).toBeVisible();
    expect(controls.calls).toBe(1);
    await page.reload();
    await expect(reader).toBeVisible();
    await expect
      .poll(() => reader.evaluate((node) => node.scrollTop))
      .toBeGreaterThan(650);
    expect(controls.calls).toBe(2);
  } finally {
    await close();
  }
});

test('manual refresh retries failures, coalesces clicks and survives slow older navigation snapshots', async ({
  page,
}) => {
  const { controls, close } = await setup(page);
  try {
    controls.failure = true;
    controls.hold.resolve();
    await page.goto('/');
    await expect(status(page)).toContainText('目录刷新失败，保留已有目录');
    await expect(
      page.getByRole('button', { name: '打开剧情：雾中来信' }),
    ).toBeVisible();
    await readFirst(page);
    await home(page).click();
    expect(controls.calls).toBe(1);
    controls.failure = false;
    controls.hold = deferred();
    await refreshButton(page).focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await expect(refreshButton(page)).toBeDisabled();
    expect(controls.calls).toBe(2);
    controls.holdOrdinary = true;
    await page
      .getByRole('button', { name: '最近阅读：一封未寄出的信' })
      .click();
    await expect.poll(() => controls.ordinaryHeld).toBe(true);
    controls.hold.resolve();
    await expect(status(page)).toHaveText('目录刷新成功');
    controls.staleSnapshot.resolve();
    await expect(page.getByRole('main', { name: '剧情正文' })).toBeVisible();
    await home(page).click();
    await expect(
      page.getByRole('button', { name: '打开剧情：原创新增剧情' }),
    ).toBeVisible();
    expect(controls.calls).toBe(2);
  } finally {
    await close();
  }
});

test('late refresh does not restore cleared reading history', async ({
  page,
}) => {
  const { controls, service, close } = await setup(page);
  try {
    const chapter = await service.chapter('fixture-mist/1');
    await service.record({
      chapterId: chapter.id,
      revision: chapter.revision,
      last: { blockId: 'report', fraction: 0.5 },
      atEnd: false,
    });
    await page.goto('/');
    await expect(page.getByRole('main', { name: '剧情正文' })).toBeVisible();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page
      .getByRole('button', { name: '清除全部阅读记录', exact: true })
      .click();
    await page
      .getByRole('group', { name: '确认清除全部阅读记录' })
      .getByRole('button', { name: '确认清除全部', exact: true })
      .click();
    await expect
      .poll(async () => (await service.records.read()).recentChapterId)
      .toBeNull();
    await page.keyboard.press('Escape');
    controls.hold.resolve();
    await expect(status(page)).toHaveText('目录刷新成功');
    await expect(
      page.getByRole('button', { name: '最近阅读：一封未寄出的信' }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('progressbar', { name: '雾中来信阅读进度' }),
    ).toHaveAttribute('aria-valuenow', '0');
    expect((await service.records.read()).records).toEqual({});
  } finally {
    await close();
  }
});

test('clearing content discards a late UI refresh and touch can explicitly retry', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 320, height: 760 },
    hasTouch: true,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  const { controls, close } = await setup(page);
  try {
    await page.goto('/');
    await expect(status(page)).toHaveText('正在刷新目录…');
    await page.getByRole('button', { name: '设置', exact: true }).tap();
    await page
      .getByRole('button', { name: '清理剧情文本和图片缓存', exact: true })
      .tap();
    await expect(
      page.getByText('内容缓存已清理，阅读记录已保留。', { exact: true }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    controls.hold.resolve();
    await expect(status(page)).toHaveText('打开时自动检查目录更新');
    await expect(
      page.getByRole('button', { name: '打开剧情：原创新增剧情' }),
    ).toHaveCount(0);
    await refreshButton(page).tap();
    await expect(status(page)).toHaveText('目录刷新成功');
    await expect(
      page.getByRole('button', { name: '打开剧情：原创新增剧情' }),
    ).toBeAttached();
    expect(controls.calls).toBe(2);
  } finally {
    await close();
    await context.close();
  }
});

test('refresh feedback and keyboard control fit supported viewports, themes and reduced motion', async ({
  page,
}) => {
  const { controls, close } = await setup(page);
  try {
    controls.hold.resolve();
    await page.goto('/');
    await expect(status(page)).toHaveText('目录刷新成功');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mkdir('.ai/local/screenshots/catalog-refresh', { recursive: true });
    for (const theme of ['light', 'dark'] as const) {
      await page.getByRole('button', { name: '设置', exact: true }).click();
      await selectTheme(page, theme);
      await page.keyboard.press('Escape');
      for (const viewport of [
        { width: 320, height: 760 },
        { width: 768, height: 900 },
        { width: 1440, height: 900 },
        { width: 1024, height: 400 },
      ]) {
        await page.setViewportSize(viewport);
        controls.failure = viewport.width === 320;
        await refreshButton(page).focus();
        await page.keyboard.press('Enter');
        await expect(status(page)).toContainText(
          controls.failure ? '目录刷新失败' : '目录刷新成功',
        );
        await expect(refreshButton(page)).toBeFocused();
        expect(
          await page
            .locator('.library-scroll')
            .evaluate((node) => node.scrollWidth <= node.clientWidth),
        ).toBe(true);
        const box = await refreshButton(page).boundingBox();
        expect(
          box &&
            box.height >= 44 &&
            box.x >= 0 &&
            box.x + box.width <= viewport.width,
        ).toBeTruthy();
        await page.screenshot({
          path: `.ai/local/screenshots/catalog-refresh/${theme}-${viewport.width}.png`,
        });
      }
    }
  } finally {
    await close();
  }
});
