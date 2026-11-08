import { expect, test, type Page } from '@playwright/test';
import {
  snapshotSchema,
  chapterSchema,
  toolRequestSchema,
} from '../../src/shared/contracts.js';
import { deferred } from '../helpers/deferred.js';

const search = (page: Page) => page.frameLocator('#app');
const reader = (page: Page) => page.frameLocator('#sidebar');
async function snapshot(page: Page) {
  const response = await page.request.post('/tool', {
    data: { name: 'reader_snapshot', arguments: {} },
  });
  const body = await response.json();
  return snapshotSchema.parse(body.structuredContent);
}
async function start(page: Page, source = 'arknights-reader-dev') {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/?delay=0&sidebar=${source}`);
  await expect(search(page).locator('.search-card')).toHaveCount(3);
  await page.request.post('/tool', {
    data: { name: 'reader_clear_history', arguments: {} },
  });
}
async function openMist(page: Page) {
  await search(page)
    .getByRole('button', { name: '查看《雾中来信》篇章目录' })
    .click();
  await expect(reader(page).locator('.chapters h1')).toHaveText('雾中来信');
}
async function readMist(page: Page) {
  await openMist(page);
  await reader(page)
    .getByRole('button', { name: '阅读 档案 01 一封未寄出的信', exact: true })
    .click();
  await expect(reader(page).locator('.reader-scroll')).toBeVisible();
  await expect
    .poll(async () =>
      Boolean((await snapshot(page)).state.records['fixture-mist/1']),
    )
    .toBe(true);
}
async function navigate(page: Page, path: string) {
  await page.getByLabel('侧栏路径', { exact: true }).fill(path);
  await page.getByRole('button', { name: '发送侧栏链接' }).click();
}

for (const source of ['arknights-reader', 'arknights-reader-dev']) {
  test(`search opens the ${source} sidebar entry with matches and keeps its original cards`, async ({
    page,
  }) => {
    await start(page, source);
    const before = (await snapshot(page)).state;
    const button = search(page).getByRole('button', {
      name: '查看《雾中来信》篇章目录',
    });
    await button.focus();
    await page.keyboard.press('Enter');
    await expect(reader(page).locator('.chapters h1')).toHaveText('雾中来信');
    await expect(
      reader(page).locator('[data-search-match="true"]'),
    ).toHaveCount(6);
    await expect(search(page).locator('.search-card')).toHaveCount(3);
    await expect(search(page).locator('.search-reader')).toHaveCount(0);
    await expect(page.locator('body')).toHaveAttribute('data-mode', 'inline');
    const link = new URL(
      (await page.getByLabel('打开的深链').textContent()) ?? '',
    );
    expect(link.pathname).toBe(
      `/arknights-story-reader@${source}/app/reader_open`,
    );
    expect(link.searchParams.get('path')).toContain(
      '/stories/fixture-mist?match=fixture-mist%2F1',
    );
    expect((await snapshot(page)).state).toEqual(before);
    await expect(page.getByLabel('侧栏加载次数')).toHaveText('1');
  });
}

test('the same link can return an active reader to its directory without reloading the sidebar', async ({
  page,
}) => {
  await start(page);
  await readMist(page);
  await reader(page)
    .locator('.reader-scroll')
    .evaluate((node) => {
      node.scrollTop = 750;
      document.dispatchEvent(new Event('reader:flush'));
    });
  await openMist(page);
  await expect(reader(page).locator('.reader-scroll')).toHaveCount(0);
  expect(
    (await snapshot(page)).state.records['fixture-mist/1']?.furthestWords,
  ).toBeGreaterThan(0);
  await search(page)
    .getByRole('button', { name: '查看《灯火与归途》篇章目录' })
    .click();
  await expect(reader(page).locator('.chapters h1')).toHaveText('灯火与归途');
  await expect(page.getByLabel('侧栏加载次数')).toHaveText('1');
});

test('a newer link during cold sidebar initialization wins over both an older link and recent reading', async ({
  page,
}) => {
  await start(page);
  const chapterResponse = await page.request.post('/tool', {
    data: {
      name: 'reader_chapter',
      arguments: { chapterId: 'fixture-mist/1' },
    },
  });
  const chapter = chapterSchema.parse(
    (await chapterResponse.json()).structuredContent,
  );
  await page.request.post('/tool', {
    data: {
      name: 'reader_record',
      arguments: {
        chapterId: chapter.id,
        revision: chapter.revision,
        historyToken: chapter.historyToken,
        last: { blockId: chapter.blocks[0]?.id, fraction: 0.2 },
        atEnd: false,
      },
    },
  });
  const gate = deferred();
  let snapshots = 0;
  let bodyReads = 0;
  await page.route('**/tool', async (route) => {
    const input = toolRequestSchema.parse(route.request().postDataJSON());
    if (input.name === 'reader_snapshot') {
      snapshots++;
      await gate.promise;
    }
    if (input.name === 'reader_chapter') bodyReads++;
    await route.continue();
  });
  try {
    await search(page)
      .getByRole('button', { name: '查看《灯火与归途》篇章目录' })
      .click();
    await expect.poll(() => snapshots).toBeGreaterThan(0);
    await navigate(page, '/stories/fixture-road');
    gate.resolve();
    await expect(reader(page).locator('.chapters h1')).toHaveText('长路回声');
    expect(bodyReads).toBe(0);
    expect((await snapshot(page)).state.recentChapterId).toBe('fixture-mist/1');
  } finally {
    gate.resolve();
  }
});

for (const fail of [false, true]) {
  test(`sidebar navigation drains a delayed ${fail ? 'failed' : 'successful'} save and keeps the latest destination`, async ({
    page,
  }) => {
    await start(page);
    await readMist(page);
    const gate = deferred();
    let saves = 0;
    await page.route('**/tool', async (route) => {
      const request = toolRequestSchema.parse(route.request().postDataJSON());
      if (request.name === 'reader_record' && ++saves === 1) {
        await gate.promise;
        if (fail) {
          await route.fulfill({
            json: {
              isError: true,
              content: [{ type: 'text', text: '原创验证：延迟保存失败' }],
              _meta: {
                readerError: {
                  code: 'storage',
                  message: '原创验证：延迟保存失败',
                },
              },
            },
          });
          return;
        }
      }
      await route.continue();
    });
    try {
      await reader(page)
        .locator('.reader-scroll')
        .evaluate((node) => {
          node.scrollTop = 800;
          document.dispatchEvent(new Event('reader:flush'));
        });
      await expect.poll(() => saves).toBe(1);
      await navigate(page, '/stories/fixture-lights');
      await navigate(page, '/stories/fixture-mist');
      await expect(reader(page).locator('.reader-scroll')).toBeVisible();
      gate.resolve();
      if (fail) {
        await expect(reader(page).getByRole('alert')).toContainText(
          '延迟保存失败',
        );
        await expect(reader(page).locator('.reader-scroll')).toBeVisible();
        await reader(page)
          .getByRole('button', { name: '重试', exact: true })
          .click();
      }
      await expect(reader(page).locator('.chapters h1')).toHaveText('雾中来信');
      await expect(reader(page).locator('.reader-scroll')).toHaveCount(0);
      expect(
        (await snapshot(page)).state.records['fixture-mist/1']?.furthestWords,
      ).toBeGreaterThan(0);
      await expect(page.getByLabel('侧栏加载次数')).toHaveText('1');
    } finally {
      gate.resolve();
    }
  });
}

test('invalid and missing targets keep the current reader, and a later valid link recovers', async ({
  page,
}) => {
  await start(page);
  await readMist(page);
  await navigate(page, 'https://example.invalid/stories/fixture-lights');
  await expect(reader(page).getByRole('alert')).toContainText('剧情链接无效');
  await expect(reader(page).locator('.reader-scroll')).toBeVisible();
  await navigate(page, '/stories/absent-original-story');
  await expect(reader(page).getByRole('alert')).toContainText('已不在当前目录');
  await expect(reader(page).locator('.reader-scroll')).toBeVisible();
  await navigate(page, '/stories/fixture-lights');
  await expect(reader(page).locator('.chapters h1')).toHaveText('灯火与归途');
  await expect(reader(page).getByRole('alert')).toHaveCount(0);
  await navigate(page, '/');
  await expect(reader(page).locator('.library')).toBeVisible();
  await expect(reader(page).locator('.reader-scroll')).toHaveCount(0);
});

test('host rejection offers retry or an explicit in-place open without automatically switching modes', async ({
  page,
}) => {
  await start(page);
  await page.getByLabel('拒绝侧栏跳转').check();
  await search(page)
    .getByRole('button', { name: '查看《雾中来信》篇章目录' })
    .click();
  await expect(search(page).getByRole('alert')).toContainText('未能打开侧栏');
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'inline');
  await expect(page.getByLabel('侧栏加载次数')).toHaveText('0');
  await page.getByLabel('拒绝侧栏跳转').uncheck();
  await search(page).getByRole('button', { name: '重试打开' }).click();
  await expect(reader(page).locator('.chapters h1')).toHaveText('雾中来信');
  await expect(search(page).getByRole('alert')).toHaveCount(0);
  await page.getByLabel('拒绝侧栏跳转').check();
  await search(page)
    .getByRole('button', { name: '查看《灯火与归途》篇章目录' })
    .click();
  await search(page).getByRole('button', { name: '在当前窗口打开' }).click();
  await expect(search(page).locator('.chapters h1')).toHaveText('灯火与归途');
});

test('sidebar links reflow at four window sizes and both themes with keyboard and reduced motion', async ({
  page,
}) => {
  await start(page);
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark')
      await page.getByRole('button', { name: '切换主题' }).click();
    for (const [width, height] of [
      [320, 760],
      [768, 900],
      [1440, 960],
      [1024, 400],
    ]) {
      if (!width || !height) continue;
      await page.setViewportSize({ width, height });
      await openMist(page);
      await expect(reader(page).locator('.chapter-open').first()).toBeVisible();
      expect(
        await reader(page)
          .locator('.chapters')
          .evaluate((node) => node.scrollWidth <= node.clientWidth),
      ).toBe(true);
      await page.locator('#sidebar').screenshot({
        path: `.ai/local/search-card-check/sidebar-${width}-${height}-${theme}.png`,
      });
      await reader(page).getByRole('button', { name: /主页/u }).focus();
      await page.keyboard.press('Enter');
      await expect(reader(page).locator('.library')).toBeVisible();
    }
  }
});
