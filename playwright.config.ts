import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  outputDir: process.env.AITASK_E2E_OUTPUT_DIR || 'test-results',
  testIgnore: ['**/pwa-install.spec.ts', '**/login-recovery-i18n.spec.ts', '**/staging-release.spec.ts', '**/staging-account-recovery.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4180',
    actionTimeout: 10_000,
    channel: process.env.CI ? undefined : 'chrome',
    serviceWorkers: 'block',
    trace: process.env.AITASK_SECRET_FREE_EVIDENCE === 'true' ? 'off' : 'retain-on-failure',
    screenshot: process.env.AITASK_SECRET_FREE_EVIDENCE === 'true' ? 'off' : 'only-on-failure',
    video: process.env.AITASK_SECRET_FREE_EVIDENCE === 'true' ? 'off' : 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop-chrome',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'VITE_AITASK_BACKEND=local VITE_AITASK_SHOW_DEMO_LOGIN=true node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4180',
    url: 'http://127.0.0.1:4180/login',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
