import { defineConfig } from '@playwright/test';
const port = process.env.SITE_PREVIEW_PORT ?? '4330';

export default defineConfig({
  testDir: './tests/site',
  outputDir: 'test-results/site',
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${port}/arknightStoryReaderGPTPlugin/`,
    browserName: 'chromium',
    channel: process.env.PLAYWRIGHT_CHANNEL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  reporter: 'list',
  webServer: {
    command: 'node scripts/serve-site.mjs',
    url: `http://127.0.0.1:${port}/health`,
    reuseExistingServer: false,
  },
});
