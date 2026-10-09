import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.STAGING_E2E_BASE_URL;
if (!baseURL) throw new Error('STAGING_E2E_BASE_URL is required for authenticated staging verification.');

export default defineConfig({
  testDir: './e2e',
  outputDir: process.env.AITASK_E2E_OUTPUT_DIR || 'test-results',
  testMatch: ['staging-release.spec.ts','staging-account-recovery.spec.ts'],
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
