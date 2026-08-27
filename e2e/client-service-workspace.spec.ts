import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const expectNoAxeViolations = async (page: import('@playwright/test').Page, context: string) => {
  const results = await new AxeBuilder({ page }).include('main').analyze();
  expect(results.violations, `${context}: ${results.violations.map(item => `${item.id} (${item.nodes.length})`).join(', ')}`).toEqual([]);
};

test('service plans, frozen workflow tasks and role workbenches remain isolated', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/login');

  const seeded = await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const { SHORT_VIDEO_WORKFLOW_TEMPLATE, snapshotWorkflow } = await import('/src/lib/serviceManagement.ts');
    const state = useStore.getState();
    const boss = state.users.find(user => user.isSuperAdmin)!;
    localStorage.setItem(`aitask:release-notice:2026-08-service-operations:${boss.id}`, 'acknowledged');
    useStore.setState({
      currentUser: { ...boss, mustResetPassword: false },
      clients: [], clientPlans: [], serviceCycles: [], deliverables: [], cycleComments: [], addons: [], tasks: [],
      servicePricingSnapshots: [], serviceWorkflowTemplates: [structuredClone(SHORT_VIDEO_WORKFLOW_TEMPLATE)],
      backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 },
    });
    const create = (name: string, origin: 'standard' | 'customized' | 'custom') => useStore.getState().createClientWithPlan({
      clientName: name, planName: `${name} Growth`, origin,
      sourcePackageId: origin === 'custom' ? undefined : 'PKG-growth', sourcePackageRevision: origin === 'custom' ? undefined : 1,
      serviceItems: [{ id: `${origin}-video`, name: 'Short Video', platforms: ['TikTok'], unit: 'video', quantity: 1, unitPriceMinor: origin === 'customized' ? 32000 : 25000, workflow: snapshotWorkflow(SHORT_VIDEO_WORKFLOW_TEMPLATE) }],
      startDate: '2026-08-15', billingDay: 15, contractEndDate: '2027-08-14', discountType: 'none', discountValue: 0, taxRateBps: 0,
    });
    const standard = create('Standard Co', 'standard');
    const customized = create('Customized Co', 'customized');
    const custom = create('Custom Co', 'custom');
    const activation = useStore.getState().activateClientPlan(customized.planId!);
    const deliverable = useStore.getState().deliverables.find(item => item.cycleId === activation.cycleId)!;
    const generated = useStore.getState().generateDeliverableTaskChain(deliverable.id);
    useStore.getState().setServiceCycleStatus(activation.cycleId!, 'Published');
    return { clientId: customized.clientId!, planId: customized.planId!, cycleId: activation.cycleId!, taskIds: generated.taskIds!, origins: [standard.planId, customized.planId, custom.planId].map(id => useStore.getState().clientPlans.find(plan => plan.id === id)?.origin) };
  });

  expect(seeded.origins).toEqual(['standard', 'customized', 'custom']);
  expect(seeded.taskIds).toHaveLength(10);
  await page.goto(`/clients/${seeded.clientId}`);
  await expect(page.getByRole('heading', { name: 'Customized Co' })).toBeVisible();
  const overviewTab = page.getByRole('tab', { name: 'Overview', exact: true });
  await overviewTab.focus();
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'Activity / Files' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: 'Activity / Files' })).toBeVisible();
  await page.keyboard.press('Home');
  await expect(overviewTab).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Plan', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: 'Plan', exact: true })).toBeVisible();
  await expectNoAxeViolations(page, 'Boss client workspace plan');
  await page.getByRole('tab', { name: 'Plan', exact: true }).click();
  await expect(page.getByText('Internal monthly total')).toBeVisible();
  await expect(page.getByText('Short Video Production · rev 1 · 10 tasks')).toBeVisible();
  await page.getByRole('button', { name: 'Create next revision' }).click();
  await expect(page.getByText(/Scheduled revision 2/)).toBeVisible();
  await expect(page.getByText(/Existing cycles remain unchanged/)).toBeVisible();
  page.once('dialog', async dialog => {
    expect(dialog.message()).not.toMatch(/invoice|outstanding|payment|crm/i);
    await dialog.dismiss();
  });
  await page.getByRole('button', { name: 'Pause' }).click();

  await page.getByRole('tab', { name: 'Cycles', exact: true }).click();
  await expect(page.getByText('Included', { exact: true })).toBeVisible();
  await expect(page.getByText('Completed', { exact: true })).toBeVisible();
  await expect(page.getByText('Remaining', { exact: true })).toBeVisible();
  await expect(page.getByText('10 linked task(s)')).toBeVisible();
  await expect(page.getByText('Invoice', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Outstanding', { exact: true })).toHaveCount(0);

  await page.getByRole('tab', { name: 'Add-ons', exact: true }).click();
  const openAddon = page.getByRole('button', { name: 'Add service add-on' });
  await openAddon.click();
  const addonDialog = page.getByRole('dialog', { name: 'Add service add-on' });
  await expect(addonDialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(addonDialog).toBeHidden();
  await expect(openAddon).toBeFocused();
  await openAddon.click();
  await addonDialog.getByLabel('Add-on name').fill('Launch cutdown');
  await addonDialog.getByLabel('Service cycle').selectOption(seeded.cycleId);
  await addonDialog.getByRole('button', { name: 'Add add-on' }).click();
  await expect(addonDialog).toBeHidden();
  await expect(page.getByText('Launch cutdown')).toBeVisible();

  await page.getByRole('tab', { name: 'Activity / Files' }).click();
  const openActivity = page.getByRole('button', { name: 'Add activity' });
  await openActivity.click();
  const activityDialog = page.getByRole('dialog', { name: 'Add activity' });
  await activityDialog.getByLabel('Update').fill('Internal production checkpoint');
  await activityDialog.getByRole('button', { name: 'Add activity', exact: true }).click();
  await expect(activityDialog).toBeHidden();
  await expect(page.getByText('Internal production checkpoint')).toBeVisible();

  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    localStorage.setItem('aitask:release-notice:2026-08-service-operations:operation-e2e', 'acknowledged');
    useStore.setState({ currentUser: { id: 'operation-e2e', name: 'Operation E2E', role: 'Staff', departments: ['Operation'], department: 'Operation', workerType: 'employee', permissions: { manageServiceCycles: true, viewAllServiceClients: true, viewDashboard: true, viewTasks: true, viewCalendar: true, viewProjects: true } } });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'My work' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Operation context' })).toBeVisible();
  await expect(page.getByText('Pricing is not shown.')).toHaveCount(0);
  await page.goto(`/clients/${seeded.clientId}`);
  await page.getByRole('tab', { name: 'Plan', exact: true }).click();
  await expect(page.getByText('Internal monthly total')).toHaveCount(0);
  await expectNoAxeViolations(page, 'Operation client workspace plan');

  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    localStorage.setItem('aitask:release-notice:2026-08-service-operations:account-e2e', 'acknowledged');
    useStore.setState({ currentUser: { id: 'account-e2e', name: 'Account E2E', role: 'Staff', departments: ['Account & Finance'], department: 'Account & Finance', workerType: 'employee', permissions: { viewDashboard: true, viewAllServiceClients: true, viewServicePrices: true, viewProductionReports: true } } });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'My work' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Account context' })).toBeVisible();
  await expect(page.getByText('Monthly management value')).toHaveCount(0);
  await expect(page.getByText('Invoice', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Outstanding', { exact: true })).toHaveCount(0);
  await expectNoAxeViolations(page, 'Account dashboard');

  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    localStorage.setItem('aitask:release-notice:2026-08-service-operations:client-e2e', 'acknowledged');
    useStore.setState({ currentUser: { id: 'client-e2e', name: 'Customized Client', role: 'Client', departments: ['Client'], department: 'Client', companyName: 'Customized Co', permissions: { viewDashboard: true } } });
  });
  await page.goto(`/clients/${seeded.clientId}`);
  await page.getByRole('tab', { name: 'Deliveries', exact: true }).click();
  await expect(page.getByText(/linked task/i)).toHaveCount(0);
  await page.getByRole('tab', { name: 'Services', exact: true }).click();
  await expect(page.getByText('Internal monthly total')).toHaveCount(0);
  await expect(page.getByText(/each$/)).toHaveCount(0);
  await expectNoAxeViolations(page, 'Client workspace plan');
});
