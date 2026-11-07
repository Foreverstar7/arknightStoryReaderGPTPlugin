import { expect, test, type Page } from '@playwright/test';

async function scrub(page: Page, time: number) {
  await page.evaluate((time) => {
    const root = document.querySelector<HTMLElement>('.walkthrough');
    if (!root) throw new Error('Missing walkthrough');
    const top = root.getBoundingClientRect().top + scrollY - 16;
    window.scrollTo({
      top:
        top +
        ((root.offsetHeight - innerHeight + 16) * time) /
          Number(root.dataset.timelineDuration),
      behavior: 'instant',
    });
  }, time);
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}

test('scroll controls the complete flow, pauses at rest and reverses the same geometry', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./');
  await expect(page.locator('.walkthrough')).toHaveClass(/motion-ready/u);
  await expect(page.locator('#reader-demo')).not.toHaveAttribute('src');
  const capture = async () =>
    page.locator('.walk-stage').evaluate((root) => {
      return [
        '.walk-home',
        '.walk-library',
        '.walk-chapters',
        '.walk-reader',
        '.walk-moving-cover',
        '.walk-chapter-track',
        '.walk-reading-copy',
      ].map((selector) => {
        const element = root.querySelector(selector);
        if (!element) throw new Error('Missing timeline element');
        const style = getComputedStyle(element);
        return {
          opacity: style.opacity,
          visibility: style.visibility,
          transform: style.transform,
        };
      });
    });
  for (const [time, scene] of [
    [2.3, 'home'],
    [5.0, 'library'],
    [9.9, 'chapters'],
    [13.6, 'reader'],
  ] as const) {
    await scrub(page, time);
    await expect(page.locator('.walkthrough')).toHaveAttribute(
      'data-scene',
      scene,
    );
    if (scene === 'home') {
      const stage = await page.locator('.walk-stage').boundingBox();
      const drawer = await page.locator('.walk-drawer').boundingBox();
      expect(stage && drawer && Math.abs(stage.x - drawer.x)).toBeLessThan(1);
    }
  }
  const end = await capture();
  await page.waitForTimeout(200);
  expect(await capture()).toEqual(end);
  await scrub(page, 7.1);
  const coverForward = await capture();
  await scrub(page, 17.7);
  await scrub(page, 7.1);
  expect(await capture()).toEqual(coverForward);
  await scrub(page, 5.0);
  await expect(page.locator('.walk-library')).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator('.walk-cover-selected img')
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(0);
  await page.setViewportSize({ width: 320, height: 760 });
  await scrub(page, 10.7);
  const viewport = await page.locator('.walk-axis-viewport').boundingBox();
  const selected = await page.locator('.walk-chapter-selected').boundingBox();
  expect(
    viewport &&
      selected &&
      selected.x >= viewport.x &&
      selected.x + selected.width <= viewport.x + viewport.width,
  ).toBe(true);
  await scrub(page, 0);
  await expect(page.locator('.walk-home')).toBeVisible();
  expect(errors).toEqual([]);
});

