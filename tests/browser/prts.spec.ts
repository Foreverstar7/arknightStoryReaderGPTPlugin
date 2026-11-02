import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import {
  chapterInputSchema,
  snapshotSchema,
  toolRequestSchema,
} from '../../src/shared/contracts.js';

async function snapshot(request: APIRequestContext) {
  const response = await request.post('/api/tools', {
    data: { name: 'reader_snapshot', arguments: {} },
  });
  expect(response.ok()).toBe(true);
  return snapshotSchema.parse(await response.json());
}
async function openFirst(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '打开剧情：骑兵与猎人' }).click();
  await page.getByRole('button', { name: '阅读 GT-1 日正当中 行动前' }).click();
  await expect(
    page.getByRole('heading', { name: '日正当中 行动前', exact: true }),
  ).toBeVisible();
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

test('the seven catalog groups preserve every source ID and the order inside each group', async ({
  page,
  request,
}) => {
  const data = await snapshot(request);
  const categories = [
    '主线',
    '支线',
    '故事集',
    '集成战略',
    '生息演算',
    '四月辑录',
    '其他',
  ];
  await page.goto('/');
  await expect(page.locator('.category-rail > button')).toHaveText(categories);
  await expect(page.locator('.section-heading h2')).toHaveText(categories);
  const groups = await page
    .locator('.library-scroll section')
    .evaluateAll((sections) =>
      sections.map((section) => ({
        category: section.querySelector('h2')?.textContent,
        ids: Array.from(section.querySelectorAll('.story-card'), (card) =>
          card.getAttribute('data-story-id'),
        ),
      })),
    );
  for (const group of groups) {
    const sourceType = group.category === '故事集' ? '剧情' : group.category;
    const expected = data.stories.filter((story) =>
      group.category === '其他'
        ? ![
            '主线',
            '支线',
            '剧情',
            '集成战略',
            '生息演算',
            '四月辑录',
          ].includes(story.type)
        : story.type === sourceType,
    );
    expect(group.ids).toEqual(expected.map((story) => story.id));
  }
  expect(groups.flatMap((group) => group.ids).sort()).toEqual(
    data.stories.map((story) => story.id).sort(),
  );
  const other = page.locator('.library-scroll section').last();
  await expect(other.locator('.card-meta')).toContainText([
    '特殊剧情',
    '特殊剧情',
    '危机合约',
    '荷谟伊智境',
    '长夜临光',
  ]);
  await expect(
    page
      .locator('.library-scroll section')
      .nth(2)
      .locator('.card-meta')
      .first(),
  ).toContainText('故事集');

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
      for (const category of categories) {
        const entry = page
          .getByRole('complementary', { name: '剧情分类' })
          .getByRole('button', { name: category, exact: true });
        const box = await entry.boundingBox();
        expect(box).not.toBeNull();
        if (!box) throw new Error('分类入口缺少可点击区域');
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
        await entry.click();
        const heading = page.getByRole('heading', {
          name: category,
          exact: true,
        });
        await expect(heading).toBeInViewport();
      }
      await page
        .getByRole('complementary', { name: '剧情分类' })
        .getByRole('button', { name: '主线', exact: true })
        .click();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(viewport.width);
      await page.screenshot({
        path: `.ai/local/screenshots/ui-categories-${theme}-${viewport.width}x${viewport.height}.png`,
      });
    }
  }
});

test('summary retry only reloads metadata; the summary then opens the real chapter', async ({
  page,
}) => {
  let failures = 2;
  const chapterRequests: string[] = [];
  await page.route('**/api/tools', async (route) => {
    const parsed = toolRequestSchema.safeParse(route.request().postDataJSON());
    if (!parsed.success) {
      await route.continue();
      return;
    }
    const data = parsed.data;
    const input = chapterInputSchema.safeParse(data.arguments);
    if (data.name === 'reader_chapter') chapterRequests.push('reader_chapter');
    if (
      data.name === 'reader_chapter_info' &&
      input.success &&
      input.data.chapterId === 'prts:GT-1 日正当中/BEG'
    ) {
      if (failures > 0) {
        failures -= 1;
        await route.fulfill({
          status: 503,
          json: { error: '测试：关卡简介暂时不可用' },
        });
        return;
      }
    }
    await route.continue();
  });
  await page.goto('/');
  await page.getByRole('button', { name: '打开剧情：骑兵与猎人' }).click();
  const failedCard = page.locator('.chapter-card').filter({
    has: page.getByRole('button', { name: '简介未加载 · 重试' }),
  });
  await expect(failedCard).toHaveCount(1);
  await failedCard.getByRole('button', { name: '简介未加载 · 重试' }).click();
  await expect(page.getByRole('region', { name: '横向篇目轴' })).toBeVisible();
  expect(chapterRequests).toEqual([]);
  await expect.poll(() => failures).toBe(0);
  const retry = failedCard.getByRole('button', { name: '简介未加载 · 重试' });
  await retry.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('button', { name: '简介未加载 · 重试' }),
  ).toHaveCount(0);
  const summary = page.locator('.chapter-card .chapter-summary').first();
  await expect(summary).toBeVisible();
  const box = await summary.boundingBox();
  if (!box) throw new Error('简介未出现');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByRole('main', { name: '剧情正文' })).toBeVisible();
  expect(chapterRequests).toHaveLength(1);
});

