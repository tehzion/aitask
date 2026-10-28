// Regression coverage converted from the production recovery audit.
import { expect, test, type Page } from '@playwright/test';

async function seed(page: Page) {
  await page.goto('/login');
  // Let the app finish its startup load so seeded state is not overwritten.
  await page.waitForFunction(() => Boolean(document.querySelector('form input, main')));
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
    const state = useStore.getState();
    const boss = state.users.find(user => user.isSuperAdmin)!;
    enablePasswordResetBypass(boss.id);
    localStorage.setItem(`aitask:release-notice:2026-08-service-operations:${boss.id}`, 'acknowledged');
    useStore.setState({ currentUser: { ...boss, mustResetPassword: false }, clients: [], projects: [], tasks: [], clientPlans: [],
      serviceCycles: [], deliverables: [], addons: [], servicePricingSnapshots: [],
      backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 } });
  });
}

test('draft retry preserves unpersisted edits after its submission was restored away', async ({ page }) => {
  await seed(page);
  const fixture = await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const store = useStore.getState();
    const result = store.createClientWithPlan({ clientName: 'Audit plan company', planName: 'Original saved scope', origin: 'custom',
      serviceItems: [{ id: 'scope', name: 'Design', platforms: [], unit: 'post', quantity: 1, unitPriceMinor: 100 }],
      startDate: '2026-10-01', billingDay: 1, discountType: 'none', discountValue: 0, taxRateBps: 0 });
    store.activateClientPlan(result.planId!);
    const revision = store.createClientPlanRevision(result.planId!);
    return { clientId: result.clientId!, revisionId: revision.planId! };
  });
  await page.goto(`/clients/${fixture.clientId}?tab=plan`);
  const editor = page.getByRole('region', { name: 'Next month’s plan', exact: true });
  await expect(editor).toBeVisible();
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ commitPendingMutation: async () => ({ ok: false, error: 'Unconfirmed audit submission.' }) });
  });
  const name = editor.getByLabel('Plan name', { exact: true });
  const originalName = await name.inputValue();
  await name.fill('Submitted but abandoned scope');
  await editor.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(editor.getByRole('alert')).toContainText('Unconfirmed audit submission.');
  await page.evaluate(async ({ revisionId, originalName }) => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState(state => ({ clientPlans: state.clientPlans.map(plan => plan.id === revisionId ? { ...plan, name: originalName } : plan),
      backend: { ...state.backend, status: 'live', hasLocalChanges: false, pendingMutations: 0 } }));
  }, { ...fixture, originalName });
  await editor.getByRole('button', { name: 'Retry saved change', exact: true }).click();
  await expect(editor.getByText('Your plan change was saved.', { exact: true })).toHaveCount(0);
  await expect(editor.getByRole('alert')).toContainText('Your draft has been kept.');
  await expect(name).toHaveValue('Submitted but abandoned scope');
  expect(await page.evaluate(async id => (await import('/src/store/index.ts')).useStore.getState().clientPlans.find(plan => plan.id === id)?.name, fixture.revisionId)).toBe(originalName);
});

async function openMilestones(page: Page) {
  await seed(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const state = useStore.getState();
    const actor = state.currentUser!;
    useStore.setState({ clients: [{ id: 'audit-company', clientName: 'Audit company', createdBy: actor.id, createdAt: '2026-10-01', updatedAt: '2026-10-01' }],
      projects: [{ id: 'audit-project', clientId: 'audit-company', clientName: 'Audit company', projectName: 'Audit project', services: ['Design'],
        startDate: '2026-10-01', deadline: '2026-11-30', projectManagerIds: [actor.id], status: 'Active', milestones: [] }] });
  });
  await page.goto('/projects');
  const card = page.locator('main div.bg-surface.p-5').filter({ has: page.getByRole('heading', { name: 'Audit company', exact: true }) });
  await card.getByRole('button', { name: 'Details', exact: true }).click();
  await page.getByRole('button', { name: 'Open project', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Audit project', exact: true });
  await panel.getByRole('tab', { name: 'Milestones', exact: true }).click();
  await panel.getByPlaceholder('Milestone name').fill('Milestone A');
  await panel.locator('input[type="date"]').fill('2026-11-30');
  return panel;
}

test('retrying a busy milestone submission reuses the pending milestone', async ({ page }) => {
  const panel = await openMilestones(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ commitPendingMutation: async () => ({ ok: false, code: 'RETRY_REQUIRED', error: 'Another synchronization request is still running.' }), retryPendingSave: async () => ({ ok: true }) });
  });
  await panel.getByRole('button', { name: 'Save milestone', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('Another synchronization request is still running.');
  await panel.getByRole('button', { name: 'Retry pending save', exact: true }).click();
  const milestones = await page.evaluate(async () => (await import('/src/store/index.ts')).useStore.getState().projects.find(project => project.id === 'audit-project')!.milestones!);
  expect(milestones).toHaveLength(1);
  expect(milestones.map(item => item.name)).toEqual(['Milestone A']);
});

