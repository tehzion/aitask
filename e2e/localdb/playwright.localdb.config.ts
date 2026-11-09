import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: 'localdb.spec.ts',
  workers: 1,
  timeout: 120_000,
  reporter: 'line',
  use: { ...devices['Desktop Chrome'], baseURL: `http://127.0.0.1:${process.env.LOCALDB_PORT || '4320'}`, serviceWorkers: 'block', trace: 'off' },
});
