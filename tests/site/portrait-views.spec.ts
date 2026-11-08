import { expect, test } from '@playwright/test';

test('square portrait selector supports both views, native keyboard controls and responsive popup bounds', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  for (const colorScheme of ['light', 'dark'] as const) {
    for (const viewport of [
      { width: 320, height: 760 },
      { width: 768, height: 900 },
      { width: 1440, height: 960 },
      { width: 1024, height: 400 },
    ]) {
      const context = await browser.newContext({
        viewport,
        colorScheme,
        reducedMotion: 'reduce',
      });
      try {
        const page = await context.newPage();
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.goto('/arknightStoryReaderGPTPlugin/demo/');
        await page
          .getByRole('button', { name: /^打开剧情：/ })
          .first()
          .click();
        await page.locator('.chapter-card').first().click();
        await page.locator('#name-report').click();
        const portrait = page.getByRole('dialog', {
          name: '角色占位符 A 立绘',
          exact: true,
        });
        const scene = portrait.getByRole('radio', {
          name: '场景立绘',
          exact: true,
        });
        const normal = portrait.getByRole('radio', {
          name: '默认立绘',
          exact: true,
        });
        await expect(scene).toBeChecked();
        await portrait.getByText('默认立绘', { exact: true }).click();
        await expect(normal).toBeChecked();
        await expect(portrait.locator('.source-image')).toHaveAttribute(
          'data-portrait-state',
          'default',
        );
        await normal.press('ArrowRight');
        await expect(scene).toBeChecked();
        await expect(portrait.locator('.source-image')).toHaveAttribute(
          'data-portrait-state',
          'original',
        );
        expect(
          await portrait.evaluate((node) => {
            const rect = node.getBoundingClientRect();
            return (
              rect.left >= 0 &&
              rect.right <= innerWidth &&
              rect.top >= 0 &&
              rect.bottom <= innerHeight
            );
          }),
        ).toBe(true);
        await portrait.screenshot({
          path: test
            .info()
            .outputPath(`portrait-views-${colorScheme}-${viewport.width}.png`),
        });
        await portrait.press('Escape');
        await expect(page.locator('#name-report')).toBeFocused();
        await page.locator('#name-anonymous').click();
        await expect(page.locator('.portrait-placeholder')).toContainText(
          '不推定身份',
        );
        await expect(
          page.getByRole('radio', { name: '默认立绘', exact: true }),
        ).toBeDisabled();
        await expect(
          page.getByRole('radio', { name: '场景立绘', exact: true }),
        ).toBeDisabled();
        expect(errors).toEqual([]);
      } finally {
        await context.close();
      }
    }
  }
});
