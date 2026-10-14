import { defineConfig } from '@playwright/test';
import base from '../../playwright.config';
export default defineConfig({ ...base, testDir: '.', testMatch: '*.probe.spec.ts', outputDir: '/private/tmp/hod-deep-audit-browser-results', use: { ...base.use, baseURL: 'http://127.0.0.1:4197' }, webServer: { ...base.webServer, cwd: '/Users/user/Downloads/aitask-master', command: 'VITE_AITASK_BACKEND=local VITE_AITASK_SHOW_DEMO_LOGIN=true node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4197', url: 'http://127.0.0.1:4197/login' } });
