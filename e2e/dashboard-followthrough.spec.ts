import { expect, test, type Page } from '@playwright/test';

test.use({ timezoneId: 'Asia/Jakarta' });
test.describe.configure({ timeout: 90_000 });

const seedBoss = async (page: Page, time = '2026-10-07T07:00:00Z') => {
  await page.clock.install({ time: new Date(new Date(time).getTime() - 86_400_000) });
  await page.clock.pauseAt(new Date(time));
  await page.goto('/login');
  await expect(page.getByLabel('Email or username')).toBeVisible();
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
    const state = useStore.getState();
    const boss = state.users.find(user => user.isSuperAdmin)!;
    enablePasswordResetBypass(boss.id);
    localStorage.setItem(`aitask:release-notice:2026-08-service-operations:${boss.id}`, 'acknowledged');
    useStore.setState({ currentUser: { ...boss, mustResetPassword: false } });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Agency operations' })).toBeVisible();
  await page.evaluate(async () => {
    const { useStore, stopBackendAutoSync } = await import('/src/store/index.ts');
    const state = useStore.getState();
    const task = { ...state.tasks[0], clientName: 'Followup Company', clientId: 'followup-company', department: 'Designer', assignedTo: state.currentUser!.id, status: 'In Progress', isCompleted: false, completedAt: undefined, comments: [], approvalHistory: [] };
    useStore.setState({
      clients: [{ id: 'followup-company', clientName: task.clientName, createdBy: state.currentUser!.id, createdAt: '2026-10-01', updatedAt: '2026-10-01' }],
      projects: [], registrations: [], clientPlans: [], serviceCycles: [], deliverables: [], servicePricingSnapshots: [],
      tasks: [
        { ...task, id: 'followup-overdue', title: 'Followup overdue', dueDate: '2026-10-06' },
        { ...task, id: 'followup-today', title: 'Followup today', dueDate: '2026-10-07' },
        { ...task, id: 'followup-tomorrow', title: 'Followup tomorrow', dueDate: '2026-10-08' },
        { ...task, id: 'followup-invalid', title: 'Followup invalid', dueDate: 'invalid' },
        { ...task, id: 'followup-completed', title: 'Followup completed', dueDate: '2026-10-06', status: 'Completed', isCompleted: false, completedAt: '2026-10-07T07:00:00Z' },
        { ...task, id: 'followup-cancelled', title: 'Followup cancelled', dueDate: '2026-10-06', status: 'Cancelled' },
        { ...task, id: 'followup-waiting', title: 'Followup waiting', dueDate: '2026-10-08', status: 'Waiting Approval' },
      ],
    });
    stopBackendAutoSync();
  });
  await page.clock.runFor(500);
};

const expectReportMetric = async (page: Page, label: string, value: number) => {
  await expect(page.getByText(label, { exact: true }).first().locator('..').getByText(String(value), { exact: true })).toBeVisible();
};

