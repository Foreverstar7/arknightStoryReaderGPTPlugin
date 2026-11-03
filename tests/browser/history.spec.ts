import { expect, test, type APIRequestContext } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { selectTheme } from './settings-helpers.js';
import {
  chapterSchema,
  snapshotSchema,
  toolRequestSchema,
} from '../../src/shared/contracts.js';

async function snapshot(request: APIRequestContext) {
  return snapshotSchema.parse(
    await (
      await request.post('/api/tools', {
        data: { name: 'reader_snapshot', arguments: {} },
      })
    ).json(),
  );
}
async function seed(request: APIRequestContext, id: string) {
  const chapter = chapterSchema.parse(
    await (
      await request.post('/api/tools', {
        data: { name: 'reader_chapter', arguments: { chapterId: id } },
      })
    ).json(),
  );
  const end = chapter.blocks.at(-1);
  if (!end) throw new Error('Empty fixture');
  await request.post('/api/tools', {
    data: {
      name: 'reader_record',
      arguments: {
        chapterId: id,
        revision: chapter.revision,
        last: { blockId: end.id, fraction: 1 },
        atEnd: true,
      },
    },
  });
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

test('story clearing supports cancel/retry, keeps other progress, and updates recent reading without changing the current directory', async ({
  page,
  request,
}) => {
  await seed(request, 'fixture-lights/1');
  await seed(request, 'fixture-mist/1');
  await page.goto('/');
  await expect(page.getByRole('main', { name: '剧情正文' })).toBeVisible();
  await page.getByRole('button', { name: '篇章目录', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '雾中来信', exact: true }),
  ).toBeVisible();
  const before = await snapshot(request);
  const clear = page.getByRole('button', {
    name: '清除本剧情阅读记录',
    exact: true,
  });
  await clear.focus();
  await page.keyboard.press('Enter');
  const confirmation = page.getByRole('group', {
    name: '确认清除本剧情阅读记录',
  });
  await expect(confirmation).toContainText('雾中来信');
  await confirmation.getByRole('button', { name: '取消', exact: true }).click();
  expect((await snapshot(request)).state.records).toEqual(before.state.records);
  let fail = true;
  await page.route('**/api/tools', async (route) => {
    const input = toolRequestSchema.parse(route.request().postDataJSON());
    if (input.name === 'reader_clear_history' && fail) {
      fail = false;
      return route.fulfill({
        status: 500,
        json: { code: 'storage', error: '隔离测试：清除暂时失败，请重试。' },
      });
    }
    await route.continue();
  });
  await clear.click();
  await confirmation.getByRole('button', { name: '确认清除此剧情' }).click();
  await expect(
    page.getByText('隔离测试：清除暂时失败，请重试。'),
  ).toBeVisible();
  expect((await snapshot(request)).state.records).toEqual(before.state.records);
  await confirmation.getByRole('button', { name: '确认清除此剧情' }).click();
  await expect(
    page.getByText('本剧情阅读记录已清除。', { exact: true }),
  ).toBeVisible();
  await expect(clear).toBeDisabled();
  await expect(
    page.getByRole('heading', { name: '雾中来信', exact: true }),
  ).toBeVisible();
  const after = await snapshot(request);
  expect(after.state.records).toEqual({
    'fixture-lights/1': before.state.records['fixture-lights/1'],
  });
  expect(after.state.recentChapterId).toBe('fixture-lights/1');
  await expect(
    page.getByRole('button', { name: '继续阅读', exact: false }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: '⌂ 主页', exact: true }).click();
  await expect(
    page.getByRole('progressbar', { name: '雾中来信阅读进度' }),
  ).toHaveText('0%');
  await page.reload();
  await expect(page.getByRole('main', { name: '剧情正文' })).toContainText(
    '灯火与归途',
  );
  expect(
    (await snapshot(request)).state.records['fixture-mist/1'],
  ).toBeUndefined();
});

