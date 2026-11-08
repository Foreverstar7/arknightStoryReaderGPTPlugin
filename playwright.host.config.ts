import { defineConfig } from '@playwright/test';

const port = process.env.READER_HOST_E2E_PORT ?? '4349';

export default defineConfig({
  testDir: './tests/hosted',
  testMatch: '*.spec.ts',
  outputDir: '.ai/local/search-card-check/results',
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: 'chromium',
    channel: process.env.PLAYWRIGHT_CHANNEL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  reporter: [
    ['list'],
    ['json', { outputFile: '.ai/local/search-card-check/host-report.json' }],
  ],
  webServer: {
    command: 'node --import tsx tests/hosted/server.ts',
    url: `http://127.0.0.1:${port}/health`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
