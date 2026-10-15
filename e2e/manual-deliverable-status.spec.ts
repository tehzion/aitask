import { expect, test } from '@playwright/test';

for (const locale of ['en', 'zh']) test(`a task-free management fee can be put in progress and stays saved after reload (${locale})`, async ({ page }) => {
  await page.addInitScript(value => localStorage.setItem('aitask:locale', value), locale);
  await page.goto('/login');
  const clientId = await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const state = useStore.getState();
    const boss = state.users.find(user => user.isSuperAdmin)!;
    localStorage.setItem(`aitask:release-notice:2026-08-service-operations:${boss.id}`, 'acknowledged');
    useStore.setState({
      currentUser: { ...boss, mustResetPassword: false },
      clients: [], clientPlans: [], serviceCycles: [], deliverables: [], tasks: [],
      backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 },
    });
    const created = useStore.getState().createClientWithPlan({
      clientName: 'Ads Feedback Co', planName: 'Ads Management', origin: 'custom',
      serviceItems: [{ id: 'ads-fee', name: 'ADS Management Fee', platforms: [], unit: 'month', quantity: 1, unitPriceMinor: 10000 }],
      startDate: '2026-10-01', billingDay: 1, discountType: 'none', discountValue: 0, taxRateBps: 0,
    });
    if (!created.ok) throw new Error(created.error);
    const activated = useStore.getState().activateClientPlan(created.planId!);
    if (!activated.ok) throw new Error(activated.error);
    const published = useStore.getState().setServiceCycleStatus(activated.cycleId!, 'Published');
    if (!published.ok) throw new Error(published.error);
    return useStore.getState().clientPlans.find(plan => plan.id === created.planId)!.clientId;
  });
  await page.goto(`/clients/${clientId}`);
  await page.getByRole('tab', { name: locale === 'zh' ? '周期' : 'Cycles', exact: true }).click();
  await expect(page.getByText(locale === 'zh' ? '0 个关联任务' : '0 linked task(s)', { exact: true })).toBeVisible();
  const cycle = page.locator('section').filter({ hasText: 'ADS Management Fee 1' });
  const status = cycle.getByRole('combobox');
  await expect(status).toHaveValue('Planned');
  await status.selectOption('In Progress');
  await expect(status).toHaveValue('In Progress');
  await expect(cycle.getByText(locale === 'zh' ? '已交付 0/1' : 'Delivered 0/1', { exact: true })).toBeVisible();
  await expect(page.getByText('Deliverable status must match the progress of its required tasks.', { exact: true })).toHaveCount(0);

  await page.reload();
  await page.getByRole('tab', { name: locale === 'zh' ? '周期' : 'Cycles', exact: true }).click();
  await expect(status).toHaveValue('In Progress');
  await status.selectOption('Ready');
  await expect(status).toHaveValue('Ready');
  await status.selectOption('Delivered');
  await expect(status).toHaveValue('Delivered');
  await expect(cycle.getByText(locale === 'zh' ? '已交付 1/1' : 'Delivered 1/1', { exact: true })).toBeVisible();
});

test('a frozen workflow exposes only statuses allowed by its required task progress', async ({ page }) => {
  await page.goto('/login');
  const clientId = await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const { SHORT_VIDEO_WORKFLOW_TEMPLATE, snapshotWorkflow } = await import('/src/lib/serviceManagement.ts');
    const state = useStore.getState();
    const boss = state.users.find(user => user.isSuperAdmin)!;
    localStorage.setItem(`aitask:release-notice:2026-08-service-operations:${boss.id}`, 'acknowledged');
    useStore.setState({ currentUser: { ...boss, mustResetPassword: false },
      clients: [], clientPlans: [], serviceCycles: [], deliverables: [], tasks: [],
      backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 },
    });
    const created = useStore.getState().createClientWithPlan({ clientName: 'Workflow Feedback Co', planName: 'Production', origin: 'custom',
      serviceItems: [{ id: 'video', name: 'Video', platforms: [], unit: 'video', quantity: 1, unitPriceMinor: 10000, workflow: snapshotWorkflow(SHORT_VIDEO_WORKFLOW_TEMPLATE) }],
      startDate: '2026-10-01', billingDay: 1, discountType: 'none', discountValue: 0, taxRateBps: 0,
    });
    if (!created.ok) throw new Error(created.error);
    const activated = useStore.getState().activateClientPlan(created.planId!);
    if (!activated.ok) throw new Error(activated.error);
    useStore.getState().setServiceCycleStatus(activated.cycleId!, 'Published');
    return useStore.getState().clientPlans.find(plan => plan.id === created.planId)!.clientId;
  });
  await page.goto(`/clients/${clientId}?tab=cycles`);
  const status = page.getByRole('combobox', { name: 'Deliverable status: Video 1', exact: true });
  await expect(status.getByRole('option', { name: 'Ready', exact: true })).toBeDisabled();
  await expect(status.getByRole('option', { name: 'Delivered', exact: true })).toBeDisabled();
  await expect(page.getByText('Available statuses follow required task progress.', { exact: true })).toBeVisible();
  await status.selectOption('In Progress');
  await expect(status).toHaveValue('In Progress');
  await page.getByRole('button', { name: 'Generate 10 tasks', exact: true }).click();
  await expect(page.getByText('10 linked task(s) · Short Video Production', { exact: true })).toBeVisible();
  await expect(status).toHaveValue('Planned');
  await expect(status.getByRole('option', { name: 'In Progress', exact: true })).toBeDisabled();
  await expect(status.getByRole('option', { name: 'Delivered', exact: true })).toBeDisabled();
});
