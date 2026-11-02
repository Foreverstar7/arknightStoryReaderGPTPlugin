import path from 'node:path';
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  testMatch: ['prts.spec.ts', 'prts-images.spec.ts', 'prts-covers.spec.ts'],
  outputDir: 'test-results/prts',
  workers: 1,
  timeout: 45_000,
  use: {
    baseURL: 'http://127.0.0.1:4320',
    browserName: 'chromium',
    channel: process.env.PLAYWRIGHT_CHANNEL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  reporter: 'list',
  webServer: {
    command: 'node dist/server/main.js',
    env: {
      PORT: '4320',
      READER_SOURCE: 'prts',
      READER_DATA_DIR: path.resolve(`.ai/local/prts-browser/run-${Date.now()}`),
    },
    url: 'http://127.0.0.1:4320/health',
    reuseExistingServer: false,
  },
});
