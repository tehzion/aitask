import { expect, test, type Locator, type Page } from '@playwright/test';

test.use({ timezoneId: 'Asia/Jakarta' });
test.describe.configure({ timeout: 90_000 });

const expectMetric = async (scope: Locator, label: string, value: number) => {
  await expect(scope.getByText(label, { exact: true }).locator('..').getByText(String(value), { exact: true })).toBeVisible();
};

const seedDashboard = async (page: Page, time = '2026-10-07T07:00:00Z') => {
  await page.clock.install({ time: new Date(new Date(time).getTime() - 24 * 60 * 60 * 1000) });
  await page.clock.pauseAt(new Date(time));
  await page.goto('/login');
  await expect(page.getByLabel('Email or username')).toBeVisible();
  await page.evaluate(async () => {
    const { useStore, stopBackendAutoSync } = await import('/src/store/index.ts');
    const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
    const state = useStore.getState();
    const boss = state.users.find(user => user.isSuperAdmin)!;
    const staff = { id: 'accuracy-staff', name: 'Accuracy Staff', role: 'Staff', department: 'Designer', departments: ['Designer'] };
    enablePasswordResetBypass(boss.id);
    localStorage.setItem(`aitask:release-notice:2026-08-service-operations:${boss.id}`, 'acknowledged');
    localStorage.setItem('aitask:locale', 'en');
    const task = { ...state.tasks[0], clientId: 'accuracy-company', clientName: 'Accuracy Company', assignedTo: staff.id, department: 'Designer', status: 'In Progress', isCompleted: false, completedAt: undefined, dueDate: '2026-10-07', comments: [], approvalHistory: [] };
    const cycle = { id: 'accuracy-current', clientId: 'accuracy-company', clientName: 'Accuracy Company', planId: 'accuracy-plan', planRevision: 1, periodStart: '2026-10-07', periodEnd: '2026-10-07', status: 'Completed', currency: 'MYR', serviceItems: [], addonSnapshots: [], discountType: 'none', discountValue: 0, taxRateBps: 0, createdAt: '2026-10-01', updatedAt: '2026-10-01' };
    useStore.setState({
      currentUser: { ...boss, mustResetPassword: false }, users: [boss, staff],
      clients: [{ id: 'accuracy-company', clientName: 'Accuracy Company', createdBy: boss.id, createdAt: '2026-10-01', updatedAt: '2026-10-01' }],
      projects: [], registrations: [],
      tasks: [
        { ...task, id: 'accuracy-today', title: 'Accuracy due today' },
        { ...task, id: 'accuracy-tomorrow', title: 'Accuracy due tomorrow', dueDate: '2026-10-08' },
      ],
      clientPlans: [{ id: 'accuracy-plan', clientId: 'accuracy-company', clientName: 'Accuracy Company', name: 'Accuracy Plan', revision: 1, status: 'Active', currency: 'MYR', origin: 'custom', serviceItems: [], discountType: 'none', discountValue: 0, taxRateBps: 0, startDate: '2026-10-01', billingDay: 1, contractEndDate: '2026-11-07', createdAt: '2026-10-01', updatedAt: '2026-10-01' }],
      serviceCycles: [cycle, { ...cycle, id: 'accuracy-next', periodStart: '2026-10-08', periodEnd: '2026-11-07', status: 'Published' }],
      deliverables: [
        ...Array.from({ length: 2 }, (_, i) => ({ id: `accuracy-delivered-${i}`, clientId: cycle.clientId, clientName: cycle.clientName, cycleId: cycle.id, status: 'Delivered' })),
        ...Array.from({ length: 4 }, (_, i) => ({ id: `accuracy-planned-${i}`, clientId: cycle.clientId, clientName: cycle.clientName, cycleId: 'accuracy-next', status: 'Planned' })),
      ],
      servicePricingSnapshots: [],
      backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 },
    });
    stopBackendAutoSync();
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Agency operations' })).toBeVisible();
  await page.clock.runFor(500);
};

for (const mobile of [false, true]) {
  test(`${mobile ? 'mobile' : 'desktop'} overview and pulse reconcile overdue totals and exclude old monthly cycles`, async ({ page }) => {
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
    await seedDashboard(page);
    await page.evaluate(async () => {
      const { useStore } = await import('/src/store/index.ts');
      const state = useStore.getState();
      useStore.setState({
        tasks: state.tasks.map(task => task.id === 'accuracy-today' ? { ...task, dueDate: '2026-10-06' } : task),
        serviceCycles: state.serviceCycles.map(cycle => ({ ...cycle, periodStart: '2026-09-01', periodEnd: '2026-09-30' })),
      });
    });
    const overview = page.getByRole('tabpanel');
    await expectMetric(overview, 'Overdue tasks', 1);
    await expectMetric(overview, 'Overdue production', 1);
    await expectMetric(overview, 'Renewals in 30 days', 0);
    await expect(overview.getByText(/No published cycle for this month/)).toBeVisible();
    await expect(overview.getByText('0 Delivered', { exact: true })).toBeVisible();
    await page.getByRole('tab', { name: 'Agency pulse', exact: true }).click();
    await expectMetric(page.getByRole('tabpanel'), 'Overdue now', 1);
  });
}

test('overview updates renewals, overdue totals and the current billing cycle at midnight', async ({ page }) => {
  await seedDashboard(page, '2026-10-07T16:59:50Z');
  const overview = page.getByRole('tabpanel');
  await expectMetric(overview, 'Overdue tasks', 0);
  await expectMetric(overview, 'Renewals in 30 days', 0);
  await expect(overview.getByText('2 Delivered', { exact: true })).toBeVisible();
  await page.clock.fastForward(11_000);
  await expectMetric(overview, 'Overdue tasks', 1);
  await expectMetric(overview, 'Overdue production', 1);
  await expectMetric(overview, 'Renewals in 30 days', 1);
  await expect(overview.getByText('30 days left', { exact: true })).toBeVisible();
  await expect(overview.getByText('4 Planned', { exact: true })).toBeVisible();
  await expect(overview.getByText('2 Delivered', { exact: true })).toHaveCount(0);
});

test('agency pulse updates at midnight without a task mutation', async ({ page }) => {
  await seedDashboard(page, '2026-10-07T16:59:50Z');
  await page.getByRole('tab', { name: 'Agency pulse', exact: true }).click();
  await expectMetric(page.getByRole('tabpanel'), 'Overdue now', 0);
  await page.clock.fastForward(11_000);
  await expectMetric(page.getByRole('tabpanel'), 'Overdue now', 1);
});

test('team workload resets its week and selected member groups at Monday midnight', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedDashboard(page, '2026-10-11T16:59:50Z');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const base = useStore.getState().tasks[0];
    useStore.setState({ tasks: [
      { ...base, id: 'accuracy-monday', title: 'Accuracy Monday task', dueDate: '2026-10-12' },
      { ...base, id: 'accuracy-completed', title: 'Accuracy completed task', dueDate: '2026-10-10', status: 'Completed', isCompleted: true, completedAt: '2026-10-10T07:00:00Z' },
    ] });
  });
  await page.getByRole('tab', { name: 'Team workload', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: 'Accuracy Staff' });
  await expect(row.locator('td').nth(2)).toHaveText('0');
  await expect(row.locator('td').nth(6)).toHaveText('1');
  await row.getByRole('button').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Completed this week', exact: true })).toBeVisible();
  await page.clock.fastForward(11_000);
  await expect(dialog.getByRole('heading', { name: 'Completed this week', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(row.locator('td').nth(2)).toHaveText('1');
  await expect(row.locator('td').nth(6)).toHaveText('0');
});

test('a resumed tab catches up after its clock changes without running timers', async ({ page }) => {
  await seedDashboard(page);
  await expectMetric(page.getByRole('tabpanel'), 'Overdue tasks', 0);
  await page.clock.setSystemTime(new Date('2026-10-08T07:00:00Z'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expectMetric(page.getByRole('tabpanel'), 'Overdue tasks', 1);
  await expectMetric(page.getByRole('tabpanel'), 'Renewals in 30 days', 1);
  await page.clock.setSystemTime(new Date('2026-10-09T07:00:00Z'));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expectMetric(page.getByRole('tabpanel'), 'Overdue tasks', 2);
});

test.describe('daylight-saving day boundary', () => {
  test.use({ timezoneId: 'America/New_York' });
  test('refreshes at the next midnight after a 23-hour day', async ({ page }) => {
    await seedDashboard(page, '2026-03-08T05:00:00Z');
    await page.evaluate(async () => {
      const { useStore } = await import('/src/store/index.ts');
      useStore.setState({ tasks: [{ ...useStore.getState().tasks[0], dueDate: '2026-03-08' }] });
    });
    await expectMetric(page.getByRole('tabpanel'), 'Overdue tasks', 0);
    await page.clock.fastForward(23 * 60 * 60 * 1000 + 100);
    await expectMetric(page.getByRole('tabpanel'), 'Overdue tasks', 1);
  });
});
