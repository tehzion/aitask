import { expect, test } from '@playwright/test';

const seedBoss = async (page: import('@playwright/test').Page) => {
  await page.goto('/login');
  return page.evaluate(async () => {
    const { useStore } = await import('/src/app/store/workspaceStore.ts');
    const { enablePasswordResetBypass } = await import('/src/modules/authentication/domain/auth.ts');
    const state = useStore.getState();
    const boss = state.users.find(user => user.isSuperAdmin)!;
    enablePasswordResetBypass(boss.id);
    localStorage.setItem(`aitask:release-notice:2026-10-project-workflows:${boss.id}`, 'acknowledged');
    useStore.setState({
      currentUser: { ...boss, mustResetPassword: false },
      clients: [], projects: [], tasks: [], clientPlans: [], serviceCycles: [],
      deliverables: [], servicePricingSnapshots: [], addons: [],
      backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 },
    });
    return { bossId: boss.id };
  });
};

test('Edit details adds a service to the next revision without changing the active plan', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-15T04:00:00Z') });
  await seedBoss(page);
  const seeded = await page.evaluate(async () => {
    const { useStore } = await import('/src/app/store/workspaceStore.ts');
    const created = useStore.getState().createClientWithPlan({
      clientName: 'Plan details company', planName: 'Original scope', origin: 'custom',
      serviceItems: [{ id: 'original-service', name: 'Design', platforms: ['Instagram'], unit: 'post', quantity: 1, unitPriceMinor: 10000 }],
      startDate: '2026-10-01', billingDay: 1, discountType: 'none', discountValue: 0, taxRateBps: 0,
    });
    if (!created.ok) throw new Error(created.error);
    const activated = useStore.getState().activateClientPlan(created.planId!);
    if (!activated.ok) throw new Error(activated.error);
    const original = useStore.getState().clientPlans.find(plan => plan.id === created.planId)!;
    return {
      clientId: created.clientId!,
      planId: created.planId!,
      originalName: original.name,
      originalItems: original.serviceItems.map(item => item.name),
      cycles: structuredClone(useStore.getState().serviceCycles.filter(cycle => cycle.clientId === created.clientId)),
    };
  });

  await page.goto(`/clients/${seeded.clientId}?tab=plan`);
  await page.getByRole('button', { name: 'Edit details', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit details' });
  await expect(dialog).toBeVisible();

  await dialog.getByRole('button', { name: 'Add service', exact: true }).click();
  await dialog.getByLabel('Service name', { exact: true }).last().fill('Paid social');
  await dialog.getByLabel('Unit price (MYR)', { exact: true }).last().fill('150');
  await dialog.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(dialog.getByText('Draft saved. Review the changes before scheduling.', { exact: true })).toBeVisible();

  const saved = await page.evaluate(async ({ planId, clientId }) => {
    const { useStore } = await import('/src/app/store/workspaceStore.ts');
    const state = useStore.getState();
    const original = state.clientPlans.find(plan => plan.id === planId);
    const revision = state.clientPlans.find(plan => plan.supersedesPlanId === planId && plan.status === 'Draft');
    return {
      originalItems: original?.serviceItems.map(item => item.name) || [],
      revisionItems: revision?.serviceItems.map(item => item.name) || [],
      revisionItem: revision?.serviceItems.find(item => item.name === 'Paid social'),
      cycles: state.serviceCycles.filter(cycle => cycle.clientId === clientId),
    };
  }, seeded);
  expect(saved.originalItems).toEqual(['Design']);
  expect(saved.revisionItems).toEqual(['Design', 'Paid social']);
  expect(saved.revisionItem).toMatchObject({ quantity: 1, unitPriceMinor: 15000 });
  expect(saved.cycles).toEqual(seeded.cycles);

  await dialog.getByRole('button', { name: 'Review changes', exact: true }).click();
  await dialog.getByRole('button', { name: /^Schedule for/ }).click();
  await expect(dialog.getByText('Next month’s plan is scheduled.', { exact: true })).toBeVisible();

  const scheduled = await page.evaluate(async ({ planId, clientId }) => {
    const { useStore } = await import('/src/app/store/workspaceStore.ts');
    const state = useStore.getState();
    return {
      original: state.clientPlans.find(plan => plan.id === planId),
      revision: state.clientPlans.find(plan => plan.supersedesPlanId === planId),
      cycles: state.serviceCycles.filter(cycle => cycle.clientId === clientId),
    };
  }, seeded);
  expect(scheduled.original).toMatchObject({ name: seeded.originalName, status: 'Active' });
  expect(scheduled.original?.serviceItems.map(item => item.name)).toEqual(['Design']);
  expect(scheduled.revision).toMatchObject({ revisionScheduleStatus: 'scheduled' });
  expect(scheduled.revision?.serviceItems.map(item => item.name)).toEqual(['Design', 'Paid social']);
  expect(scheduled.cycles).toEqual(seeded.cycles);
});

test('Draft plans open directly while paused plans require resume first', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-15T04:00:00Z') });
  await seedBoss(page);
  const seeded = await page.evaluate(async () => {
    const { useStore } = await import('/src/app/store/workspaceStore.ts');
    const draft = useStore.getState().createClientWithPlan({
      clientName: 'Draft details company', planName: 'Draft scope', origin: 'custom',
      serviceItems: [{ id: 'draft-service', name: 'Design', platforms: [], unit: 'post', quantity: 1, unitPriceMinor: 10000 }],
      startDate: '2026-10-01', billingDay: 1, discountType: 'none', discountValue: 0, taxRateBps: 0,
    });
    if (!draft.ok) throw new Error(draft.error);
    const paused = useStore.getState().createClientWithPlan({
      clientName: 'Paused details company', planName: 'Paused scope', origin: 'custom',
      serviceItems: [{ id: 'paused-service', name: 'Design', platforms: [], unit: 'post', quantity: 1, unitPriceMinor: 10000 }],
      startDate: '2026-10-01', billingDay: 1, discountType: 'none', discountValue: 0, taxRateBps: 0,
    });
    if (!paused.ok) throw new Error(paused.error);
    useStore.getState().activateClientPlan(paused.planId!);
    useStore.getState().setClientPlanStatus(paused.planId!, 'Paused');
    return { draftClientId: draft.clientId!, draftPlanId: draft.planId!, pausedClientId: paused.clientId!, pausedPlanId: paused.planId! };
  });

  await page.goto(`/clients/${seeded.draftClientId}?tab=plan`);
  await page.getByRole('button', { name: 'Edit details', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Edit details' })).toBeVisible();
  expect(await page.evaluate(async id => {
    const { useStore } = await import('/src/app/store/workspaceStore.ts');
    const plans = useStore.getState().clientPlans.filter(plan => plan.id === id || plan.supersedesPlanId === id);
    return plans.length;
  }, seeded.draftPlanId)).toBe(1);
  await page.getByRole('button', { name: 'Close', exact: true }).click();

  await page.goto(`/clients/${seeded.pausedClientId}?tab=plan`);
  await expect(page.getByRole('button', { name: 'Edit details', exact: true })).toHaveCount(0);
});