test('dashboard overdue drilldown and task quick filters use the same task set', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await seedBoss(page);
  await page.locator('a[href="/tasks?focus=overdue"]').click();
  await expect(page.getByText('Followup overdue', { exact: true }).first()).toBeVisible();
  for (const title of ['Followup today', 'Followup completed', 'Followup invalid', 'Followup cancelled']) {
    await expect(page.getByText(title, { exact: true })).toHaveCount(0);
  }
  const filters = page.getByRole('group', { name: 'Quick task filters' });
  await filters.getByRole('button', { name: 'Due today', exact: true }).click();
  await expect(page).toHaveURL(/period=today/);
  await expect(page.getByText('Followup today', { exact: true }).first()).toBeVisible();
  await filters.getByRole('button', { name: 'Overdue', exact: true }).click();
  await expect(page).toHaveURL(/focus=overdue/);
  await expect(page).not.toHaveURL(/period=/);
  await expect(page.getByText('Followup today', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Followup completed', { exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('article').filter({ hasText: 'Followup overdue' })).toBeVisible();
  await filters.getByRole('button', { name: 'All', exact: true }).click();
  await expect(page).not.toHaveURL(/focus=|period=/);
  await expect(page.locator('article').filter({ hasText: 'Followup tomorrow' })).toBeVisible();
});

test('today task links update to the new day at midnight', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await seedBoss(page, '2026-10-07T16:59:50Z');
  await page.goto('/tasks?period=today');
  await page.clock.runFor(500);
  await expect(page.getByText('Followup today', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Followup tomorrow', { exact: true })).toHaveCount(0);
  await page.clock.fastForward(11_000);
  await expect(page.getByText('Followup today', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Followup tomorrow', { exact: true }).first()).toBeVisible();
});

test('weekly task links update to the new work week on Monday', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await seedBoss(page, '2026-10-11T16:59:50Z');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const task = useStore.getState().tasks[0];
    useStore.setState({ tasks: [
      { ...task, id: 'followup-saturday', title: 'Followup Saturday', dueDate: '2026-10-10' },
      { ...task, id: 'followup-monday', title: 'Followup Monday', dueDate: '2026-10-12' },
    ] });
  });
  await page.goto('/tasks?period=week');
  await page.clock.runFor(500);
  await expect(page.getByText('Followup Saturday', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Followup Monday', { exact: true })).toHaveCount(0);
  await page.clock.fastForward(11_000);
  await expect(page.getByText('Followup Saturday', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Followup Monday', { exact: true }).first()).toBeVisible();
});

test('reports recalculate open and overdue outcomes at midnight without new task data', async ({ page }) => {
  await seedBoss(page, '2026-10-07T16:59:50Z');
  await page.goto('/reports');
  await page.clock.runFor(500);
  await expectReportMetric(page, 'Open today', 1);
  await expectReportMetric(page, 'Overdue', 1);
  await expectReportMetric(page, 'Upcoming', 2);
  await page.clock.fastForward(11_000);
  await expectReportMetric(page, 'Open today', 2);
  await expectReportMetric(page, 'Overdue', 2);
  await expectReportMetric(page, 'Upcoming', 0);
});

test('the report cohort window advances on Monday', async ({ page }) => {
  await seedBoss(page, '2026-10-11T16:59:50Z');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const task = useStore.getState().tasks[0];
    useStore.setState({ tasks: [
      { ...task, id: 'followup-expiring', dueDate: '2026-09-14' },
      { ...task, id: 'followup-entering', dueDate: '2026-10-13' },
    ] });
  });
  await page.goto('/reports');
  await page.clock.runFor(500);
  await expectReportMetric(page, 'Overdue', 1);
  await expectReportMetric(page, 'Upcoming', 0);
  await page.clock.fastForward(11_000);
  await expectReportMetric(page, 'Overdue', 0);
  await expectReportMetric(page, 'Upcoming', 1);
});

test('historical completed tasks do not have overdue styling in recent completions', async ({ page }) => {
  await seedBoss(page);
  await page.getByRole('tab', { name: 'Agency pulse', exact: true }).click();
  const completion = page.getByRole('tabpanel').locator('a[href="/tasks?taskId=followup-completed"]');
  await expect(completion).toBeVisible();
  await expect(completion.locator('time')).not.toHaveClass(/text-red-700/);
  await expect(page.locator('a[href="/tasks?taskId=followup-completed"]').getByText('1 day ago', { exact: true })).toBeVisible();
});

const seedCompanyCycles = async (page: Page) => {
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const state = useStore.getState();
    const plan = { id: 'followup-plan', clientId: 'followup-company', clientName: 'Followup Company', name: 'Followup Plan', revision: 1, status: 'Active', currency: 'MYR', origin: 'custom', serviceItems: [], discountType: 'none', discountValue: 0, taxRateBps: 0, startDate: '2026-10-01', billingDay: 1, createdBy: state.currentUser!.id, createdAt: '2026-10-01', updatedAt: '2026-10-01' };
    const cycle = { id: 'followup-current-cycle', clientId: plan.clientId, clientName: plan.clientName, planId: plan.id, planRevision: 1, periodStart: '2026-10-01', periodEnd: '2026-10-31', status: 'Draft', currency: 'MYR', serviceItems: [], addonSnapshots: [], discountType: 'none', discountValue: 0, taxRateBps: 0, createdAt: '2026-10-01', updatedAt: '2026-10-01' };
    const deliveries = (cycleId: string, quantity: number, delivered: number) => Array.from({ length: quantity }, (_, i) => ({ id: `${cycleId}-${i}`, clientId: plan.clientId, clientName: plan.clientName, planId: plan.id, cycleId, serviceItemId: 'followup-item', taskIds: [], name: `Output ${i}`, status: i < delivered ? 'Delivered' : 'Planned', createdAt: '2026-10-01', updatedAt: '2026-10-01' }));
    useStore.setState({
      clientPlans: [plan],
      serviceCycles: [
        cycle,
        { ...cycle, id: 'followup-old-cycle', status: 'Completed', periodStart: '2026-09-01', periodEnd: '2026-09-30' },
        { ...cycle, id: 'followup-future-cycle', status: 'Published', periodStart: '2026-11-01', periodEnd: '2026-11-30' },
        { ...cycle, id: 'followup-other-plan', planId: 'other-plan', status: 'Published', periodStart: '2026-10-06' },
      ],
      deliverables: [
        ...deliveries(cycle.id, 3, 0),
        ...deliveries('followup-old-cycle', 9, 9),
        ...deliveries('followup-future-cycle', 4, 2),
        ...deliveries('followup-other-plan', 5, 5),
      ],
    });
  });
};

test('company operations uses the current plan cycle while retaining internal draft progress', async ({ page }) => {
  await seedBoss(page);
  await seedCompanyCycles(page);
  await page.goto('/clients/followup-company');
  await page.clock.runFor(500);
  await expect(page.getByText('0/3 deliverables completed', { exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ serviceCycles: useStore.getState().serviceCycles.filter(cycle => cycle.id !== 'followup-current-cycle') });
  });
  await expect(page.getByText('No published cycle for this month', { exact: true })).toBeVisible();
  await expect(page.getByText('2/4 deliverables completed', { exact: true })).toHaveCount(0);
});

test('company operations progresses to the next dated cycle at midnight', async ({ page }) => {
  await seedBoss(page, '2026-10-31T16:59:50Z');
  await seedCompanyCycles(page);
  await page.goto('/clients/followup-company');
  await page.clock.runFor(500);
  await expect(page.getByText('0/3 deliverables completed', { exact: true })).toBeVisible();
  await page.clock.fastForward(11_000);
  await expect(page.getByText('2/4 deliverables completed', { exact: true })).toBeVisible();
  await expect(page.getByText('0/3 deliverables completed', { exact: true })).toHaveCount(0);
});