test('milestone fields are locked until the submission is acknowledged', async ({ page }) => {
  const panel = await openMilestones(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ commitPendingMutation: () => new Promise(resolve => {
      (window as unknown as { confirmAuditMilestone: () => void }).confirmAuditMilestone = () => resolve({ ok: true });
    }) });
  });
  await panel.getByRole('button', { name: 'Save milestone', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Save milestone', exact: true })).toBeDisabled();
  await expect(panel.getByPlaceholder('Milestone name')).toBeDisabled();
  await expect(panel.getByPlaceholder('Milestone name')).toHaveValue('Milestone A');
  await page.evaluate(() => (window as unknown as { confirmAuditMilestone: () => void }).confirmAuditMilestone());
  await expect(panel.getByPlaceholder('Milestone name')).toHaveValue('');
  expect(await page.evaluate(async () => (await import('/src/store/index.ts')).useStore.getState().projects.find(project => project.id === 'audit-project')!.milestones!.map(item => item.name))).toEqual(['Milestone A']);
});

test('a thrown milestone save preserves its pending identity and permits retry', async ({ page }) => {
  const panel = await openMilestones(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ commitPendingMutation: async () => { throw new Error('Network interrupted.'); }, retryPendingSave: async () => ({ ok: true }) });
  });
  await panel.getByRole('button', { name: 'Save milestone', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('Network interrupted.');
  await expect(panel.getByPlaceholder('Milestone name')).toHaveValue('Milestone A');
  await panel.getByRole('button', { name: 'Retry pending save', exact: true }).click();
  await expect(panel.getByPlaceholder('Milestone name')).toHaveValue('');
  expect(await page.evaluate(async () => (await import('/src/store/index.ts')).useStore.getState().projects[0].milestones?.length)).toBe(1);
});

test('a plan-creation retry preserves its form when the pending plan was discarded', async ({ page }) => {
  await seed(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ clients: [{ id: 'audit-company', clientName: 'Audit company', createdAt: '2026-10-01', updatedAt: '2026-10-01' }] });
  });
  await page.goto('/clients/audit-company?tab=plan');
  await page.getByRole('button', { name: 'Add service plan', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Create service plan', exact: true });
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await dialog.getByRole('button', { name: /Fully custom/ }).click();
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await dialog.getByLabel('Service name', { exact: true }).fill('Unconfirmed scope');
  await dialog.getByLabel('Price', { exact: true }).fill('9180');
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await dialog.getByLabel('Plan name', { exact: true }).fill('Unconfirmed plan');
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    let calls = 0;
    useStore.setState({ retryPendingSave: async () => ++calls === 1 ? { ok: false, error: 'Unconfirmed audit plan.' } : { ok: true } });
  });
  await dialog.getByRole('button', { name: 'Save draft plan', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Unconfirmed audit plan.');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState(state => ({ clientPlans: [], servicePricingSnapshots: [], backend: { ...state.backend, status: 'live', hasLocalChanges: false, pendingMutations: 0 } }));
  });
  await dialog.getByRole('button', { name: 'Retry save', exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('alert')).toContainText('Your draft has been kept.');
  await dialog.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(dialog.getByLabel('Plan name', { exact: true })).toHaveValue('Unconfirmed plan');
  expect(await page.evaluate(async () => (await import('/src/store/index.ts')).useStore.getState().clientPlans)).toEqual([]);
});
