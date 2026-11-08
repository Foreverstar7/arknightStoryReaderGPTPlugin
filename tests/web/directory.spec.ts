import { expect, test, type Page } from '@playwright/test';
import { chapterPages, chapterWiki, installSource, title } from './source.js';

async function longDirectory(page: Page) {
  const source = await installSource(page);
  const pages = [...chapterPages];
  // Enough original samples to require scrolling in both phone and wide layouts.
  for (let index = 3; index <= 12; index++) {
    const name = 'WX-' + index + ' 取样篇目' + index + '/NBT';
    pages.push(name);
    source.pages.set(name, chapterWiki(1));
  }
  const links = pages.map((name, index) => {
    const chapterTitle =
      index === 0 ? '双岔' : index === 1 ? '回声' : '取样篇目' + (index + 1);
    return '[[' + name + '|WX-' + (index + 1) + ' ' + chapterTitle + ']]';
  });
  source.pages.set(
    '模板:剧情导航',
    '{| class="wikitable"\n! [[剧情一览|活动剧情一览]]\n|-\n! width="120px"|' +
      title +
      '\n! width="40px"|支线\n| ' +
      links.join('{{dot}}') +
      '\n|}',
  );
  await page.goto('./');
  await page
    .getByRole('button', { name: '打开剧情：' + title, exact: true })
    .click();
  await expect(page.locator('.story-preparation')).toContainText(
    '正文已加载 12 篇',
  );
}

test('phone chapter list scrolls with a native vertical touch gesture and keeps card taps working', async ({
  browser,
  browserName,
  baseURL,
}, info) => {
  test.skip(
    browserName !== 'chromium',
    'Trusted touch-move injection uses Chromium CDP; WebKit layout and taps are covered separately.',
  );
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 320, height: 600 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: 'no-preference',
  });
  try {
    const page = await context.newPage();
    await longDirectory(page);
    await expect(page.getByRole('slider', { name: '篇目浏览线' })).toHaveCount(
      0,
    );
    const card = page.locator('.chapter-card').first();
    await card.click({ trial: true });
    const box = await card.boundingBox();
    if (!box) throw new Error('Missing touch target');
    const directory = page.locator('.chapters');
    const state = await directory.evaluate((node) => ({
      top: node.scrollTop,
      maximum: node.scrollHeight - node.clientHeight,
    }));
    expect(state.maximum).toBeGreaterThan(100);
    const up = state.maximum - state.top > state.top;
    const startY = box.y + box.height / 2;
    const finishY = up
      ? Math.max(155, startY - 145)
      : Math.min(570, startY + 145);
    await directory.evaluate((node) => {
      node.setAttribute('data-test-pan-ended', 'false');
      node.addEventListener(
        'scrollend',
        () => node.setAttribute('data-test-pan-ended', 'true'),
        { once: true },
      );
    });
    await page.screenshot({ path: info.outputPath('directory-initial.png') });
    const session = await context.newCDPSession(page);
    const x = box.x + box.width / 2;
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y: startY }],
    });
    for (let step = 1; step <= 18; step++) {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y: startY + ((finishY - startY) * step) / 18 }],
      });
      await page.evaluate(
        () => new Promise<number>((resolve) => requestAnimationFrame(resolve)),
      );
    }
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await expect
      .poll(() =>
        directory.evaluate(
          (node, before) => Math.abs(node.scrollTop - before),
          state.top,
        ),
      )
      .toBeGreaterThan(30);
    await expect(directory).toHaveAttribute('data-test-pan-ended', 'true');
    await session.detach();
    await expect(
      page.getByRole('main', { name: '剧情正文', exact: true }),
    ).toHaveCount(0);
    await page.screenshot({ path: info.outputPath('directory-panned.png') });
    await page.getByRole('button', { name: /^阅读 WX-12 / }).tap();
    await expect(
      page.getByRole('main', { name: '剧情正文', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: '取样篇目12', exact: true }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});

test('wide directory keeps its horizontal axis and range after switching to a phone list and back', async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 960 });
  await longDirectory(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  const axis = page.getByRole('region', { name: '横向篇目轴', exact: true });
  const slider = page.getByRole('slider', { name: '篇目浏览线', exact: true });
  await slider.focus();
  await slider.press('End');
  await expect
    .poll(() => axis.evaluate((node) => node.scrollLeft))
    .toBeGreaterThan(100);
  await expect(page.locator('.chapter-card').last()).toBeInViewport();
  await page.screenshot({ path: info.outputPath('desktop-range.png') });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(slider).toHaveCount(0);
  const first = await page.locator('.chapter-card').first().boundingBox();
  const last = await page.locator('.chapter-card').last().boundingBox();
  if (!first || !last) throw new Error('Missing responsive chapter cards');
  expect(Math.abs(first.x - last.x)).toBeLessThan(1);
  expect(last.y).toBeGreaterThan(first.y + first.height);
  await page.locator('.chapter-card').last().scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('phone-list-end.png') });

  await page.setViewportSize({ width: 1440, height: 960 });
  await expect(slider).toBeVisible();
  const restoredFirst = await page
    .locator('.chapter-card')
    .first()
    .boundingBox();
  const restoredLast = await page.locator('.chapter-card').last().boundingBox();
  if (!restoredFirst || !restoredLast)
    throw new Error('Missing wide chapter cards');
  expect(restoredLast.x).toBeGreaterThan(restoredFirst.x + restoredFirst.width);
  await slider.focus();
  await slider.press('End');
  await expect(page.locator('.chapter-card').last()).toBeInViewport();
  await page.screenshot({ path: info.outputPath('desktop-restored.png') });
  await page.getByRole('button', { name: /^阅读 WX-12 / }).click();
  await expect(
    page.getByRole('main', { name: '剧情正文', exact: true }),
  ).toBeVisible();
});
