import { defineConfig, devices } from '@playwright/test';

const e2ePort = Number(process.env.PLAYWRIGHT_PORT || 4180);
const reuseExistingServer = process.env.PLAYWRIGHT_REUSE_SERVER === 'true';

export default defineConfig({
  testDir: './e2e',
  testIgnore: ['**/pwa-install.spec.ts', '**/login-recovery-i18n.spec.ts', '**/staging-release.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${e2ePort}`,
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
    command: `VITE_AITASK_BACKEND=local VITE_AITASK_SHOW_DEMO_LOGIN=true VITE_AITASK_ALLOW_PASSWORD_RESET_BYPASS=true VITE_AITASK_LOCAL_DEFAULT_PASSWORD=password123 node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${e2ePort}`,
    url: `http://127.0.0.1:${e2ePort}/login`,
    reuseExistingServer,
    timeout: 120_000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
  },
});
