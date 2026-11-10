import { expect, test, type Page } from '@playwright/test';

async function seed(page: Page, projectAccess = false, prices = true) {
  await page.goto('/login');
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
  const fixture = await page.evaluate(async ({ projectAccess, prices }) => {
    const { useStore } = await import('/src/store/index.ts');
    const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
    const { defaultRolePermissions } = await import('/src/lib/access.ts');
    const state = useStore.getState();
    const user = state.users.find(user => user.role === 'Project Manager' && !user.isSuperAdmin)!;
    const pm = { ...user, mustResetPassword: false, permissions: { ...defaultRolePermissions['Project Manager'], viewServicePrices: prices } };
    enablePasswordResetBypass(pm.id);
    localStorage.setItem(`aitask:release-notice:2026-11-everyday-saves:${pm.id}`, 'acknowledged');
    useStore.setState({ currentUser: pm, users: state.users.map(user => user.id === pm.id ? pm : user), rolePermissions: [], clients: [], projects: [], tasks: [], clientPlans: [], serviceCycles: [], deliverables: [], cycleComments: [], addons: [], servicePricingSnapshots: [], backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 } });
    const created = useStore.getState().createClientWithPlan({ clientName: 'PM recovery company', planName: 'PM scope', origin: 'custom', serviceItems: [{ id: 'pm-item', name: 'Management', platforms: [], unit: 'month', quantity: 1, unitPriceMinor: 918000 }], startDate: '2026-11-01', billingDay: 1, discountType: 'none', discountValue: 0, taxRateBps: 0 });
    if (!created.ok) throw new Error(created.error);
    useStore.getState().activateClientPlan(created.planId!);
    const revision = useStore.getState().createClientPlanRevision(created.planId!);
    if (!revision.ok) throw new Error(revision.error);
    if (projectAccess) useStore.setState(state => ({ clients: state.clients.map(client => ({ ...client, createdBy: 'other-pm' })), projects: [{ id: 'pm-owned-project', clientId: created.clientId, clientName: 'PM recovery company', projectName: 'PM project', createdBy: pm.id, projectManagerIds: [pm.id], services: ['Design'], startDate: '2026-11-01', deadline: '' }] }));
    return { clientId: created.clientId!, revisionId: revision.planId! };
  }, { projectAccess, prices });
  await page.goto(`/clients/${fixture.clientId}?tab=plan`);
  await page.evaluate(async prices => {
    const { useStore } = await import('/src/store/index.ts');
    const state = useStore.getState();
    if (!state.currentUser || state.currentUser.isSuperAdmin) throw new Error('Expected a non-admin PM');
    const { defaultRolePermissions } = await import('/src/lib/access.ts');
    const pm = { ...state.currentUser, permissions: { ...defaultRolePermissions['Project Manager'], viewServicePrices: prices } };
    useStore.setState({ currentUser: pm, users: state.users.map(user => user.id === pm.id ? pm : user) });
  }, prices);
  const editor = page.getByRole('region', { name: 'Next month’s plan', exact: true });
  await expect(editor).toBeVisible();
  return { ...fixture, editor };
}

for (const projectAccess of [false, true]) for (const prices of [false, true]) {
  test(`PM saves and schedules (${projectAccess ? 'project' : 'company'} access, prices ${prices})`, async ({ page }) => {
    const { editor, revisionId } = await seed(page, projectAccess, prices);
    await expect(editor.getByLabel('Unit price (MYR)', { exact: true })).toHaveCount(prices ? 1 : 0);
    await editor.getByLabel('Plan name', { exact: true }).fill('Confirmed PM scope');
    await editor.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(editor.getByText('Draft saved. Review the changes before scheduling.', { exact: true })).toBeVisible();
    await editor.getByRole('button', { name: 'Review changes', exact: true }).click();
    await editor.getByRole('button', { name: /^Schedule for/ }).click();
    await expect(editor.getByText('Next month’s plan is scheduled.', { exact: true })).toBeVisible();
    await page.reload();
    expect(await page.evaluate(async id => (await import('/src/store/index.ts')).useStore.getState().clientPlans.find(plan => plan.id === id)?.revisionScheduleStatus, revisionId)).toBe('scheduled');
  });
}

test('PM cannot review or resubmit an unconfirmed plan and sees the save failure', async ({ page }) => {
  const { editor } = await seed(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const update = useStore.getState().updateDraftClientPlan;
    let stages = 0;
    useStore.setState({ updateDraftClientPlan: (...args) => { stages++; return update(...args); },
      commitPendingMutation: async () => ({ ok: false, error: 'PM save response timed out.' }),
      retryPendingSave: async () => ({ ok: true }) });
    (window as unknown as { pmStages: () => number }).pmStages = () => stages;
  });
  await editor.getByLabel('Plan name', { exact: true }).fill('Retained PM scope');
  await editor.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(editor.getByRole('alert')).toContainText('PM save response timed out.');
  await expect(editor.getByRole('button', { name: 'Save draft', exact: true })).toBeDisabled();
  await expect(editor.getByRole('button', { name: 'Review changes', exact: true })).toBeDisabled();
  await expect(editor.getByRole('button', { name: 'Retry saved change', exact: true })).toBeVisible();
  await editor.getByRole('button', { name: 'Retry saved change', exact: true }).click();
  await expect(editor.getByText('Your plan change was saved.', { exact: true })).toBeVisible();
  await expect(editor.getByRole('button', { name: 'Review changes', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => (window as unknown as { pmStages: () => number }).pmStages())).toBe(1);
});

