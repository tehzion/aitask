import { expect, test, type Page } from '@playwright/test';

const seedPlan = async (page: Page) => {
  await page.goto('/login');
  const fixture = await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
    const state = useStore.getState();
    const boss = state.users.find(user => user.isSuperAdmin)!;
    enablePasswordResetBypass(boss.id);
    localStorage.setItem(`aitask:release-notice:2026-10-project-workflows:${boss.id}`, 'acknowledged');
    localStorage.setItem(`aitask:release-notice:2026-11-start-wording:${boss.id}`, 'acknowledged');
    useStore.setState({
      currentUser: { ...boss, mustResetPassword: false },
      clients: [], clientPlans: [], tasks: [], projects: [], serviceCycles: [], serviceCyclePayments: [],
      servicePricingSnapshots: [], deliverables: [], addons: [],
      backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 },
    });
    const created = useStore.getState().createClientWithPlan({
      clientName: 'Payment recovery company', planName: 'Monthly design', origin: 'custom',
      serviceItems: [{ id: 'fee', name: 'Design', platforms: [], unit: 'month', quantity: 1, unitPriceMinor: 10000 }],
      startDate: '2026-09-01', billingDay: 1, discountType: 'none', discountValue: 0, taxRateBps: 0,
    });
    if (!created.ok) throw new Error(created.error);
    const activated = useStore.getState().activateClientPlan(created.planId!);
    if (!activated.ok) throw new Error(activated.error);
    useStore.getState().generateDueLocalServiceCycles();
    return { clientId: created.clientId! };
  });
  await page.goto(`/clients/${fixture.clientId}`);
  await page.getByRole('tab', { name: 'Plan & delivery', exact: true }).click();
  const schedule = page.getByRole('region', { name: 'Monthly update schedule' });
  await expect(schedule).toBeVisible();
  await schedule.getByRole('button', { name: 'Half payment', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Payment records' });
  await expect(dialog).toBeVisible();
  return { ...fixture, schedule, dialog };
};

test('a transient payment save can be retried without duplicating the receipt', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-15T04:00:00Z') });
  const { dialog } = await seedPlan(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({
      commitPendingMutation: async () => {
        useStore.setState(state => ({ backend: { ...state.backend, status: 'retry_required', hasLocalChanges: true, pendingMutations: 1, error: 'Payment save timed out.' } }));
        return { ok: false, code: 'RETRY_REQUIRED', error: 'Payment save timed out.' };
      },
      retryPendingSave: async () => {
        useStore.setState(state => ({ backend: { ...state.backend, status: 'live', error: undefined, errorCode: undefined, hasLocalChanges: false, pendingMutations: 0 } }));
        return { ok: true };
      },
    });
  });

  await dialog.getByRole('button', { name: 'Record payment', exact: true }).click();
  await expect(dialog).toContainText('Payment save timed out.');
  await dialog.getByRole('button', { name: 'Retry my changes', exact: true }).click();
  await expect.poll(() => page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    return useStore.getState().serviceCyclePayments.filter(item => !item.voidedAt).length;
  })).toBe(1);
  await expect(dialog.getByRole('button', { name: 'Retry my changes', exact: true })).toHaveCount(0);
});

test('a rejected payment offers restore instead of an endless retry', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-15T04:00:00Z') });
  const { dialog } = await seedPlan(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({
      commitPendingMutation: async () => {
        useStore.setState(state => ({ backend: { ...state.backend, status: 'refresh_required', errorCode: 'FORBIDDEN', error: 'Payment access was revoked.', hasLocalChanges: true, pendingMutations: 1 } }));
        return { ok: false, code: 'FORBIDDEN', error: 'Payment access was revoked.' };
      },
      discardMutation: async () => {
        useStore.setState(state => ({ serviceCyclePayments: [], backend: { ...state.backend, status: 'live', error: undefined, errorCode: undefined, hasLocalChanges: false, pendingMutations: 0 } }));
      },
    });
  });

  await dialog.getByRole('button', { name: 'Record payment', exact: true }).click();
  await expect(dialog).toContainText('Payment access was revoked.');
  await expect(dialog.getByRole('button', { name: 'Retry my changes', exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Restore saved data', exact: true }).click();
  await expect.poll(() => page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    return useStore.getState().serviceCyclePayments.length;
  })).toBe(0);
  await expect(dialog.getByRole('button', { name: 'Record payment', exact: true })).toBeEnabled();
});
