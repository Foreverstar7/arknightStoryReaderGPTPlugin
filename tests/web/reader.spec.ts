import { devices, expect, test } from '@playwright/test';
import { parsePrtsChapter } from '../../src/data/prts-script.js';
import { chapterWords } from '../../src/domain/reading.js';
import {
  chapterPages,
  chapterWiki,
  installSource,
  storedState,
  title,
} from './source.js';
async function openFirst(page: import('@playwright/test').Page) {
  await page
    .getByRole('button', { name: `打开剧情：${title}`, exact: true })
    .click();
  await page.getByRole('button', { name: /^阅读 WX-1 / }).click();
  await expect(
    page.getByRole('main', { name: '剧情正文', exact: true }),
  ).toBeVisible();
}
test('mobile reader bypasses the source mobile redirect for both Wiki and imageinfo', async ({
  browser,
}) => {
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    reducedMotion: 'reduce',
  });
  try {
    const page = await context.newPage();
    expect(await page.evaluate(() => navigator.userAgent)).toContain('Mobile');
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const source = await installSource(page);
    let redirects = 0;
    // Model the browser rejecting the canonical mobile redirect. The live 302
    // without CORS is checked separately; WebKit routing cannot fulfill redirects.
    await context.route(
      /https:\/\/prts\.wiki\/api\.php(?:\?|$)/u,
      async (route) => {
        redirects++;
        await route.abort('blockedbyclient');
      },
    );
    await page.goto('./');
    await expect(
      page.getByRole('button', { name: '打开剧情：' + title, exact: true }),
    ).toBeVisible({ timeout: 5000 });
    await openFirst(page);
    await page
      .getByRole('button', { name: '查看 记录员 的立绘', exact: true })
      .first()
      .tap();
    await expect(
      page
        .getByRole('dialog', { name: '记录员 立绘', exact: true })
        .locator('.source-image'),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '◇ 查看 CG', exact: true }).click();
    await expect(page.locator('.cg-image .source-image')).toBeVisible();
    const apiCalls = source.calls
      .map((call) => new URL(call))
      .filter((call) => call.pathname === '/api.php');
    expect(
      apiCalls.some((call) => call.searchParams.get('prop') === 'imageinfo'),
    ).toBe(true);
    expect(apiCalls.every((call) => call.hostname === 'm.prts.wiki')).toBe(
      true,
    );
    expect(redirects).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test('browser-only reader preserves weighted progress and anchors across close/reopen; no body or images are durable', async ({
  page,
  context,
}) => {
  const source = await installSource(page);
  const localBusiness: string[] = [];
  page.on('request', (request) => {
    if (/^http:.*\/(?:api\/tools|mcp)(?:[/?]|$)/u.test(request.url()))
      localBusiness.push(request.url());
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  await openFirst(page);
  await page.locator('.reader-scroll').evaluate((node) => {
    node.scrollTop = node.scrollHeight * 0.45;
  });
  await expect
    .poll(
      async () =>
        Object.values((await storedState(page)).records)[0]?.furthestWords ?? 0,
    )
    .toBeGreaterThan(100);
  const before = await storedState(page);
  const record = Object.values(before.records)[0];
  if (!record) throw Error('Reading record was not saved');
  const native = parsePrtsChapter(chapterWiki(0), {
    id: `prts:${chapterPages[0]}`,
    storyId: `prts:${title}`,
    title: 'WX-1 双岔',
    pageTitle: chapterPages[0] ?? '',
    group: title,
  });
  expect(record.revision).toBe(native.revision);
  expect(record.layout?.blocks.map((block) => block.id)).toEqual(
    native.blocks.map((block) => block.id),
  );
  expect(record.totalWords).toBe(chapterWords(native));
  await page.locator('.reader-scroll').evaluate((node) => {
    node.scrollTop = 0;
  });
  await expect
    .poll(
      async () =>
        (await storedState(page)).records[record.chapterId]?.last.blockId,
    )
    .toBe(native.blocks[0]?.id);
  expect(
    (await storedState(page)).records[record.chapterId]?.furthestWords,
  ).toBeGreaterThanOrEqual(record.furthestWords);
  await page.locator('.reader-scroll').evaluate((node) => {
    node.scrollTop = node.scrollHeight * 0.3;
  });
  await page.waitForTimeout(450);
  await page.close();
  page = await context.newPage();
  await page.goto('./');
  await expect(
    page.getByRole('main', { name: '剧情正文', exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.locator('.reader-scroll').evaluate((node) => node.scrollTop),
    )
    .toBeGreaterThan(100);
  expect(localBusiness).toEqual([]);
  const storage = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const q = indexedDB.open('arknights-story-reader.web.v1');
      q.onsuccess = () => resolve(q.result);
      q.onerror = () => reject(q.error);
    });
    const stores = Array.from(db.objectStoreNames);
    const serialized = await Promise.all(
      stores.map(
        (name) =>
          new Promise<string>((resolve, reject) => {
            const q = db.transaction(name).objectStore(name).getAll();
            q.onsuccess = () => resolve(JSON.stringify(q.result));
            q.onerror = () => reject(q.error);
          }),
      ),
    );
    db.close();
    return {
      stores,
      serialized: serialized.join(''),
      cacheKeys: await caches.keys(),
    };
  });
  expect(storage.stores.sort()).toEqual(['counts', 'reading']);
  expect(storage.serialized).not.toContain('这是原创测试正文');
  expect(storage.serialized).not.toContain('data:image');
  expect(storage.cacheKeys).toEqual([]);
  expect(source.calls.some((url) => url.includes('/api.php'))).toBe(true);
});

