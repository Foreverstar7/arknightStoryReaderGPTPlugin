import path from 'node:path';
import { defineConfig } from '@playwright/test';
const port = process.env.READER_E2E_PRTS_PORT ?? '4320';

export default defineConfig({
  testDir: './tests/browser',
  testMatch: [
    'prts.spec.ts',
    'prts-images.spec.ts',
    'prts-covers.spec.ts',
    'prts-body-images.spec.ts',
  ],
  outputDir: 'test-results/prts',
  workers: 1,
  timeout: 45_000,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: 'chromium',
    channel: process.env.PLAYWRIGHT_CHANNEL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  reporter: 'list',
  webServer: {
    command: process.env.READER_E2E_PACKAGE_ROOT
      ? `node "${path.resolve(process.env.READER_E2E_PACKAGE_ROOT, 'dist/server/production.js')}"`
      : 'node dist/server/main.js',
    env: {
      PORT: port,
      READER_SOURCE: 'prts',
      READER_DATA_DIR: path.resolve(`.ai/local/prts-browser/run-${Date.now()}`),
    },
    url: `http://127.0.0.1:${port}/health`,
    reuseExistingServer: false,
  },
});
