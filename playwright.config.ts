import path from 'node:path';
import { defineConfig } from '@playwright/test';
const port = process.env.READER_E2E_PORT ?? '4319';

export default defineConfig({
  testDir: './tests/browser',
  testIgnore: [
    'prts.spec.ts',
    'prts-images.spec.ts',
    'prts-covers.spec.ts',
    'prts-body-images.spec.ts',
  ],
  outputDir: 'test-results/fixture',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: 'chromium',
    channel: process.env.PLAYWRIGHT_CHANNEL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  reporter: 'list',
  webServer: {
    command: 'node dist/server/main.js',
    env: {
      PORT: port,
      READER_DATA_DIR: path.resolve('.ai/local/e2e-state'),
      READER_SOURCE: 'fixture',
    },
    url: `http://127.0.0.1:${port}/health`,
    reuseExistingServer: false,
  },
});
