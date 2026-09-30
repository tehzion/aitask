import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
const baseURL = process.env.AITASK_PROFILE_URL || 'http://127.0.0.1:4181';
if (!['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname)) throw new Error('This synthetic fixture profiler is local-only.');
const browser = await chromium.launch({ channel: process.env.CI ? undefined : 'chrome' });
const results = [];
try {
  for (const profile of ['desktop', 'slow-mobile']) for (let run = 1; run <= 2; run += 1) {
    const context = await browser.newContext({ viewport: profile === 'desktop' ? { width: 1440, height: 900 } : { width: 390, height: 844 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    if (profile === 'slow-mobile') {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200000, uploadThroughput: 93750 });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    }
    await page.addInitScript(() => {
      window.__profileLongTasks = [];
      if (PerformanceObserver.supportedEntryTypes.includes('longtask')) new PerformanceObserver(list => window.__profileLongTasks.push(...list.getEntries().map(entry => entry.duration))).observe({ type: 'longtask', buffered: true });
    });
    await page.goto(`${baseURL}/login`);
    await page.getByRole('heading', { name: 'Sign in to AiTask' }).waitFor();
    const loginFcpMs = await page.evaluate(() => performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0);
    await page.getByRole('button', { name: 'Use Project Manager Demo', exact: true }).click();
    await page.getByLabel('Password', { exact: true }).fill('password123');
    const start = Date.now();
    await page.getByRole('button', { name: 'Access Dashboard' }).click();
    await page.waitForURL(url => url.pathname === '/' || url.pathname === '/settings');
    if (new URL(page.url()).pathname === '/settings') await page.getByRole('button', { name: 'Continue for now' }).click();
    const notice = page.getByRole('dialog', { name: 'Service operations are now in one calm workspace' });
    await notice.waitFor({ state: 'visible', timeout: 5000 }).then(() => notice.getByRole('button', { name: 'Happy working' }).click()).catch(() => undefined);
    await page.locator('main h1').waitFor();
    const dashboardReadyMs = Date.now() - start;
    const loginLongTaskMs = await page.evaluate(() => window.__profileLongTasks.reduce((sum, duration) => sum + duration, 0));
    await page.evaluate(() => {
      const raw = localStorage.getItem('market-task-storage'); const envelope = JSON.parse(raw); const actor = envelope.state.currentUser;
      envelope.state.tasks = Array.from({ length: 5000 }, (_, index) => ({ id: `profile-${index}`, clientName: 'Synthetic QA', title: `Synthetic task ${index}`, serviceType: 'Design', description: '', department: 'Designer', assignedTo: actor.id, createdBy: actor.id, startDate: '2026-09-01', dueDate: '2026-09-30', status: 'Pending', priority: 'Medium', completionPercentage: 0, isCompleted: false, isRecurring: false, comments: [], approvalHistory: [], revisionCount: 0, clientApprovalStatus: 'Pending' }));
      localStorage.setItem('market-task-storage', JSON.stringify(envelope));
    });
    const largeStart = Date.now();
    await page.reload(); await page.locator('main h1').waitFor();
    const largeDashboardReadyMs = Date.now() - largeStart;
    const largeWorkspaceLongTaskMs = await page.evaluate(() => window.__profileLongTasks.reduce((sum, duration) => sum + duration, 0));
    results.push({ profile, run, loginFcpMs: Math.round(loginFcpMs), dashboardReadyMs, loginLongTaskMs: Math.round(loginLongTaskMs), largeDashboardReadyMs, largeWorkspaceLongTaskMs: Math.round(largeWorkspaceLongTaskMs) });
    console.log(`[profile] ${profile} run ${run}: login FCP ${Math.round(loginFcpMs)}ms, dashboard ${dashboardReadyMs}ms, 5000-task dashboard ${largeDashboardReadyMs}ms`);
    await context.close();
  }
  writeFileSync(process.env.AITASK_PROFILE_OUTPUT || '/tmp/aitask-startup-profile.json', JSON.stringify({ conditions: { localDemoBuild: true, serviceWorkers: 'blocked', slowMobile: '390x844, CPU 4x, 150ms latency, 1.6Mbps down', dataset: '5000 synthetic tasks; local persisted workspace, no hosted database latency' }, results }, null, 2));
} finally { await browser.close(); }