for (const code of ['FORBIDDEN', 'VALIDATION', 'NOT_FOUND']) test(`PM sees restore rather than retry for ${code}`, async ({ page }) => {
  const { editor } = await seed(page);
  await page.evaluate(async code => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState(state => ({ backend: { ...state.backend, status: 'refresh_required', hasLocalChanges: true, pendingMutations: 1, errorCode: code, error: 'PM change rejected by the server.' } }));
  }, code);
  await expect(editor.getByRole('button', { name: 'Retry saved change', exact: true })).toHaveCount(0);
  await expect(editor).toContainText('PM change rejected by the server.');
  await expect(editor).toContainText('To continue, select Restore saved data. This discards pending changes and reloads the latest saved data.');
});

test('PM update-required state blocks edits and offers refresh instead of save retry', async ({ page }) => {
  const { editor } = await seed(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState(state => ({ backend: { ...state.backend, status: 'upgrade_required', upgradeRequired: true, error: 'A system update is required.' } }));
  });
  await expect(editor.getByRole('button', { name: 'Save draft', exact: true })).toBeDisabled();
  await expect(editor.getByRole('button', { name: 'Retry saved change', exact: true })).toHaveCount(0);
  await expect(editor).toContainText('A system update is required.');
});

test('PM restores a rejected save without losing the draft', async ({ page }) => {
  const { editor } = await seed(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const plans = structuredClone(useStore.getState().clientPlans);
    useStore.setState({ commitPendingMutation: async () => {
      useStore.setState(state => ({ backend: { ...state.backend, status: 'refresh_required', errorCode: 'FORBIDDEN', error: 'PM access was revoked.', hasLocalChanges: true, pendingMutations: 1 } }));
      return { ok: false, code: 'FORBIDDEN', error: 'PM access was revoked.' };
    }, discardMutation: async () => {
      useStore.setState(state => ({ clientPlans: plans, backend: { ...state.backend, status: 'live', error: undefined, errorCode: undefined, hasLocalChanges: false, pendingMutations: 0 } }));
    } });
  });
  await editor.getByLabel('Plan name', { exact: true }).fill('Retained rejected PM draft');
  await editor.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(editor.getByRole('button', { name: 'Retry saved change', exact: true })).toHaveCount(0);
  await editor.getByRole('button', { name: 'Restore saved data', exact: true }).click();
  await expect(editor.getByLabel('Plan name', { exact: true })).toHaveValue('Retained rejected PM draft');
  await expect(editor.getByLabel('Plan name', { exact: true })).toBeEnabled();
  await expect(editor.getByRole('button', { name: 'Save draft', exact: true })).toBeEnabled();
  await expect(editor.getByText('Saved data restored. Your draft has been kept. Review it before saving again.', { exact: true })).toBeVisible();
});

for (const status of ['offline', 'retry_required', 'conflict'] as const) test(`PM opens recovery for ${status} and keeps local draft edits`, async ({ page }) => {
  const { editor } = await seed(page);
  await editor.getByLabel('Plan name', { exact: true }).fill('PM draft survives recovery');
  await page.evaluate(async status => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState(state => ({ backend: { ...state.backend, status, error: `Pending PM save: ${status}`, hasLocalChanges: true, pendingMutations: 1 },
      retryPendingSave: async () => {
        useStore.setState(state => ({ backend: { ...state.backend, status: 'live', error: undefined, errorCode: undefined, hasLocalChanges: false, pendingMutations: 0 } }));
        return { ok: true };
      } }));
  }, status);
  await expect(editor).toContainText(`Pending PM save: ${status}`);
  await expect(editor.getByRole('button', { name: 'Save draft', exact: true })).toBeDisabled();
  await editor.getByRole('button', { name: 'Retry saved change', exact: true }).click();
  await expect(editor.getByLabel('Plan name', { exact: true })).toHaveValue('PM draft survives recovery');
  await expect(editor.getByRole('button', { name: 'Save draft', exact: true })).toBeEnabled();
  await expect(editor.getByText('Your plan change was saved.', { exact: true })).toHaveCount(0);
});

test('PM failed restore does not claim that saved data was restored', async ({ page }) => {
  const { editor } = await seed(page);
  await editor.getByLabel('Plan name', { exact: true }).fill('PM draft kept after failed restore');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState(state => ({ backend: { ...state.backend, status: 'refresh_required', errorCode: 'FORBIDDEN', error: 'Rejected PM save.', hasLocalChanges: true, pendingMutations: 1 },
      discardMutation: async () => {
        useStore.setState(state => ({ backend: { ...state.backend, status: 'refresh_required', errorCode: undefined, error: 'PM restore refresh timed out.', hasLocalChanges: false, pendingMutations: 0 } }));
      } }));
  });
  await editor.getByRole('button', { name: 'Restore saved data', exact: true }).click();
  await expect(editor).toContainText('PM restore refresh timed out.');
  await expect(editor.getByText('Saved data restored. Your draft has been kept. Review it before saving again.', { exact: true })).toHaveCount(0);
  await expect(editor.getByLabel('Plan name', { exact: true })).toHaveValue('PM draft kept after failed restore');
});
