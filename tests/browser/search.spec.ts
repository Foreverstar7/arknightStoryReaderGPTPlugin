import { expect, test } from '@playwright/test';
import { snapshotSchema, chapterSchema } from '../../src/shared/contracts.js';

test('search works before body downloads and an explicit card target wins over recent reading', async ({
  page,
}) => {
  const chapterResponse = await page.request.post('/api/tools', {
    data: {
      name: 'reader_chapter',
      arguments: { chapterId: 'fixture-lights/1' },
    },
  });
  const chapter = chapterSchema.parse(await chapterResponse.json());
  await page.request.post('/api/tools', {
    data: {
      name: 'reader_record',
      arguments: {
        chapterId: chapter.id,
        revision: chapter.revision,
        historyToken: chapter.historyToken,
        last: { blockId: chapter.blocks[0]?.id, fraction: 0.4 },
        atEnd: false,
      },
    },
  });
  const snapshot = snapshotSchema.parse(
    await (
      await page.request.post('/api/tools', {
        data: { name: 'reader_snapshot', arguments: {} },
      })
    ).json(),
  );
  const target = snapshot.stories.find((story) => story.id === 'fixture-mist');
  expect(target).toBeTruthy();
  await page.goto(`/?search=${encodeURIComponent(target?.title ?? '')}`);
  await expect(
    page.getByRole('heading', { name: '剧情搜索', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.search-card')).toHaveCount(1);
  const coverBox = await page.locator('.search-card .cover').boundingBox();
  expect(coverBox).toBeTruthy();
  await expect(page.locator('.story-intro')).toHaveCount(0);
  await page
    .getByRole('button', { name: `查看《${target?.title}》篇章目录` })
    .focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.chapters h1')).toHaveText(target?.title ?? '');
  await expect(page.locator('.story-intro')).toContainText('原创剧情导语');
  await expect(page.locator('.reader')).toHaveCount(0);
  const after = snapshotSchema.parse(
    await (
      await page.request.post('/api/tools', {
        data: { name: 'reader_snapshot', arguments: {} },
      })
    ).json(),
  );
  expect(after.state.records).toEqual(snapshot.state.records);
  await page.getByRole('button', { name: '← 返回搜索结果' }).click();
  await expect(page.locator('.search-card')).toHaveCount(1);
  if (coverBox)
    await page.mouse.click(
      coverBox.x + coverBox.width / 2,
      coverBox.y + coverBox.height / 2,
    );
  await expect(page.locator('.chapters h1')).toHaveText(target?.title ?? '');
});

test('cast search groups multiple stories; network failure has an explicit retry instead of empty results', async ({
  page,
}) => {
  await page.goto('/?search=记录员&by=character');
  await expect(page.locator('.search-card')).toHaveCount(3);
  await page.route('**/api/tools', async (route) => {
    const request = route.request().postDataJSON();
    if (request.name === 'reader_search')
      await route.fulfill({
        status: 503,
        json: { code: 'network', error: '原创搜索断网验证，请重试。' },
      });
    else await route.continue();
  });
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('原创搜索断网验证');
  await expect(page.locator('.search-empty')).toHaveCount(0);
  await page.unroute('**/api/tools');
  await page.getByRole('button', { name: '重试搜索' }).click();
  await expect(page.locator('.search-card')).toHaveCount(3);
});

test('search and directory remain usable at narrow, medium, desktop and low-height sizes in both themes', async ({
  page,
}) => {
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    for (const [width, height] of [
      [320, 760],
      [768, 900],
      [1440, 960],
      [1024, 400],
    ]) {
      if (!width || !height) continue;
      await page.setViewportSize({ width, height });
      await page.goto('/?search=记录员&by=character');
      await expect(page.locator('.search-card')).toHaveCount(3);
      expect(
        await page
          .locator('.search-results')
          .evaluate((element) => element.scrollWidth <= element.clientWidth),
      ).toBe(true);
      await page.screenshot({
        path: `.ai/local/story-search/evidence/search-${width}-${height}-${colorScheme}.png`,
      });
      const first = page.locator('.search-card-open').first();
      await first.click();
      await expect(page.locator('.story-intro')).toBeVisible();
      await expect(
        page.locator('[data-search-match="true"]').first(),
      ).toBeVisible();
      expect(
        await page
          .locator('.chapters')
          .evaluate((element) => element.scrollWidth <= element.clientWidth),
      ).toBe(true);
      await page.screenshot({
        path: `.ai/local/story-search/evidence/plugin-${width}-${height}-${colorScheme}.png`,
      });
    }
  }
});