test('source network and incompatible responses stay distinct and retry without deleting records', async ({
  page,
}) => {
  const source = await installSource(page);
  source.failed.add('模板:剧情导航');
  await page.goto('./');
  await expect(page.locator('.error-banner')).toContainText('HTTP 503');
  source.failed.clear();
  await page
    .locator('.error-banner')
    .getByRole('button', { name: '重试', exact: true })
    .click();
  await openFirst(page);
  await expect
    .poll(async () => Object.keys((await storedState(page)).records).length)
    .toBe(1);
  const saved = (await storedState(page)).recentChapterId;
  source.corrupt.add('剧情一览');
  await page.reload();
  await expect(page.locator('.error-banner')).toContainText('未返回 JSON');
  expect((await storedState(page)).recentChapterId).toBe(saved);
});

test('clearing history in another tab fences late saves and keeps preferences', async ({
  page,
  context,
}) => {
  await installSource(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  await openFirst(page);
  await expect
    .poll(async () => Object.keys((await storedState(page)).records).length)
    .toBe(1);
  const other = await context.newPage();
  await other.emulateMedia({ reducedMotion: 'reduce' });
  await other.goto('./');
  await expect(
    other.getByRole('main', { name: '剧情正文', exact: true }),
  ).toBeVisible();
  await other.getByRole('button', { name: '设置', exact: true }).click();
  await other
    .getByRole('switch', { name: '主题跟随系统', exact: true })
    .click();
  await other
    .getByRole('button', { name: '清除全部阅读记录', exact: true })
    .click();
  await other
    .getByRole('button', { name: '确认清除全部', exact: true })
    .click();
  await expect
    .poll(async () => Object.keys((await storedState(other)).records).length)
    .toBe(0);
  await page.locator('.reader-scroll').evaluate((node) => {
    node.scrollTop = node.scrollHeight * 0.5;
  });
  await expect(page.locator('.error-banner')).toContainText('阅读记录已清除');
  expect(Object.keys((await storedState(page)).records)).toHaveLength(0);
  expect((await storedState(page)).settings.theme).not.toBe('system');
});

test('partial preparation leaves the whole-story denominator unknown', async ({
  page,
}) => {
  const source = await installSource(page);
  source.failed.add(chapterPages[1] ?? '');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  await openFirst(page);
  await expect(page.locator('.top-tools .progress')).toContainText(
    '全剧情已读 总字数待核实',
  );
  source.failed.clear();
  await page.getByRole('button', { name: '主页', exact: false }).click();
  await page
    .getByRole('button', { name: `打开剧情：${title}`, exact: true })
    .click();
  await expect(page.locator('.story-preparation')).toContainText(
    '正文已加载 2 篇',
  );
});

for (const colorScheme of ['light', 'dark'] as const)
  for (const viewport of [
    { width: 320, height: 760 },
    { width: 768, height: 900 },
    { width: 1440, height: 960 },
    { width: 1024, height: 400 },
  ]) {
    test(`responsive ${colorScheme} ${viewport.width}x${viewport.height}: touch, pictures, settings and reduced motion`, async ({
      browser,
    }, info) => {
      const context = await browser.newContext({
        viewport,
        colorScheme,
        hasTouch: true,
        reducedMotion: 'reduce',
      });
      try {
        const page = await context.newPage();
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        const source = await installSource(page);
        await page.goto('./');
        await expect(page.locator('.story-card')).toHaveCount(1);
        await page.screenshot({ path: info.outputPath('library.png') });
        await page
          .getByRole('button', { name: '打开剧情：' + title, exact: true })
          .click();
        await expect(page.locator('.story-preparation')).toContainText(
          '正文已加载 2 篇',
        );
        const firstCard = await page
          .locator('.chapter-card')
          .nth(0)
          .boundingBox();
        const secondCard = await page
          .locator('.chapter-card')
          .nth(1)
          .boundingBox();
        if (!firstCard || !secondCard) throw new Error('Missing chapter cards');
        if (viewport.width <= 600) {
          expect(Math.abs(firstCard.x - secondCard.x)).toBeLessThan(1);
          expect(secondCard.y).toBeGreaterThan(firstCard.y + firstCard.height);
          await expect(
            page.getByRole('slider', { name: '篇目浏览线' }),
          ).toHaveCount(0);
          expect(
            await page
              .locator('.chapters')
              .evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
          ).toBe(true);
        } else {
          expect(secondCard.x).toBeGreaterThan(firstCard.x + firstCard.width);
          await expect(
            page.getByRole('slider', { name: '篇目浏览线' }),
          ).toBeVisible();
        }
        await page.screenshot({ path: info.outputPath('directory.png') });
        await page.getByRole('button', { name: /^阅读 WX-1 / }).click();
        await expect(
          page.getByRole('main', { name: '剧情正文', exact: true }),
        ).toBeVisible();
        expect(
          source.calls.some((url) => url.endsWith('/character.json')),
        ).toBe(false);
        const speaker = page
          .getByRole('button', { name: '查看 记录员 的立绘', exact: true })
          .first();
        await speaker.tap();
        const portrait = page.getByRole('dialog', {
          name: '记录员 立绘',
          exact: true,
        });
        await expect(portrait.locator('.source-image')).toBeVisible();
        await expect(
          portrait.getByRole('radio', { name: '场景立绘', exact: true }),
        ).toBeChecked();
        await portrait
          .getByRole('radio', { name: '默认立绘', exact: true })
          .press('Space');
        await page.keyboard.press('Escape');
        await expect(portrait).toHaveCount(0);
        await expect(speaker).toBeFocused();
        await page
          .getByRole('button', { name: '◇ 查看 CG', exact: true })
          .click();
        await expect(page.locator('.cg-image .source-image')).toBeVisible();
        expect(
          source.calls.some(
            (url) =>
              new URL(url).searchParams.get('titles') === 'Widget:Data_Image',
          ),
        ).toBe(true);
        await page
          .getByRole('button', { name: '◇ 收起 CG', exact: true })
          .click();
        await page.locator('.reader-scroll').evaluate((node) => {
          node.scrollTop = 0;
        });
        const bounds = await page.locator('.reader-scroll').evaluate((node) => {
          const rect = node.getBoundingClientRect();
          return {
            left: rect.left,
            right: rect.right,
            bottom: rect.bottom,
            height: innerHeight,
            width: innerWidth,
            documentWidth: document.documentElement.scrollWidth,
          };
        });
        expect(bounds.left).toBeGreaterThanOrEqual(0);
        expect(bounds.right).toBeLessThanOrEqual(bounds.width + 1);
        expect(bounds.bottom).toBeLessThanOrEqual(bounds.height + 1);
        expect(bounds.documentWidth).toBeLessThanOrEqual(bounds.width + 1);
        await page.screenshot({ path: info.outputPath('reader.png') });
        await page.getByRole('button', { name: '设置', exact: true }).tap();
        const panel = page.getByRole('dialog', {
          name: '阅读设置',
          exact: true,
        });
        await expect(panel).toContainText('不保存离线副本');
        await expect(panel.getByText('缓存保留期')).toHaveCount(0);
        await expect(
          panel.getByRole('button', { name: '清理图片缓存', exact: true }),
        ).toHaveCount(0);
        await page.keyboard.press('Escape');
        await expect(panel).toHaveCount(0);
        expect(errors).toEqual([]);
      } finally {
        await context.close();
      }
    });
  }

test('browser storage denial is visible and does not silently fall back to temporary records', async ({
  page,
}) => {
  await installSource(page);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', {
      value: {
        open() {
          throw new DOMException('Storage denied for test', 'SecurityError');
        },
      },
    });
  });
  await page.goto('./');
  await expect(page.locator('.error-banner')).toContainText(
    '浏览器未能保存阅读记录',
  );
  await expect(
    page.getByRole('main', { name: '剧情正文', exact: true }),
  ).toHaveCount(0);
});

