import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4180',
    channel: process.env.CI ? undefined : 'chrome',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop-chrome',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'VITE_AITASK_BACKEND=local VITE_AITASK_SHOW_DEMO_LOGIN=true pnpm dev --host 127.0.0.1 --port 4180',
    url: 'http://127.0.0.1:4180/login',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
