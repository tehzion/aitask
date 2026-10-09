import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  outputDir: process.env.AITASK_E2E_OUTPUT_DIR || 'test-results',
  testMatch: '**/pwa-install.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4181',
    actionTimeout: 10_000,
    serviceWorkers: 'allow',
    trace: process.env.AITASK_SECRET_FREE_EVIDENCE === 'true' ? 'off' : 'retain-on-failure',
    screenshot: process.env.AITASK_SECRET_FREE_EVIDENCE === 'true' ? 'off' : 'only-on-failure',
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4181',
    url: 'http://127.0.0.1:4181/login',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
