import { expect, test, type Page } from '@playwright/test';
import { snapshotSchema } from '../../src/shared/contracts.js';

const home = (page: Page) =>
  page.getByRole('button', { name: '⌂ 主页', exact: true });
const story = (page: Page) =>
  page.getByRole('button', { name: '打开剧情：雾中来信', exact: true });
const scrollTop = (page: Page) =>
  page.locator('.library-scroll').evaluate((node) => node.scrollTop);

test.beforeEach(async ({ page, request }) => {
  await request.post('/api/tools', {
    data: { name: 'reader_clear_history', arguments: {} },
  });
  // Extend only the original fixture catalogue, to exercise deep scrolling without
  // downloading unread stories or writing synthetic IDs to real reading records.
  await page.route('**/api/tools', async (route) => {
    if (route.request().postDataJSON().name !== 'reader_snapshot') {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const snapshot = snapshotSchema.parse(await response.json());
    const sample = snapshot.stories[0];
    if (!sample) throw new Error('缺少原创目录样本');
    const padding = Array.from({ length: 40 }, (_, index) => ({
      ...sample,
      id: `fixture-position-${index}`,
      title: `目录位置样例 ${index + 1}`,
      chapters: [],
    }));
    await route.fulfill({
      json: {
        ...snapshot,
        stories: [
          ...padding.slice(0, 20),
          ...snapshot.stories,
          ...padding.slice(20),
        ],
      },
    });
  });
});

test('home restores the last library position from both chapters and reading, across themes and viewports', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    for (const viewport of [
      { width: 320, height: 760 },
      { width: 768, height: 900 },
      { width: 1440, height: 900 },
      { width: 1024, height: 400 },
    ]) {
      await page.setViewportSize(viewport);
      await story(page).scrollIntoViewIfNeeded();
      const before = await scrollTop(page);
      expect(before).toBeGreaterThan(300);
      await story(page).click();
      await expect(page.locator('.chapters')).toBeVisible();
      await home(page).click();
      await expect.poll(() => scrollTop(page)).toBe(before);
      await home(page).click();
      expect(await scrollTop(page)).toBe(before);

      await story(page).click();
      await page
        .getByRole('button', { name: '阅读 档案 01 一封未寄出的信' })
        .click();
      await page.getByRole('main', { name: '剧情正文' }).evaluate((node) => {
        node.scrollTop = 240;
      });
      await home(page).click();
      await expect.poll(() => scrollTop(page)).toBe(before);
      await expect(story(page)).toBeInViewport();
      // A second departure captures the new position, not the first one forever.
      await page.locator('.library-scroll').evaluate((node) => {
        node.scrollTop += 90;
      });
      const changed = await scrollTop(page);
      await page
        .getByRole('button', { name: '最近阅读：一封未寄出的信' })
        .click();
      await expect(page.getByRole('main', { name: '剧情正文' })).toBeVisible();
      await home(page).click();
      await expect.poll(() => scrollTop(page)).toBe(changed);
    }
  }
});

for (const fallback of [false, true]) {
  test(`home restores a visible story across grid reflow before paint (${fallback ? 'fallback' : 'view transitions'})`, async ({
    page,
  }) => {
    await page.addInitScript((withoutTransitions) => {
      if (withoutTransitions) {
        Object.defineProperty(document, 'startViewTransition', {
          value: undefined,
          configurable: true,
        });
        return;
      }
      const original = document.startViewTransition.bind(document);
      document.startViewTransition = (update) =>
        original(async () => {
          if (typeof update === 'function') await update();
          else await update?.update?.();
          const library = document.querySelector('.library-scroll');
          if (library && library.getClientRects().length > 0)
            document.documentElement.dataset.librarySnapshotTop = String(
              library.scrollTop,
            );
        });
    }, fallback);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await story(page).scrollIntoViewIfNeeded();
    const anchor = await page.locator('.library-scroll').evaluate((node) => {
      const top = node.getBoundingClientRect().top;
      const card = Array.from(
        node.querySelectorAll<HTMLElement>('.story-card'),
      ).find((item) => item.getBoundingClientRect().bottom > top);
      if (!card) throw new Error('缺少可见剧情卡片');
      return {
        id: card.dataset.storyId,
        offset: card.getBoundingClientRect().top - top,
      };
    });
    await story(page).click();
    await expect(page.locator('.chapters')).toBeVisible();
    await page.setViewportSize({ width: 320, height: 760 });
    await home(page).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.library-scroll')).toBeVisible();
    const returnedOffset = () =>
      page.locator('.library-scroll').evaluate((node, id) => {
        const card = Array.from(
          node.querySelectorAll<HTMLElement>('.story-card'),
        ).find((item) => item.dataset.storyId === id);
        if (!card) throw new Error('恢复的剧情卡片不存在');
        return (
          card.getBoundingClientRect().top - node.getBoundingClientRect().top
        );
      }, anchor.id);
    await expect
      .poll(async () => Math.abs((await returnedOffset()) - anchor.offset))
      .toBeLessThan(1);
    const restored = await scrollTop(page);
    if (!fallback)
      await expect(page.locator('html')).toHaveAttribute(
        'data-library-snapshot-top',
        String(restored),
      );
    await page.evaluate(async () => {
      await Promise.allSettled(
        document.getAnimations().map((animation) => animation.finished),
      );
    });
    expect(await scrollTop(page)).toBe(restored);
  });
}
