import { expect, test } from '@playwright/test';

test.use({ timezoneId: 'Asia/Kuala_Lumpur' });

test('monthly plans roll over on their billing date and retain previous months after reload', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-08T04:00:00Z') });
  await page.goto('/login');
  // Let the app finish its startup load so seeded state is not overwritten.
  await page.waitForFunction(() => Boolean(document.querySelector('form input, main')));
  const clientId = await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const state = useStore.getState();
    const boss = state.users.find(user => user.isSuperAdmin)!;
    localStorage.setItem(`aitask:release-notice:2026-08-service-operations:${boss.id}`, 'acknowledged');
    useStore.setState({ currentUser: { ...boss, mustResetPassword: false }, clients: [], clientPlans: [], serviceCycles: [], deliverables: [], tasks: [], addons: [], servicePricingSnapshots: [],
      backend: { ...state.backend, mode: 'local', status: 'local', isLoading: false, hasLocalChanges: false, pendingMutations: 0 } });
    const created = useStore.getState().createClientWithPlan({
      clientName: 'Monthly Update Co', planName: 'Video and Ads Management', origin: 'custom',
      serviceItems: [{ id: 'monthly-management', name: 'Ads Management Fee', platforms: ['Meta'], unit: 'month', quantity: 1, unitPriceMinor: 225000 }],
      startDate: '2026-09-09', billingDay: 9, discountType: 'none', discountValue: 0, taxRateBps: 0,
    });
    if (!created.ok) throw new Error(created.error);
    const activated = useStore.getState().activateClientPlan(created.planId!);
    if (!activated.ok) throw new Error(activated.error);
    useStore.getState().setServiceCycleStatus(activated.cycleId!, 'Published');
    useStore.getState().updateDeliverableStatus(useStore.getState().deliverables[0].id, 'Delivered');
    return created.clientId!;
  });
  await page.goto(`/clients/${clientId}`);
  await page.getByRole('tab', { name: 'Plan', exact: true }).click();
  const schedule = page.getByRole('region', { name: 'Monthly update schedule' });
  await expect(schedule.getByText('Day 9', { exact: true })).toBeVisible();
  await expect(schedule.getByText('9 Oct 2026', { exact: true })).toBeVisible();

  await page.clock.setFixedTime(new Date('2026-10-09T04:00:00Z'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(schedule.getByText('9 Oct 2026 – 8 Nov 2026', { exact: true })).toBeVisible();
  await expect(schedule.getByText('9 Nov 2026', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Cycles', exact: true }).click();
  await expect(page.getByRole('heading', { name: '2026-10-09 – 2026-11-08', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Deliverable status: Ads Management Fee 1' }).first()).toHaveValue('Planned');
  // The prior month remains retained and selectable from the billing-period picker.
  await expect(page.getByRole('combobox', { name: 'Billing period' }).locator('option', { hasText: 'September 2026' })).toHaveCount(1);

  await page.reload();
  await page.getByRole('tab', { name: 'Plan', exact: true }).click();
  await expect(schedule.getByText('9 Nov 2026', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit plan dates', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Monthly billing day', exact: true }).fill('20');
  await expect(page.getByText('Transition cycle').locator('..')).toContainText('2026-11-09 – 2026-11-19');
  await page.getByRole('button', { name: 'Save dates', exact: true }).click();
  await expect(schedule.getByText('Day 20', { exact: true })).toBeVisible();
  await expect(schedule.getByText('9 Oct 2026 – 8 Nov 2026', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'tmp/monthly-update-desktop.png', fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('tab', { name: 'Plan', exact: true }).click();
  await expect(schedule).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'tmp/monthly-update-mobile.png', fullPage: true, animations: 'disabled' });
  expect(await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    return useStore.getState().serviceCycles.length;
  })).toBe(2);
});