test('global clearing lives in data management, clears all progress from an active reader and survives navigation/reload', async ({
  page,
  request,
}) => {
  await seed(request, 'fixture-lights/1');
  await seed(request, 'fixture-mist/1');
  await page.goto('/');
  await expect(page.getByRole('main', { name: '剧情正文' })).toBeVisible();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const panel = page.getByRole('dialog', { name: '阅读设置' });
  const globalClear = panel.getByRole('button', {
    name: '清除全部阅读记录',
    exact: true,
  });
  await expect(panel.getByRole('heading', { name: '数据管理' })).toBeVisible();
  expect(
    await globalClear.evaluate((element) => {
      const heading = [...document.querySelectorAll('h3')].find(
        (node) => node.textContent === '最近阅读',
      );
      return heading
        ? Boolean(
            element.compareDocumentPosition(heading) &
            Node.DOCUMENT_POSITION_FOLLOWING,
          )
        : false;
    }),
  ).toBe(true);
  await globalClear.click();
  const confirmation = panel.getByRole('group', {
    name: '确认清除全部阅读记录',
  });
  await expect(confirmation).toContainText('所有剧情');
  await confirmation.getByRole('button', { name: '取消', exact: true }).click();
  expect(Object.keys((await snapshot(request)).state.records)).toHaveLength(2);
  await globalClear.click();
  await confirmation
    .getByRole('button', { name: '确认清除全部', exact: true })
    .click();
  await expect(panel.getByRole('status')).toHaveText('全部阅读记录已清除。');
  await expect(globalClear).toBeDisabled();
  await expect(panel.getByText('还没有阅读记录。')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('heading', { name: '剧情档案', exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: '剧情档案', exact: true }),
  ).toBeVisible();
  expect((await snapshot(request)).state.records).toEqual({});
  await expect(page.locator('.recent-button')).toHaveCount(0);
  await expect(
    page.getByRole('progressbar', { name: '雾中来信阅读进度' }),
  ).toHaveText('0%');
  await expect(
    page.getByRole('progressbar', { name: '灯火与归途阅读进度' }),
  ).toHaveText('0%');
});

test('history controls remain readable and operable in narrow/medium/desktop/low windows and both themes', async ({
  page,
  request,
}) => {
  await seed(request, 'fixture-mist/1');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('main', { name: '剧情正文' })).toBeVisible();
  await page.getByRole('button', { name: '篇章目录', exact: true }).click();
  await mkdir('.ai/local/screenshots/history', { recursive: true });
  for (const theme of ['light', 'dark'] as const) {
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await selectTheme(page, theme);
    await expect(
      page.getByRole('dialog', { name: '阅读设置' }).getByRole('status'),
    ).toHaveText('已保存主题。');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.keyboard.press('Escape');
    for (const viewport of [
      { width: 320, height: 760 },
      { width: 768, height: 900 },
      { width: 1440, height: 900 },
      { width: 1024, height: 400 },
    ]) {
      await page.setViewportSize(viewport);
      await page
        .getByRole('button', { name: '清除本剧情阅读记录', exact: true })
        .click();
      const group = page.getByRole('group', { name: '确认清除本剧情阅读记录' });
      await group
        .getByRole('button', { name: '确认清除此剧情' })
        .scrollIntoViewIfNeeded();
      await expect(
        group.getByRole('button', { name: '确认清除此剧情' }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `.ai/local/screenshots/history/story-${theme}-${viewport.width}x${viewport.height}.png`,
      });
      await group.getByRole('button', { name: '取消', exact: true }).click();
      await page.getByRole('button', { name: '设置', exact: true }).click();
      await expect(
        page.getByRole('switch', { name: '深色模式', exact: true }),
      ).toHaveAttribute('aria-checked', String(theme === 'dark'));
      await page
        .getByRole('button', { name: '清除全部阅读记录', exact: true })
        .click();
      const global = page.getByRole('group', { name: '确认清除全部阅读记录' });
      await global
        .getByRole('button', { name: '确认清除全部' })
        .scrollIntoViewIfNeeded();
      await expect(
        global.getByRole('button', { name: '确认清除全部' }),
      ).toBeVisible();
      await page.screenshot({
        path: `.ai/local/screenshots/history/global-${theme}-${viewport.width}x${viewport.height}.png`,
      });
      await page.keyboard.press('Escape');
    }
  }
});
