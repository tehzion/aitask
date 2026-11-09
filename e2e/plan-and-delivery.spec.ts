import { expect, test } from '@playwright/test';

// Team feedback (9 Nov 2026): one "Plan & delivery" tab, one Activate action
// that also publishes a month that is already due, and internal special notes.

const seedDraftPlan = async (page: import('@playwright/test').Page, startDate: string) => {
  await page.goto('/login');
  // Let the app finish its startup load so seeded state is not overwritten.
  await page.waitForFunction(() => Boolean(document.querySelector('form input, main')));
  return page.evaluate(async start => {
    const { useStore } = await import('/src/store/index.ts');
    const state = useStore.getState();
    const boss = state.users.find(user => user.isSuperAdmin)!;
    localStorage.setItem(`aitask:release-notice:2026-08-service-operations:${boss.id}`, 'acknowledged');
    useStore.setState({
      currentUser: { ...boss, mustResetPassword: false },
      clients: [], clientPlans: [], serviceCycles: [], deliverables: [], tasks: [], addons: [],
      backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 },
    });
    const created = useStore.getState().createClientWithPlan({
      clientName: 'Notes Co', planName: 'Notes Plan', origin: 'custom',
      serviceItems: [{ id: 'posts', name: 'Social Posts', platforms: ['Instagram'], unit: 'post', quantity: 2, unitPriceMinor: 10000 }],
      startDate: start, billingDay: 1, discountType: 'none', discountValue: 0, taxRateBps: 0,
    });
    if (!created.ok) throw new Error(created.error);
    return created.clientId!;
  }, startDate);
};

const monthStart = (offsetMonths = 0) => {
  const today = new Date();
  const date = new Date(today.getFullYear(), today.getMonth() + offsetMonths, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
};

test('a plan that starts this month is activated and published in one confirmed step', async ({ page }) => {
  const clientId = await seedDraftPlan(page, monthStart());
  await page.goto(`/clients/${clientId}?tab=plan`);
  await expect(page.getByRole('tab', { name: 'Plan & delivery', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tablist', { name: 'Client workspace' }).getByRole('tab')).toHaveCount(2);

  await page.getByRole('button', { name: 'Activate & publish this month' }).click();
  const dialog = page.getByRole('dialog', { name: 'Activate & publish this month' });
  await expect(dialog.getByText('Social Posts', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Activate & publish', exact: true }).click();
  await expect(dialog).toHaveCount(0);

  const state = await page.evaluate(async id => {
    const { useStore } = await import('/src/store/index.ts');
    const store = useStore.getState();
    return { plans: store.clientPlans.filter(plan => plan.clientId === id).map(plan => plan.status), cycles: store.serviceCycles.filter(cycle => cycle.clientId === id).map(cycle => cycle.status) };
  }, clientId);
  expect(state.plans).toEqual(['Active']);
  expect(state.cycles).toEqual(['Published']);
  await expect(page.getByRole('button', { name: /Activate/ })).toHaveCount(0);
});

test('a plan that starts next month is only activated; its month is published later', async ({ page }) => {
  const clientId = await seedDraftPlan(page, monthStart(1));
  await page.goto(`/clients/${clientId}`);
  await expect(page.getByRole('button', { name: 'Activate & publish this month' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Activate plan', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Activate plan' });
  await dialog.getByRole('button', { name: 'Activate plan', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const cycles = await page.evaluate(async id => {
    const { useStore } = await import('/src/store/index.ts');
    return useStore.getState().serviceCycles.filter(cycle => cycle.clientId === id).map(cycle => cycle.status);
  }, clientId);
  expect(cycles).toEqual(['Draft']);
});

test('special notes are saved on the client and the extra-requests block is gone', async ({ page }) => {
  const clientId = await seedDraftPlan(page, monthStart());
  await page.goto(`/clients/${clientId}`);
  const notes = page.getByRole('region', { name: 'Special notes' });
  await expect(notes.getByText('No special notes yet.')).toBeVisible();
  await notes.getByRole('button', { name: 'Add notes' }).click();
  await notes.getByLabel('Special notes').fill('Prefers WhatsApp. No posting on Fridays.');
  await notes.getByRole('button', { name: 'Save notes' }).click();
  await expect(notes.getByText('Prefers WhatsApp. No posting on Fridays.')).toBeVisible();
  const saved = await page.evaluate(async id => (await import('/src/store/index.ts')).useStore.getState().clients.find(client => client.id === id)?.notes, clientId);
  expect(saved).toBe('Prefers WhatsApp. No posting on Fridays.');
  await expect(page.getByText('Extra requests this month')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Log extra request' })).toHaveCount(0);
});
