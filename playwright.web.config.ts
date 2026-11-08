import { defineConfig } from '@playwright/test';
const port = process.env.WEB_READER_PORT ?? '4357';
const browserName =
  process.env.WEB_READER_BROWSER === 'webkit' ? 'webkit' : 'chromium';
export default defineConfig({
  testDir: './tests/web',
  outputDir: 'test-results/web',
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${port}/arknightStoryReaderGPTPlugin/reader/`,
    browserName,
    channel:
      browserName === 'chromium' ? process.env.PLAYWRIGHT_CHANNEL : undefined,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  reporter: 'list',
  webServer: {
    command: 'node scripts/serve-site.mjs',
    env: { SITE_PREVIEW_PORT: port },
    url: `http://127.0.0.1:${port}/health`,
    reuseExistingServer: false,
  },
});
