import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e', testMatch: '**/*.e2e.ts', timeout: 20_000, fullyParallel: false, workers: 1,
  use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure',
    channel: process.env.CI ? undefined : 'chrome' },
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:5173', reuseExistingServer: false, timeout: 30_000 },
});
