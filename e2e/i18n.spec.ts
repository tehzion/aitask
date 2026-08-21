import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('the interface can switch between English and Simplified Chinese and remembers the choice', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sign in to AiTask' })).toBeVisible();
  await expect(page.getByRole('button', { name: '切换为中文' })).toBeVisible();

  await page.getByRole('button', { name: '切换为中文' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.getByRole('heading', { name: '登录 AiTask' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Switch to English' })).toBeVisible();

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.getByRole('heading', { name: '登录 AiTask' })).toBeVisible();

  await page.getByRole('button', { name: 'Switch to English' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { name: 'Sign in to AiTask' })).toBeVisible();
});

test('user-authored task content stays exactly as typed in Chinese mode', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Use Admin Demo' }).click();
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Access Dashboard' }).click();
  await page.waitForURL(/\/(?:settings)?$/);
  const continueButton = page.getByRole('button', { name: 'Continue for now' });
  if (/\/settings$/.test(page.url())) {
    await expect(continueButton).toBeVisible();
    await continueButton.click();
  }
  await page.getByRole('dialog', { name: 'Service operations are now in one calm workspace' })
    .getByRole('button', { name: 'Happy working' }).click();

  // Seed a task whose title collides with UI dictionary keys, plus a client named "Settings".
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const state = useStore.getState();
    useStore.setState({
      clients: [...state.clients, {
        id: 'CL-i18n-probe', clientName: 'Settings', email: 'settings@example.com',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      }],
      tasks: [{
        id: 'T-i18n-probe', clientName: 'Settings', serviceType: 'Design', title: 'Dashboard',
        description: 'Due in two days.', department: 'Management',
        assignedTo: state.currentUser.id, createdBy: state.currentUser.id,
        startDate: '2026-08-01', dueDate: '2026-08-18', priority: 'Medium',
        status: 'Pending', completionPercentage: 0, isCompleted: false,
        revisionCount: 0, clientApprovalStatus: 'Pending', isRecurring: false,
        comments: [{ id: 'c-i18n', userId: state.currentUser.id, text: 'Due soon', createdAt: new Date().toISOString() }],
        approvalHistory: [],
      }],
    });
  });

  await page.goto('/tasks');
  const taskTitle = page.locator('main').getByText('Dashboard', { exact: true }).filter({ visible: true });
  await expect(taskTitle.first()).toBeVisible();
  await expect(page.locator('main').getByText(/T-i18n-probe - Settings/).filter({ visible: true }).first()).toBeVisible();

  // Switch to Chinese via the Navbar switcher.
  await page.getByRole('button', { name: '切换为中文' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');

  // UI chrome translates, user content does not.
  await expect(page.getByRole('heading', { name: '任务管理' })).toBeVisible();
  await expect(page.locator('main').getByText('Dashboard', { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.locator('main').getByText(/T-i18n-probe - Settings/).filter({ visible: true }).first()).toBeVisible();

  // Open the task modal: the comment "Due soon" must not be word-mangled.
  await taskTitle.first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText('Due soon')).toBeVisible();
  await expect(page.getByText('到期 soon')).toHaveCount(0);
  await page.keyboard.press('Escape');
});

test('client portal and workspace keep user-authored names untouched in Chinese mode', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Use Admin Demo' }).click();
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Access Dashboard' }).click();
  await page.waitForURL(/\/(?:settings)?$/);
  const continueButton = page.getByRole('button', { name: 'Continue for now' });
  if (/\/settings$/.test(page.url())) {
    await expect(continueButton).toBeVisible();
    await continueButton.click();
  }
  await page.getByRole('dialog', { name: 'Service operations are now in one calm workspace' })
    .getByRole('button', { name: 'Happy working' }).click();

  const seeded = await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const { SHORT_VIDEO_WORKFLOW_TEMPLATE, snapshotWorkflow } = await import('/src/lib/serviceManagement.ts');
    const state = useStore.getState();
    const plan = useStore.getState().createClientWithPlan({
      clientName: 'Settings', planName: 'Settings Growth', origin: 'customized',
      sourcePackageId: 'PKG-growth', sourcePackageRevision: 1,
      serviceItems: [{ id: 'svc-i18n', name: 'Short Video', platforms: ['TikTok'], unit: 'video', quantity: 1, unitPriceMinor: 25000, workflow: snapshotWorkflow(SHORT_VIDEO_WORKFLOW_TEMPLATE) }],
      startDate: '2026-08-15', billingDay: 15, contractEndDate: '2027-08-14', discountType: 'none', discountValue: 0, taxRateBps: 0,
    });
    const activation = useStore.getState().activateClientPlan(plan.planId!);
    const deliverable = useStore.getState().deliverables.find(item => item.cycleId === activation.cycleId)!;
    useStore.setState({ deliverables: useStore.getState().deliverables.map(item => item.id === deliverable.id ? { ...item, title: 'Dashboard' } : item) });
    useStore.getState().generateDeliverableTaskChain(deliverable.id);
    useStore.getState().setServiceCycleStatus(activation.cycleId!, 'Published');
    useStore.setState({
      tasks: [...useStore.getState().tasks, {
        id: 'T-i18n-client', clientName: 'Settings', serviceType: 'Design', title: 'Dashboard',
        description: 'Client-visible probe.', department: 'Management',
        assignedTo: state.currentUser.id, createdBy: state.currentUser.id,
        startDate: '2026-08-01', dueDate: '2026-08-18', priority: 'Medium',
        status: 'Waiting Approval', completionPercentage: 100, isCompleted: true,
        revisionCount: 0, clientApprovalStatus: 'Pending', isRecurring: false,
        comments: [], approvalHistory: [], updatedAt: new Date().toISOString(),
      }],
    });
    return { clientId: plan.clientId! };
  });

  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    localStorage.setItem('aitask:release-notice:2026-08-service-operations:client-i18n', 'acknowledged');
    useStore.setState({ currentUser: { id: 'client-i18n', name: 'Client I18N', role: 'Client', departments: ['Client'], department: 'Client', companyName: 'Settings', permissions: { viewDashboard: true } } });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Client Portal' })).toBeVisible();
  await expect(page.locator('main').getByText('Dashboard', { exact: true }).first()).toBeVisible();

  await page.getByRole('button', { name: '切换为中文' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.getByRole('heading', { name: '客户门户' })).toBeVisible();
  await expect(page.locator('main').getByText('等待您审批', { exact: true }).first()).toBeVisible();
  await expect(page.locator('main').getByText('即将到期', { exact: true }).first()).toBeVisible();
  await expect(page.locator('main').getByText('1 项服务 · 1 个已发布周期').first()).toBeVisible();
  await expect(page.locator('main').getByText('Dashboard', { exact: true }).first()).toBeVisible();

  await page.goto(`/clients/${seeded.clientId}`);
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await expect(page.getByText('已完成 0 / 1 个交付物').first()).toBeVisible();
  await page.getByRole('tab', { name: '周期', exact: true }).click();
  await expect(page.locator('main').getByText('Dashboard', { exact: true }).first()).toBeVisible();
  await expect(page.locator('main').getByText(/个关联任务 · Short Video Production/).first()).toBeVisible();

  const axeResults = await new AxeBuilder({ page }).include('main').analyze();
  expect(axeResults.violations, `Client portal zh: ${axeResults.violations.map(item => `${item.id} (${item.nodes.length})`).join(', ')}`).toEqual([]);
});
