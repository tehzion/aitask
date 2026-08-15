import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testIgnore: '**/pwa-install.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4180',
    actionTimeout: 10_000,
    channel: process.env.CI ? undefined : 'chrome',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
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
