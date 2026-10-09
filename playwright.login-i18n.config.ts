import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  outputDir: process.env.AITASK_E2E_OUTPUT_DIR || 'test-results',
  testMatch: 'login-recovery-i18n.spec.ts',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4192',
    actionTimeout: 10_000,
    channel: process.env.CI ? undefined : 'chrome',
    serviceWorkers: 'block',
    trace: process.env.AITASK_SECRET_FREE_EVIDENCE === 'true' ? 'off' : 'retain-on-failure',
    screenshot: process.env.AITASK_SECRET_FREE_EVIDENCE === 'true' ? 'off' : 'only-on-failure',
  },
  projects: [{ name: 'hosted-login-chrome', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --mode production --host 127.0.0.1 --port 4192',
    url: 'http://127.0.0.1:4192/login',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
