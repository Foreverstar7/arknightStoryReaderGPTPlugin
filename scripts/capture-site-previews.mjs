import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { chromium } from '@playwright/test';

const project = path.resolve(import.meta.dirname, '..');
const origin = 'http://127.0.0.1:4331';
const output = path.join(project, 'website/assets');
await mkdir(output, { recursive: true });
const server = spawn(process.execPath, ['dist/server/main.js'], {
  cwd: project,
  env: {
    ...process.env,
    PORT: '4331',
    READER_SOURCE: 'fixture',
    READER_DATA_DIR: path.join(project, '.ai/local/site-preview-state'),
  },
  stdio: 'ignore',
  windowsHide: true,
});
const closed = once(server, 'close');
let browser;
try {
  const deadline = Date.now() + 15_000;
  while (true) {
    if (server.exitCode !== null)
      throw new Error('Fixture preview server exited.');
    try {
      const response = await fetch(`${origin}/health`, {
        signal: AbortSignal.timeout(500),
      });
      if (response.ok) break;
    } catch {
      // Wait for this owned fixture server; no real PRTS source is used.
    }
    if (Date.now() >= deadline)
      throw new Error('Fixture preview server did not start.');
    await setTimeout(100);
  }
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL });
  const context = await browser.newContext({
    viewport: { width: 1200, height: 820 },
    colorScheme: 'light',
    reducedMotion: 'reduce',
  });
  await context.route('**/*', (route) => {
    if (new URL(route.request().url()).origin !== origin)
      throw new Error(
        'Public site screenshots must use only original local fixture content.',
      );
    return route.continue();
  });
  await context.request.post(`${origin}/api/tools`, {
    data: { name: 'reader_clear_history', arguments: {} },
  });
  await context.request.post(`${origin}/api/tools`, {
    data: {
      name: 'reader_settings',
      arguments: { autoImages: false, theme: 'light', retentionDays: 7 },
    },
  });
  const page = await context.newPage();
  await page.goto(origin);
  await page.getByRole('button', { name: '打开剧情：雾中来信' }).waitFor();
  await page.screenshot({
    path: path.join(output, 'library.png'),
    animations: 'disabled',
  });
  await page.getByRole('button', { name: '打开剧情：雾中来信' }).click();
  await page.getByRole('region', { name: '横向篇目轴' }).waitFor();
  await page.screenshot({
    path: path.join(output, 'chapters.png'),
    animations: 'disabled',
  });
  await page.locator('.chapter-card').first().click();
  await page.getByRole('main', { name: '剧情正文' }).waitFor();
  await page.screenshot({
    path: path.join(output, 'reader.png'),
    animations: 'disabled',
  });
  console.info('Captured three original fixture UI previews (no game assets).');
} finally {
  await browser?.close();
  server.kill();
  await closed;
}
