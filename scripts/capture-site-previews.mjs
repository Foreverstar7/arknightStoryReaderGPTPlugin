import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { chromium, expect } from '@playwright/test';

const project = path.resolve(import.meta.dirname, '..');
const origin = 'http://127.0.0.1:4331';
const output = path.join(project, 'website/assets');
await mkdir(output, { recursive: true });
// Own a static preview of the built website, using fresh browser storage. No
// plugin server, PRTS or private reading database participates in these captures.
const server = spawn(process.execPath, ['scripts/serve-site.mjs'], {
  cwd: project,
  env: { ...process.env, SITE_PREVIEW_PORT: '4331' },
  stdio: 'ignore',
  windowsHide: true,
});
const closed = once(server, 'close');
let browser;
try {
  const deadline = Date.now() + 15_000;
  while (true) {
    if (server.exitCode !== null)
      throw new Error('Static preview server exited.');
    try {
      const response = await fetch(`${origin}/health`, {
        signal: AbortSignal.timeout(500),
      });
      if (response.ok) break;
    } catch {
      // Wait only for this owned static server.
    }
    if (Date.now() >= deadline)
      throw new Error('Static preview did not start.');
    await setTimeout(100);
  }
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL });
  const context = await browser.newContext({
    viewport: { width: 1200, height: 900 },
    colorScheme: 'light',
    reducedMotion: 'reduce',
  });
  const external = [];
  await context.route('**/*', (route) => {
    if (new URL(route.request().url()).origin !== origin) {
      external.push(route.request().url());
      return route.abort();
    }
    return route.continue();
  });
  const page = await context.newPage();
  await page.goto(`${origin}/arknightStoryReaderGPTPlugin/demo/index.html`);
  await expect(page.locator('.story-card')).toHaveCount(6);
  for (const card of await page.locator('.story-card').all()) {
    await card.scrollIntoViewIfNeeded();
    await expect(card.locator('.source-image')).toHaveAttribute(
      'data-image-state',
      'ready',
    );
  }
  await page.locator('.library-scroll').evaluate((node) => {
    node.scrollTop = 0;
  });
  await expect(page.locator('.image-error')).toHaveCount(0);
  await page.screenshot({
    path: path.join(output, 'demo-library.png'),
    animations: 'disabled',
  });
  await page
    .getByRole('button', { name: '打开剧情：孤星', exact: true })
    .click();
  await page.getByRole('region', { name: '横向篇目轴' }).waitFor();
  await expect(page.locator('.mini-cover .source-image').first()).toBeVisible();
  await page.screenshot({
    path: path.join(output, 'demo-chapters.png'),
    animations: 'disabled',
  });
  await page.locator('.chapter-card').first().click();
  await page.getByRole('main', { name: '剧情正文' }).waitFor();
  await page.getByRole('button', { name: '查看 CG', exact: false }).click();
  await expect(page.locator('.cg-image .source-image')).toHaveAttribute(
    'data-image-state',
    'ready',
  );
  await page.locator('.cg-wrap').scrollIntoViewIfNeeded();
  await page.screenshot({
    path: path.join(output, 'demo-reader.png'),
    animations: 'disabled',
  });
  await page.locator('.reader-scroll').evaluate((node) => {
    node.scrollTop = 0;
  });
  await page
    .getByRole('button', { name: '查看 角色占位符 A 的立绘', exact: true })
    .first()
    .click();
  await expect(page.locator('.portrait .source-image')).toHaveAttribute(
    'data-image-state',
    'ready',
  );
  await page.screenshot({
    path: path.join(output, 'demo-portrait.png'),
    animations: 'disabled',
  });
  await page.goto(`${origin}/arknightStoryReaderGPTPlugin/`);
  await page.locator('#try-reader > summary').click();
  await expect(
    page.frameLocator('#reader-demo').locator('.story-card'),
  ).toHaveCount(6);
  await page.locator('[data-host-view="home"]:visible').first().click();
  await page.locator('#demo-search-input').press('Enter');
  await expect(page.locator('.demo-result-card')).toHaveCount(1);
  await expect
    .poll(() =>
      page
        .locator('.demo-result-card img')
        .evaluate((image) => image.naturalWidth),
    )
    .toBeGreaterThan(0);
  await page.locator('.demo-window').screenshot({
    path: path.join(output, 'demo-search.png'),
    animations: 'disabled',
  });
  if (external.length)
    throw new Error('Screenshots attempted nonlocal requests.');
  console.info(
    'Captured five website UI previews with local artwork and placeholder reading content.',
  );
} finally {
  await browser?.close();
  server.kill();
  await closed;
}
