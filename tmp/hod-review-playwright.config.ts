import { defineConfig } from '@playwright/test';
import base from '../playwright.config';
export default defineConfig({ ...base, testDir: '/Users/user/Downloads/aitask-master/e2e', outputDir: '/Users/user/Downloads/aitask-master/tmp/hod-review-browser-results', use: { ...base.use, baseURL: 'http://127.0.0.1:4191' }, webServer: { ...base.webServer, cwd: '/Users/user/Downloads/aitask-master', command: 'VITE_AITASK_BACKEND=local VITE_AITASK_SHOW_DEMO_LOGIN=true node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4191', url: 'http://127.0.0.1:4191/login' } });
