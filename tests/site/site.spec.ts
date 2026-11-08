import { expect, test, type Page } from '@playwright/test';
import {
  WALK_CONTENT_DURATION,
  WALK_HOLDS,
  WALK_SCROLL_SVH,
} from '../../website/walkthrough-timing.js';

async function scrub(page: Page, time: number) {
  const duration = Math.max(0, Math.min(WALK_CONTENT_DURATION, time));
  const motion =
    WALK_SCROLL_SVH - WALK_HOLDS.reduce((sum, hold) => sum + hold.span, 0);
  const earlier = WALK_HOLDS.filter((hold) => hold.at < duration).reduce(
    (sum, hold) => sum + hold.span,
    0,
  );
  const hold = WALK_HOLDS.find((hold) => hold.at === duration);
  await scrubDistance(
    page,
    (duration / WALK_CONTENT_DURATION) * motion +
      earlier +
      (hold ? hold.span / 2 : 0),
  );
}

async function scrubDistance(page: Page, distance: number) {
  await page.evaluate(
    ({ distance, total }) => {
      const root = document.querySelector<HTMLElement>('.walkthrough');
      if (!root) throw new Error('Missing walkthrough');
      const top = root.getBoundingClientRect().top + scrollY - 16;
      window.scrollTo({
        top: top + ((root.offsetHeight - innerHeight + 16) * distance) / total,
        behavior: 'instant',
      });
    },
    { distance, total: WALK_SCROLL_SVH },
  );
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}

async function expectBottomComposer(page: Page) {
  const gaps = await page.locator('#demo-home-panel').evaluate((panel) => {
    const form = panel.querySelector('#demo-search-form');
    const messages = panel.querySelector('.chat-scroll');
    const windowBody = panel.closest('.window-body');
    if (!form || !messages || !windowBody)
      throw new Error('Missing conversation controls');
    // Read in one frame while native focus scrolling may move the outer page.
    const panelBounds = panel.getBoundingClientRect();
    const formBounds = form.getBoundingClientRect();
    const messageBounds = messages.getBoundingClientRect();
    const windowBounds = windowBody.getBoundingClientRect();
    return {
      bottom: Math.abs(formBounds.bottom - panelBounds.bottom),
      messages: Math.abs(messageBounds.bottom - formBounds.top),
      overflow: Math.max(0, formBounds.bottom - windowBounds.bottom),
    };
  });
  expect(gaps.bottom).toBeLessThan(1);
  expect(gaps.messages).toBeLessThan(1);
  expect(gaps.overflow).toBeLessThan(1);
}

test('same-window conversation route follows sidebar reading and preset cards open the existing demo directory', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./');
  await scrub(page, 8.9);
  await expect(page.locator('.walk-reader')).toBeVisible();
  await scrub(page, 15.4);
  await expect(page.locator('.walk-search-card')).toBeVisible();
  await expect(page.locator('.walkthrough')).toHaveAttribute(
    'data-entrypoint',
    'conversation',
  );
  const forward = await page
    .locator('.walk-search')
    .evaluate((node) => getComputedStyle(node).opacity);
  await scrub(page, 17.5);
  await expect(page.locator('.walk-chapters')).toBeVisible();
  await expect(page.locator('.walk-chapters .walk-intro')).toBeVisible();
  await scrub(page, 15.4);
  expect(
    await page
      .locator('.walk-search')
      .evaluate((node) => getComputedStyle(node).opacity),
  ).toBe(forward);
  await expect(page.locator('#reader-demo')).not.toHaveAttribute('src');
  await page.locator('#try-reader > summary').click();
  const frame = page.frameLocator('#reader-demo');
  await expect(
    frame.locator('.story-card').filter({ hasText: '孤星' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: '首页：示例对话', exact: true })
    .click();
  await expectBottomComposer(page);
  await page.locator('#demo-search-input').fill('未支持的演示输入');
  await page.locator('#demo-search-input').press('Enter');
  await expect(page.locator('#demo-search-status')).toContainText(
    '此演示支持预设输入',
  );
  await page.locator('#demo-search-input').fill('帮我找一下《孤星》');
  await page.locator('#demo-search-input').press('Enter');
  await expect(page.locator('.demo-result-card')).toHaveCount(1);
  await expect(page.locator('.demo-result-card img')).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator('.demo-result-card img')
        .evaluate((node: HTMLImageElement) => node.naturalWidth),
    )
    .toBeGreaterThan(0);
  await expect(page.locator('.demo-result-card')).not.toContainText('简介');
  await page
    .getByRole('button', { name: '查看《孤星》篇章目录', exact: true })
    .click();
  await expect(frame.locator('.chapters h1')).toHaveText('孤星');
  await expect(frame.locator('.story-intro')).toContainText('不对应原作剧情');
  await page.screenshot({
    path: test.info().outputPath('site-directory.png'),
  });
  expect(errors).toEqual([]);
});