test('real reader loads only on demand, supports reading/settings/resume/reset and stays independent of the animation', async ({
  page,
}) => {
  const requests: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./');
  const summary = page.locator('#try-reader > summary');
  await summary.focus();
  await summary.press('Enter');
  const frame = page.frameLocator('#reader-demo');
  await expect(
    frame.locator('.story-card').filter({ hasText: '雾中来信' }),
  ).toContainText('40%');
  await expect(
    frame.locator('.story-card').filter({ hasText: '灯火与归途' }),
  ).toContainText('32%');
  await frame.getByRole('button', { name: '最近阅读：路口 · 行动前' }).click();
  await expect(frame.locator('.reading-heading h1')).toHaveText(
    '路口 · 行动前',
  );
  const before = await frame
    .locator('.reader-scroll')
    .evaluate((node) => node.scrollTop);
  expect(before).toBeGreaterThan(0);
  await frame.locator('.reader-scroll').evaluate((node) => {
    node.scrollTop += 220;
  });
  await expect
    .poll(() =>
      frame.locator('.reader-scroll').evaluate((node) => node.scrollTop),
    )
    .toBeGreaterThan(before);
  const readPosition = await frame
    .locator('.reader-scroll')
    .evaluate((node) => node.scrollTop);
  await frame.getByRole('button', { name: '设置', exact: true }).click();
  await expect(frame.getByRole('dialog')).toBeVisible();
  await frame.getByRole('dialog').press('Escape');
  await page.locator('#try-reader > summary').click();
  await scrub(page, 2.3);
  await scrub(page, 16.5);
  await page.locator('#try-reader > summary').click();
  await expect(frame.locator('.reading-heading h1')).toHaveText(
    '路口 · 行动前',
  );
  expect(
    await frame.locator('.reader-scroll').evaluate((node) => node.scrollTop),
  ).toBe(readPosition);
  await page.reload();
  await expect(page.locator('#reader-demo')).not.toHaveAttribute('src');
  await page.locator('#try-reader > summary').click();
  await frame.getByRole('button', { name: '最近阅读：路口 · 行动前' }).click();
  await expect
    .poll(() =>
      frame.locator('.reader-scroll').evaluate((node) => node.scrollTop),
    )
    .toBeGreaterThan(before);
  await page.getByRole('button', { name: '重置演示', exact: true }).click();
  await expect(
    frame.getByRole('heading', { name: '剧情档案', exact: true }),
  ).toBeVisible();
  await expect(
    frame.locator('.story-card').filter({ hasText: '雾中来信' }),
  ).toContainText('40%');
  expect(requests.some((url) => url.includes('/api/'))).toBe(false);
  expect(
    requests.every((url) => new URL(url).origin === 'http://127.0.0.1:4330'),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test('four viewport sizes and both themes keep the animation and interactive reader readable', async ({
  page,
}) => {
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'no-preference' });
    for (const viewport of [
      { width: 320, height: 760 },
      { width: 768, height: 900 },
      { width: 1440, height: 960 },
      { width: 1024, height: 400 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('./');
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (viewport.height <= 480) {
        await expect(page.locator('.walkthrough')).toHaveClass(
          /motion-static/u,
        );
        await page.locator('.walk-window').scrollIntoViewIfNeeded();
      } else {
        await expect(page.locator('.walkthrough')).toHaveClass(/motion-ready/u);
        await scrub(page, 9.9);
      }
      await page.screenshot({
        path: test
          .info()
          .outputPath(`flow-${colorScheme}-${viewport.width}.png`),
      });
      await page.locator('#try-reader > summary').click();
      const frame = page.frameLocator('#reader-demo');
      await expect(
        frame.locator('.story-card').filter({ hasText: '雾中来信' }),
      ).toBeVisible();
      expect(
        await frame
          .locator('html')
          .evaluate((node) => node.scrollWidth <= innerWidth),
      ).toBe(true);
      await page.screenshot({
        path: test
          .info()
          .outputPath(`interactive-${colorScheme}-${viewport.width}.png`),
      });
      await page.getByRole('link', { name: '安装指南', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: '安装指南', exact: true }),
      ).toBeInViewport();
      await expect(
        page.getByRole('link', { name: '查看完整安装指南' }),
      ).toHaveAttribute('href', /#quick-start$/u);
      await page.getByText('这是官方项目吗？', { exact: true }).click();
      await expect(
        page.getByText('这是个人维护的非官方项目', { exact: false }),
      ).toBeVisible();
    }
  }
});

test('reduced motion uses static steps, can change live, and demo storage errors have a reset recovery', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  await expect(page.locator('.walkthrough')).toHaveClass(/motion-static/u);
  expect(
    await page.locator('.walkthrough').evaluate((node) => node.clientHeight),
  ).toBeLessThan(800);
  await expect(page.locator('.walk-reader')).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('.walkthrough')).toHaveClass(/motion-ready/u);
  await scrub(page, 9.9);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.walkthrough')).toHaveClass(/motion-static/u);
  await page.evaluate(() =>
    sessionStorage.setItem('arknights-reader.website-demo.v1', '{broken'),
  );
  await page.locator('#try-reader > summary').click();
  const frame = page.frameLocator('#reader-demo');
  await expect(frame.getByRole('alert')).toContainText('无法读取本页样例记录');
  await frame
    .getByRole('button', { name: '重置样例记录', exact: true })
    .click();
  await expect(
    frame.locator('.story-card').filter({ hasText: '雾中来信' }),
  ).toBeVisible();
});

test('320px touch gestures advance the page and the real cover/chapter path is tappable', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 320, height: 760 },
    isMobile: true,
    hasTouch: true,
  });
  try {
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4330/arknightStoryReaderGPTPlugin/');
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: 160, y: 640 }],
    });
    for (let index = 1; index <= 10; index++) {
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(resolve)),
      );
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: 160, y: 640 - 35 * index }],
      });
    }
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(100);
    await page.locator('#try-reader > summary').tap();
    const frame = page.frameLocator('#reader-demo');
    await frame
      .getByRole('button', { name: '打开剧情：雾中来信', exact: true })
      .tap();
    await expect(frame.locator('.timeline-scroll')).toBeVisible();
    await frame.locator('.timeline-scroll button').first().tap();
    await expect(frame.locator('.reading-heading h1')).toHaveText(
      '一封未寄出的信',
    );
    await cdp.detach();
  } finally {
    await context.close();
  }
});
