import path from 'node:path';
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  testIgnore: 'prts.spec.ts',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4319',
    browserName: 'chromium',
    channel: process.env.PLAYWRIGHT_CHANNEL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  reporter: 'list',
  webServer: {
    command: 'node dist/server/main.js',
    env: {
      PORT: '4319',
      READER_DATA_DIR: path.resolve('.ai/local/e2e-state'),
      READER_SOURCE: 'fixture',
    },
    url: 'http://127.0.0.1:4319/health',
    reuseExistingServer: false,
  },
});