test('preset search remains readable and keyboard operable in four viewport sizes and both themes', async ({
  page,
}) => {
  test.setTimeout(60_000);
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'no-preference' });
    for (const [width, height] of [
      [320, 760],
      [768, 900],
      [1440, 960],
      [1024, 400],
    ]) {
      if (!width || !height) continue;
      await page.setViewportSize({ width, height });
      await page.goto('./');
      if (height > 480) {
        await scrub(page, 15.4);
        await expect(page.locator('.walk-search-card')).toBeVisible();
        const stage = await page.locator('.walk-stage').boundingBox();
        const card = await page.locator('.walk-search-card').boundingBox();
        expect(
          stage &&
            card &&
            card.x >= stage.x &&
            card.x + card.width <= stage.x + stage.width &&
            card.y + card.height <= stage.y + stage.height,
        ).toBe(true);
        await page.locator('.walk-window').screenshot({
          path: test
            .info()
            .outputPath(`walk-search-${width}-${colorScheme}.png`),
        });
      }
      await page.locator('#try-reader > summary').click();
      await expect(
        page.frameLocator('#reader-demo').locator('.story-card'),
      ).toHaveCount(6);
      await page.locator('[data-host-view="home"]:visible').first().click();
      await expectBottomComposer(page);
      await page.locator('#demo-search-input').focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('.demo-result-card')).toHaveCount(1);
      await expectBottomComposer(page);
      await page.locator('.chat-scroll').hover();
      await page.mouse.wheel(0, -2000);
      await expect
        .poll(() =>
          page.locator('.chat-scroll').evaluate((node) => node.scrollTop),
        )
        .toBe(0);
      await expectBottomComposer(page);
      await page.locator('.chat-scroll').focus();
      await page.keyboard.press('End');
      await expect
        .poll(() =>
          page
            .locator('.chat-scroll')
            .evaluate((node) =>
              Math.abs(node.scrollHeight - node.clientHeight - node.scrollTop),
            ),
        )
        .toBeLessThan(1);
      await expectBottomComposer(page);
      expect(
        await page
          .locator('#demo-home-panel')
          .evaluate((node) => node.scrollWidth <= node.clientWidth),
      ).toBe(true);
      await page.locator('.demo-window').screenshot({
        path: test
          .info()
          .outputPath(`site-search-${width}-${height}-${colorScheme}.png`),
      });
      await page
        .getByRole('button', { name: '查看《孤星》篇章目录', exact: true })
        .focus();
      await expectBottomComposer(page);
      await page.keyboard.press('Enter');
      await expect(
        page.frameLocator('#reader-demo').locator('.chapters h1'),
      ).toHaveText('孤星');
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  }
  await page.locator('[data-host-view="home"]:visible').first().click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const [width, height] of [
    [1440, 960],
    [320, 760],
    [1024, 400],
    [768, 900],
  ]) {
    if (!width || !height) continue;
    await page.setViewportSize({ width, height });
    await expect(page.locator('.demo-result-card')).toHaveCount(1);
    await expectBottomComposer(page);
  }
});