test('source revisions migrate stored hash-only anchors without persisting the old body', async ({
  page,
}) => {
  const source = await installSource(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  await openFirst(page);
  await page.locator('.reader-scroll').evaluate((node) => {
    node.scrollTop = node.scrollHeight * 0.4;
  });
  await expect
    .poll(
      async () =>
        Object.values((await storedState(page)).records)[0]?.furthestWords ?? 0,
    )
    .toBeGreaterThan(100);
  const before = Object.values((await storedState(page)).records)[0];
  if (!before) throw new Error('Missing saved anchor');
  source.revisionPrefix = '[name=""]新增的原创说明。\n[Dialog]\n';
  await page.reload();
  await expect(
    page.getByRole('main', { name: '剧情正文', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.revision-notice')).toContainText('正文已更新');
  const after = (await storedState(page)).records[before.chapterId];
  expect(after?.revision).not.toBe(before.revision);
  expect(after?.migration?.previous.revision).toBe(before.revision);
  expect(after?.migration?.position).toBe('matched');
});

test('introduction links to the separate real reader; all six demo titles retain placeholder body', async ({
  page,
}) => {
  await installSource(page);
  await page.goto('../');
  await expect(
    page.getByRole('link', { name: '打开网页版', exact: true }),
  ).toHaveAttribute('href', './reader/');
  await page.getByRole('link', { name: '打开网页版', exact: true }).click();
  await expect(page.locator('.story-card')).toHaveCount(1);
  await page.getByRole('link', { name: '项目介绍', exact: true }).click();
  await page.locator('#try-reader > summary').click();
  const demo = page.frameLocator('#reader-demo');
  for (const name of [
    '孤星',
    '长夜临光',
    '巴别塔',
    '愚人号',
    '叙拉古人',
    '火山旅梦',
  ])
    await expect(
      demo.getByRole('button', { name: `打开剧情：${name}`, exact: true }),
    ).toHaveCount(1);
  await demo
    .getByRole('button', { name: '打开剧情：巴别塔', exact: true })
    .click();
  await demo.locator('.chapter-card').first().click();
  await expect(demo.locator('.body-copy')).toContainText('占位符');
  await expect(demo.locator('.source-note')).toContainText('非原作剧情');
});

test('normal motion and consecutive viewport reflow preserve navigation; a short chapter is weighted by words', async ({
  page,
}) => {
  await installSource(page);
  await page.goto('./');
  await page
    .getByRole('button', { name: `打开剧情：${title}`, exact: true })
    .click();
  await expect(page.locator('.story-preparation')).toContainText(
    '正文已加载 2 篇',
  );
  await page.getByRole('button', { name: /^阅读 WX-2 / }).click();
  await expect(
    page.getByRole('main', { name: '剧情正文', exact: true }),
  ).toBeVisible();
  await expect
    .poll(
      async () => Object.values((await storedState(page)).records)[0]?.complete,
    )
    .toBe(true);
  const progress = await page
    .locator('.top-tools .progress b')
    .last()
    .innerText();
  expect(Number.parseInt(progress, 10)).toBeLessThan(10);
  for (const viewport of [
    { width: 320, height: 760 },
    { width: 1440, height: 960 },
    { width: 768, height: 900 },
    { width: 1024, height: 400 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(
      page.getByRole('main', { name: '剧情正文', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: '设置', exact: true }),
    ).toBeInViewport();
  }
  await page.getByRole('button', { name: '主页', exact: false }).click();
  await page
    .getByRole('button', { name: `打开剧情：${title}`, exact: true })
    .click();
  await page.getByRole('button', { name: /^继续阅读/ }).click();
  await expect(
    page.getByRole('heading', { name: '回声', exact: true }),
  ).toBeVisible();
});
