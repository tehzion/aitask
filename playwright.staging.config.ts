import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.STAGING_E2E_BASE_URL;
if (!baseURL) throw new Error('STAGING_E2E_BASE_URL is required for authenticated staging verification.');

export default defineConfig({
  testDir: './e2e',
  testMatch: 'staging-release.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    serviceWorkers: 'block',
    actionTimeout: 15_000,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
});