test('scroll controls the complete flow, pauses at rest and reverses the same geometry', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./');
  await expect(page.locator('.walkthrough')).toHaveClass(/motion-ready/u);
  await expect(page.locator('.walkthrough')).toHaveAttribute(
    'data-timeline-duration',
    String(WALK_CONTENT_DURATION),
  );
  await expect(page.locator('#reader-demo')).not.toHaveAttribute('src');
  const capture = async () =>
    page.locator('.walkthrough').evaluate((root) => {
      return [
        '.walk-home',
        '.walk-library',
        '.walk-chapters',
        '.walk-reader',
        '.walk-moving-cover',
        '.walk-chapter-track',
        '.walk-reading-copy',
        '.walk-drawer',
        '.walk-cursor',
        '.walk-progress span',
      ].map((selector) => {
        const element = root.querySelector(selector);
        if (!element) throw new Error(`Missing timeline element: ${selector}`);
        const style = getComputedStyle(element);
        return {
          opacity: style.opacity,
          visibility: style.visibility,
          transform: new DOMMatrixReadOnly(
            style.transform === 'none' ? undefined : style.transform,
          ).toString(),
        };
      });
    });
  for (const [time, scene] of [
    [2.18, 'home'],
    [3.45, 'library'],
    [5.85, 'chapters'],
    [8.9, 'reader'],
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
  for (const hold of WALK_HOLDS) {
    await scrubDistance(page, hold.start + hold.span * 0.2);
    await expect(page.locator('.walkthrough')).toHaveAttribute(
      'data-hold',
      hold.id,
    );
    const pose = await capture();
    await scrubDistance(page, hold.end - hold.span * 0.2);
    expect(
      await capture(),
      `${hold.id} must stay frozen while consuming more scroll`,
    ).toEqual(pose);
    await scrubDistance(page, hold.end + hold.span * 0.2);
    await expect(page.locator('.walkthrough')).not.toHaveAttribute('data-hold');
    expect(await capture()).not.toEqual(pose);
    await scrubDistance(page, hold.start + hold.span * 0.2);
    expect(
      await capture(),
      `${hold.id} must return to the same pose when reversing`,
    ).toEqual(pose);
    await page.screenshot({
      path: test.info().outputPath(`hold-${hold.id}.png`),
    });
  }
  const libraryHold = WALK_HOLDS.find((hold) => hold.id === 'library');
  if (!libraryHold) throw new Error('Missing library stop');
  await scrubDistance(page, libraryHold.start + libraryHold.span * 0.15);
  const paused = await capture();
  const beforeWheel = await page.evaluate(() => scrollY);
  await page.locator('.walk-stage').hover({ position: { x: 12, y: 12 } });
  await page.mouse.wheel(0, 24);
  await expect
    .poll(() => page.evaluate(() => scrollY))
    .toBeGreaterThan(beforeWheel);
  await expect(page.locator('.walkthrough')).toHaveAttribute(
    'data-hold',
    'library',
  );
  expect(await capture()).toEqual(paused);
  await page.mouse.wheel(0, (960 * libraryHold.span) / 100);
  await expect(page.locator('.walkthrough')).not.toHaveAttribute('data-hold');
  expect(await capture()).not.toEqual(paused);
  await scrub(page, 5.3);
  const coverForward = await capture();
  await scrub(page, 11.8);
  await scrub(page, 5.3);
  expect(await capture()).toEqual(coverForward);
  await page.setViewportSize({ width: 768, height: 900 });
  await scrub(page, 5.3);
  const compactCover = await capture();
  await scrub(page, 11.8);
  await scrub(page, 5.3);
  expect(await capture()).toEqual(compactCover);
  await page.setViewportSize({ width: 1440, height: 960 });
  await scrub(page, 5.3);
  expect(await capture()).toEqual(coverForward);
  await scrub(page, 3.45);
  await expect(page.locator('.walk-library')).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator('.walk-cover-selected img')
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(0);
  await page.setViewportSize({ width: 320, height: 760 });
  await scrub(page, 7.56);
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
    frame.locator('.story-card').filter({ hasText: '孤星' }),
  ).toContainText('40%');
  await expect(
    frame.locator('.story-card').filter({ hasText: '剧情标题占位符 03' }),
  ).toContainText('32%');
  await frame
    .getByRole('button', { name: '最近阅读：篇目标题占位符 03' })
    .click();
  await expect(frame.locator('.reading-heading h1')).toHaveText(
    '篇目标题占位符 03',
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
  await scrub(page, 2.18);
  await scrub(page, 11.8);
  await page.locator('#try-reader > summary').click();
  await expect(frame.locator('.reading-heading h1')).toHaveText(
    '篇目标题占位符 03',
  );
  expect(
    await frame.locator('.reader-scroll').evaluate((node) => node.scrollTop),
  ).toBe(readPosition);
  await page.reload();
  await expect(page.locator('#reader-demo')).not.toHaveAttribute('src');
  await page.locator('#try-reader > summary').click();
  await frame
    .getByRole('button', { name: '最近阅读：篇目标题占位符 03' })
    .click();
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
    frame.locator('.story-card').filter({ hasText: '孤星' }),
  ).toContainText('40%');
  expect(requests.some((url) => url.includes('/api/'))).toBe(false);
  expect(
    requests.every((url) => new URL(url).origin === new URL(page.url()).origin),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test('four viewport sizes and both themes keep the animation and interactive reader readable', async ({
  page,
}) => {
  test.setTimeout(60_000);
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
        await scrub(page, 8.9);
      }
      await page.screenshot({
        path: test
          .info()
          .outputPath(`flow-${colorScheme}-${viewport.width}.png`),
      });
      await page.locator('#try-reader > summary').click();
      const frame = page.frameLocator('#reader-demo');
      await expect(
        frame.locator('.story-card').filter({ hasText: '孤星' }),
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
      await frame
        .getByRole('button', {
          name: '打开剧情：孤星',
          exact: true,
        })
        .click();
      await expect(frame.locator('.mini-cover .source-image')).toHaveAttribute(
        'data-image-state',
        'ready',
      );
      await frame.locator('.chapter-card').first().click();
      await frame
        .getByRole('button', { name: '查看 CG', exact: false })
        .click();
      await expect(frame.locator('.cg-image .source-image')).toHaveAttribute(
        'data-image-state',
        'ready',
      );
      await frame.locator('.cg-wrap').scrollIntoViewIfNeeded();
      await page.screenshot({
        path: test
          .info()
          .outputPath(`scene-${colorScheme}-${viewport.width}.png`),
      });
      await frame.locator('.reader-scroll').evaluate((node) => {
        node.scrollTop = 0;
      });
      await frame.locator('#name-report').click();
      await expect(frame.locator('.portrait .source-image')).toHaveAttribute(
        'data-image-state',
        'ready',
      );
      const fits = await frame.locator('.portrait').evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return (
          rect.left >= 0 &&
          rect.right <= innerWidth &&
          rect.top >= 0 &&
          rect.bottom <= innerHeight
        );
      });
      expect(fits).toBe(true);
      await page.locator('.demo-window').scrollIntoViewIfNeeded();
      const popup = await frame.locator('.portrait').boundingBox();
      expect(
        popup && popup.y >= 0 && popup.y + popup.height <= viewport.height,
      ).toBe(true);
      await page.screenshot({
        path: test
          .info()
          .outputPath(`portrait-${colorScheme}-${viewport.width}.png`),
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

test('local images support manual loading, portrait retry, keyboard dismissal and neutral anonymous display', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let rabbitRequests = 0;
  await page.route('**/*rabbit-portrait*.webp', async (route) => {
    rabbitRequests++;
    if (rabbitRequests === 1)
      await route.fulfill({ status: 503, body: 'temporary failure' });
    else await route.continue();
  });
  await page.goto('./');
  await page.locator('#try-reader > summary').click();
  const frame = page.frameLocator('#reader-demo');
  await frame
    .getByRole('button', { name: '打开剧情：孤星', exact: true })
    .click();
  await frame.locator('.chapter-card').first().click();
  await expect(frame.locator('.cg-image')).toHaveCount(0);
  await frame.locator('#name-report').hover();
  await expect(frame.locator('.portrait')).toHaveCount(0);
  expect(rabbitRequests).toBe(0);
  await frame.locator('#name-report').focus();
  await frame.locator('#name-report').press('Enter');
  await expect(frame.locator('.portrait .image-error')).toContainText(
    'HTTP 503',
  );
  await page
    .locator('#reader-demo')
    .evaluate((node) =>
      node.scrollIntoView({ block: 'start', behavior: 'instant' }),
    );
  await frame.getByRole('button', { name: '重试图片', exact: true }).click();
  await expect(frame.locator('.portrait .source-image')).toHaveAttribute(
    'data-image-state',
    'ready',
  );
  await expect(frame.locator('.portrait .image-source')).toHaveText(
    '演示素材原图',
  );
  await frame.locator('.portrait').press('Escape');
  await expect(frame.locator('#name-report')).toBeFocused();
  await expect(frame.locator('.portrait')).toHaveCount(0);
  await frame.getByRole('button', { name: '查看 CG', exact: false }).click();
  await expect(frame.locator('.cg-image .source-image')).toHaveAttribute(
    'data-image-state',
    'ready',
  );
  await frame.getByRole('button', { name: '收起 CG', exact: false }).click();
  await expect(frame.locator('.cg-image')).toHaveCount(0);
  await frame.locator('#name-anonymous').click();
  await expect(frame.locator('.portrait-placeholder')).toContainText(
    '不推定身份',
  );
  await expect(frame.locator('.portrait .source-image')).toHaveCount(0);
  expect(rabbitRequests).toBe(2);
  await frame.getByRole('button', { name: '设置', exact: true }).click();
  await frame
    .getByRole('switch', { name: '自动显示图片', exact: true })
    .click();
  await expect(
    frame.getByRole('switch', { name: '自动显示图片', exact: true }),
  ).toBeChecked();
  await frame.getByRole('dialog', { name: '阅读设置' }).press('Escape');
  await frame.getByRole('button', { name: '篇章目录', exact: true }).click();
  await frame.locator('.chapter-card').nth(1).click();
  await frame.locator('.cg-wrap').scrollIntoViewIfNeeded();
  await expect(frame.locator('.cg-image .source-image')).toHaveAttribute(
    'data-image-state',
    'ready',
  );
  await frame.locator('.reader-scroll').evaluate((node) => {
    node.scrollTop = 0;
  });
  await frame.locator('#name-reply').hover();
  await expect(frame.locator('.portrait .source-image')).toHaveAttribute(
    'data-image-state',
    'ready',
  );
  await expect(frame.locator('.name-hint')).toHaveCount(0);
  expect(
    await frame
      .locator('#name-reply')
      .evaluate((node) => getComputedStyle(node).textDecorationLine),
  ).toBe('none');
  await frame.locator('.portrait').hover();
  await expect(frame.locator('.portrait .image-source')).toBeVisible();
  await frame.locator('.reading-heading').hover();
  await expect(frame.locator('.portrait')).toHaveCount(0);
  await frame.locator('#name-reply').hover();
  await expect(frame.locator('.portrait')).toBeVisible();
  await frame.locator('#name-reply').click();
  await frame.locator('.reading-heading').hover();
  await expect(frame.locator('.portrait')).toBeVisible();
  // The pinned portrait may cover earlier names when it opens above its anchor.
  // Scroll a later speaker to the free lower edge, then use a real pointer hover.
  await frame
    .locator('#name-departure')
    .evaluate((node) =>
      node.scrollIntoView({ block: 'end', behavior: 'instant' }),
    );
  await frame.locator('#name-departure').hover();
  await expect(frame.locator('#name-departure')).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await expect(frame.locator('#name-reply')).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(frame.locator('.portrait')).toHaveAccessibleName(
    '角色占位符 B 立绘',
  );
  await frame.locator('.reading-heading').click();
  await expect(frame.locator('.portrait')).toHaveCount(0);
  await frame.locator('#name-reply').focus();
  await frame.locator('#name-reply').press('Enter');
  await expect(frame.locator('.portrait')).toBeFocused();
  await frame.locator('.portrait').press('Escape');
  await expect(frame.locator('#name-reply')).toBeFocused();
  await frame.getByRole('button', { name: '设置', exact: true }).click();
  await frame
    .getByRole('switch', { name: '自动显示图片', exact: true })
    .click();
  await frame.getByRole('dialog', { name: '阅读设置' }).press('Escape');
  await frame.locator('#name-report').hover();
  await expect(frame.locator('.portrait')).toHaveCount(0);
  expect(errors).toEqual([]);
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
  await scrub(page, 5.85);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.walkthrough')).toHaveClass(/motion-static/u);
  await page.evaluate(() =>
    sessionStorage.setItem('arknights-reader.website-demo.v2', '{broken'),
  );
  await page.locator('#try-reader > summary').click();
  const frame = page.frameLocator('#reader-demo');
  await expect(frame.getByRole('alert')).toContainText('无法读取本页样例记录');
  await frame
    .getByRole('button', { name: '重置样例记录', exact: true })
    .click();
  await expect(
    frame.locator('.story-card').filter({ hasText: '孤星' }),
  ).toBeVisible();
});

test('320px touch gestures advance the page and the real cover/chapter path is tappable', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 320, height: 760 },
    isMobile: true,
    hasTouch: true,
  });
  try {
    const page = await context.newPage();
    await page.goto('./');
    await page.evaluate(() => {
      document.documentElement.dataset.touchScrollEnded = 'false';
      document.addEventListener(
        'scrollend',
        () => {
          document.documentElement.dataset.touchScrollEnded = 'true';
        },
        { once: true },
      );
    });
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
    await expect(page.locator('html')).toHaveAttribute(
      'data-touch-scroll-ended',
      'true',
    );
    await page.locator('#try-reader > summary').tap();
    await expect(page.locator('#try-reader')).toHaveAttribute('open', '');
    const frame = page.frameLocator('#reader-demo');
    await frame
      .getByRole('button', { name: '打开剧情：孤星', exact: true })
      .tap();
    await expect(frame.locator('.timeline-scroll')).toBeVisible();
    await frame.locator('.timeline-scroll button').first().tap();
    await expect(frame.locator('.reading-heading h1')).toHaveText(
      '篇目标题占位符 01',
    );
    await page.locator('[data-host-view="home"]:visible').first().tap();
    await page.locator('#demo-search-form button').tap();
    await expect(page.locator('.demo-result-card')).toHaveCount(1);
    await expectBottomComposer(page);
    await page
      .getByRole('button', { name: '查看《孤星》篇章目录', exact: true })
      .tap();
    await expect(frame.locator('.chapters h1')).toHaveText('孤星');
    await cdp.detach();
  } finally {
    await context.close();
  }
});
