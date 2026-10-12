import { expect, test } from '@playwright/test';
test.use({ timezoneId: 'Asia/Kuala_Lumpur' });
const seedReview = async (page: import('@playwright/test').Page, locale: string) => {
  await page.setViewportSize(locale === 'zh' ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
  await page.clock.install({ time: new Date('2026-10-12T04:00:00Z') });
  await page.goto('/login');
  await expect(page.getByLabel('Email or username')).toBeVisible();
  await page.evaluate(async locale => {
    localStorage.setItem('aitask:locale', locale);
    const { useStore, stopBackendAutoSync } = await import('/src/store/index.ts');
    const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
    const state = useStore.getState();
    const boss = state.users.find(user => user.isSuperAdmin)!;
    enablePasswordResetBypass(boss.id);
    localStorage.setItem(`aitask:release-notice:2026-08-service-operations:${boss.id}`, 'acknowledged');
    const client = { ...state.clients[0], id: 'review-client', clientName: 'Review Company', createdBy: boss.id };
    const plan = { ...state.clientPlans[0], id: 'review-plan', clientId: client.id, clientName: client.clientName, name: 'Review Plan', status: 'Active' as const, revision: 1 };
    const cycle = { ...state.serviceCycles[0], id: 'review-cycle', planId: plan.id, clientId: client.id, clientName: client.clientName, status: 'Draft' as const, periodStart: '2026-10-01', periodEnd: '2026-10-31', serviceItems: [] };
    const deliverable = { ...state.deliverables[0], id: 'review-deliverable', cycleId: cycle.id, planId: plan.id, clientId: client.id, clientName: client.clientName, title: 'Review output', status: 'Planned' as const, taskIds: [], attachments: [] };
    const task = { ...state.tasks[0], id: 'review-task', clientId: client.id, clientName: client.clientName, title: 'Completed review work', assignedTo: boss.id, createdBy: boss.id, status: 'Completed' as const, isCompleted: true, completedAt: '2026-10-12T04:00:00Z', deliverableId: undefined, serviceCycleId: undefined, projectId: undefined };
    useStore.setState({ currentUser: { ...boss, mustResetPassword: false }, clients: [client], clientPlans: [plan], serviceCycles: [cycle], deliverables: [deliverable], tasks: [task, { ...task, id: 'review-task-second', title: 'Second review work' }], projects: [],
      backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 } });
    stopBackendAutoSync();
  }, locale);
  await page.goto('/clients/review-client');
};
for (const locale of ['en', 'zh']) test(`delivery review preserves pending actions and empty progress (${locale})`, async ({ page }) => {
  await seedReview(page, locale);
  const panel = page.getByRole('region', { name: locale === 'en' ? 'Delivery records need review' : '交付记录需要审核' });
  await expect(panel).toBeVisible();
  await expect(page.getByText('0%', { exact: true })).toHaveCount(0);
  await expect(panel.getByRole('button', { name: locale === 'en' ? 'Publish' : '发布', exact: true })).toBeVisible();
  const selectors = panel.getByRole('combobox');
  await selectors.nth(0).selectOption('review-deliverable');
  await selectors.nth(1).selectOption('review-deliverable');
  await page.getByRole('tab', { name: locale === 'en' ? 'Cycles' : '周期', exact: true }).click();
  await expect(panel).toBeHidden();
  await page.getByRole('tab', { name: locale === 'en' ? 'Overview' : '概览', exact: true }).click();
  await expect(selectors.nth(0)).toHaveValue('review-deliverable');
  await expect(selectors.nth(1)).toHaveValue('review-deliverable');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ commitPendingMutation: async () => ({ ok: false, error: 'The change is waiting to be saved.' }), retryPendingSave: async () => ({ ok: true }) });
  });
  await panel.getByRole('button', { name: locale === 'en' ? 'Link task' : '关联任务', exact: true }).nth(0).click();
  const retry = panel.getByRole('button', { name: locale === 'en' ? 'Retry pending save' : '重试待保存更改' });
  await expect(retry).toBeVisible();
  await page.getByRole('tab', { name: locale === 'en' ? 'Cycles' : '周期', exact: true }).click();
  await page.getByRole('tab', { name: locale === 'en' ? 'Overview' : '概览', exact: true }).click();
  await expect(retry).toBeVisible();
  await retry.click();
  await expect(retry).toHaveCount(0);
  await expect(panel.getByRole('combobox')).toHaveValue('review-deliverable');
  await page.evaluate(async () => { const { useStore } = await import('/src/store/index.ts'); useStore.setState({ commitPendingMutation: async () => ({ ok: true }) }); });
  await panel.getByRole('button', { name: locale === 'en' ? 'Publish' : '发布', exact: true }).click();
  await expect(panel.getByRole('combobox')).toHaveValue('review-deliverable');
  const result = await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    return { cycle: useStore.getState().serviceCycles[0].status, deliverable: useStore.getState().deliverables[0].status, link: useStore.getState().tasks[0].deliverableId };
  });
  expect(result).toEqual({ cycle: 'Published', deliverable: 'Ready', link: 'review-deliverable' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `/tmp/aitask-delivery-review-${locale}.png`, fullPage: true });
});

test('invalid links and expired drafts require explicit scoped review', async ({ page }) => {
  await seedReview(page, 'en');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const state = useStore.getState();
    const foreign = { ...state.deliverables[0], id: 'foreign-output', clientId: 'foreign-company', title: 'Foreign secret output', taskIds: ['review-task'] };
    useStore.setState({ tasks: state.tasks.map(task => task.id === 'review-task' ? { ...task, deliverableId: foreign.id } : task),
      deliverables: [...state.deliverables, foreign], serviceCycles: [...state.serviceCycles, { ...state.serviceCycles[0], id: 'expired-review-cycle', periodStart: '2026-09-01', periodEnd: '2026-09-30' }] });
  });
  const panel = page.getByRole('region', { name: 'Delivery records need review' });
  await expect(panel.getByText('Invalid delivery link. Review before linking again.')).toBeVisible();
  await expect(panel.getByText('Foreign secret output')).toHaveCount(0);
  await expect(panel.getByRole('combobox')).toHaveCount(1);
  await panel.getByRole('button', { name: 'Older unpublished cycles (1)' }).click();
  await expect(panel.getByText(/Expired unpublished cycle/)).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Publish', exact: true })).toHaveCount(1);
  page.once('dialog', dialog => dialog.dismiss());
  await panel.getByRole('button', { name: 'Remove invalid link' }).click();
  await expect(panel.getByRole('combobox')).toHaveCount(1);
  page.once('dialog', dialog => dialog.accept());
  await panel.getByRole('button', { name: 'Remove invalid link' }).click();
  await expect(panel.getByRole('combobox')).toHaveCount(2);
  const state = await page.evaluate(async () => {
    const store = (await import('/src/store/index.ts')).useStore.getState();
    return { taskExists: store.tasks.some(task => task.id === 'review-task'), taskLink: store.tasks.find(task => task.id === 'review-task')?.deliverableId,
      foreignLinks: store.deliverables.find(item => item.id === 'foreign-output')?.taskIds, oldCycle: store.serviceCycles.find(item => item.id === 'expired-review-cycle')?.status };
  });
  expect(state).toEqual({ taskExists: true, taskLink: undefined, foreignLinks: [], oldCycle: 'Draft' });
});