test('live PRTS catalog to two real bodies, persisted resume and unknown whole-story denominator', async ({
  page,
  request,
}) => {
  const imageRequests: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.resourceType() === 'image') imageRequests.push(request.url());
  });
  await openFirst(page);
  await expect(page.locator('.source-note')).toContainText('PRTS 真实剧情');
  await expect(page.getByRole('link', { name: 'PRTS 原文' })).toHaveAttribute(
    'href',
    /GT-1.*\/BEG$/,
  );
  await expect(page.locator('.body-copy')).not.toContainText('[Character');
  await expect(page.locator('.body-copy')).not.toContainText('[delay');
  await expect(page.locator('.progress')).toContainText(
    '全剧情已读 总字数待核实',
  );
  const name = page.getByRole('button', { name: '查看 ？？？ 的立绘' }).first();
  await name.hover();
  await expect(page.getByRole('dialog', { name: '？？？ 立绘' })).toHaveCount(
    0,
  );
  await name.click();
  await expect(page.getByText('此处没有可确认的场景立绘。')).toBeVisible();
  await page.keyboard.press('Escape');
  const reader = page.getByRole('main', { name: '剧情正文' });
  await reader.evaluate((element) => {
    element.scrollTop = 1100;
  });
  await page.getByRole('button', { name: '⌂ 主页', exact: true }).click();
  await expect(page.getByRole('heading', { name: '剧情档案' })).toBeVisible();
  const before = await snapshot(request);
  const id = 'prts:GT-1 日正当中/BEG';
  expect(before.stories.length).toBeGreaterThan(100);
  const cavalry = before.stories.find(
    (story) => story.id === 'prts:骑兵与猎人',
  );
  expect(cavalry?.chapters).toHaveLength(16);
  expect(cavalry?.chapters.every((chapter) => chapter.wordCount === null)).toBe(
    true,
  );
  expect(before.state.records[id]?.furthestWords).toBeGreaterThan(0);
  expect(before.state.records[id]?.totalWords).toBeGreaterThan(0);
  await page.getByRole('button', { name: '最近阅读：日正当中 行动前' }).click();
  await expect
    .poll(() => reader.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(1000);
  await page.reload();
  await expect
    .poll(() => reader.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(1000);
  await reader.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await page.getByRole('button', { name: '下一篇 →' }).click();
  await expect(
    page.getByRole('heading', { name: '日正当中 行动后', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.progress')).toContainText('总字数待核实');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page
    .getByRole('button', { name: '清理全部内容缓存', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText('阅读记录已保留');
  await page.keyboard.press('Escape');
  const after = await snapshot(request);
  expect(after.state.records[id]?.complete).toBe(true);
  expect(after.state.recentChapterId).toBe('prts:GT-1 日正当中/END');
  expect(after.state.records[id]?.furthestWords).toBeGreaterThanOrEqual(
    before.state.records[id]?.furthestWords ?? 0,
  );
  expect(imageRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test('an injected chapter HTTP failure can retry from the chapter list without losing the page', async ({
  page,
}) => {
  let failed = false;
  await page.route('**/api/tools', async (route) => {
    const data: unknown = route.request().postDataJSON();
    if (
      !failed &&
      typeof data === 'object' &&
      data !== null &&
      'name' in data &&
      data.name === 'reader_chapter'
    ) {
      failed = true;
      await route.fulfill({
        status: 503,
        json: { error: '测试注入：PRTS 暂时不可达' },
      });
    } else await route.continue();
  });
  await page.goto('/');
  await page.getByRole('button', { name: '打开剧情：骑兵与猎人' }).click();
  await page.getByRole('button', { name: '阅读 GT-1 日正当中 行动前' }).click();
  await expect(page.getByRole('alert')).toContainText('PRTS 暂时不可达');
  await expect(
    page.getByRole('heading', { name: '骑兵与猎人', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '日正当中 行动前', exact: true }),
  ).toBeVisible();
});

test('real titles and unknown progress remain usable at 320px, medium, desktop and low height in both themes', async ({
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
      await page.screenshot({
        path: `.ai/local/screenshots/prts-library-${suffix}.png`,
      });
      await page.getByRole('button', { name: '打开剧情：骑兵与猎人' }).click();
      await expect(
        page.getByRole('region', { name: '横向篇目轴' }),
      ).toBeVisible();
      await page.getByRole('slider', { name: '篇目浏览线' }).focus();
      await page.keyboard.press('End');
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
      await page.keyboard.press('Home');
      await page.screenshot({
        path: `.ai/local/screenshots/prts-chapters-${suffix}.png`,
      });
      await page
        .getByRole('button', { name: '阅读 GT-1 日正当中 行动前' })
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
        path: `.ai/local/screenshots/prts-reader-${suffix}.png`,
      });
    }
  }
});
