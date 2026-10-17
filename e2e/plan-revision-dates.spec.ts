import { expect, test } from '@playwright/test';

for (const locale of ['en', 'zh']) test(`revision saves an inherited contract reminder before its effective date (${locale})`, async ({ page }) => {
  await page.addInitScript(value => localStorage.setItem('aitask:locale', value), locale);
  await page.clock.install({ time: new Date('2026-10-15T04:00:00Z') });
  await page.goto('/login');
  const seeded = await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
    const state = useStore.getState();
    const boss = state.users.find(user => user.isSuperAdmin)!;
    enablePasswordResetBypass(boss.id);
    localStorage.setItem(`aitask:release-notice:2026-08-service-operations:${boss.id}`, 'acknowledged');
    useStore.setState({ currentUser: { ...boss, mustResetPassword: false }, clients: [], projects: [], tasks: [],
      clientPlans: [], serviceCycles: [], deliverables: [], servicePricingSnapshots: [], addons: [],
      backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 },
    });
    const created = useStore.getState().createClientWithPlan({ clientName: 'Revision Feedback Co', planName: 'RM2250 PACKAGE', origin: 'custom',
      serviceItems: [{ id: 'fee', name: 'RM2250 PACKAGE', platforms: [], unit: 'month', quantity: 1, unitPriceMinor: 225000 }],
      startDate: '2026-09-30', billingDay: 30, discountType: 'none', discountValue: 0, taxRateBps: 800,
    });
    if (!created.ok) throw new Error(created.error);
    useStore.getState().updateDraftClientPlan(created.planId!, { contractEndDate: '2026-10-03' });
    useStore.getState().activateClientPlan(created.planId!);
    const revision = useStore.getState().createClientPlanRevision(created.planId!);
    if (!revision.ok) throw new Error(revision.error);
    return { clientId: created.clientId!, revisionId: revision.planId!, originalId: created.planId!, previousCycles: useStore.getState().serviceCycles };
  });
  await page.goto(`/clients/${seeded.clientId}`);
  await page.getByRole('tab', { name: locale === 'zh' ? '方案' : 'Plan', exact: true }).click();
  const revision = page.getByRole('region', { name: locale === 'zh' ? '下月方案' : 'Next month’s plan', exact: true });
  const date = revision.getByLabel(locale === 'zh' ? '合同结束日期（仅提醒）' : 'Contract end date (reminder only)');
  await expect(date).toHaveValue('2026-10-03');
  await expect(date).toHaveAttribute('min', '2026-09-30');
  await expect(revision).toContainText(locale === 'zh' ? '2026年10月30日' : '30 Oct 2026');
  await revision.getByLabel(locale === 'zh' ? '方案名称' : 'Plan name', { exact: true }).fill('Revised RM2250 PACKAGE');
  await revision.getByRole('button', { name: locale === 'zh' ? '保存草稿' : 'Save draft', exact: true }).click();
  await expect(revision.getByText(locale === 'zh' ? '草稿已保存。安排前请检查更改。' : 'Draft saved. Review the changes before scheduling.', { exact: true })).toBeVisible();

  await page.reload();
  await page.getByRole('tab', { name: locale === 'zh' ? '方案' : 'Plan', exact: true }).click();
  await expect(date).toHaveValue('2026-10-03');
  await expect(revision.getByLabel(locale === 'zh' ? '方案名称' : 'Plan name', { exact: true })).toHaveValue('Revised RM2250 PACKAGE');
  const saved = await page.evaluate(async ({ revisionId, originalId }) => {
    const state = (await import('/src/store/index.ts')).useStore.getState();
    return { revision: state.clientPlans.find(plan => plan.id === revisionId), original: state.clientPlans.find(plan => plan.id === originalId), cycles: state.serviceCycles };
  }, seeded);
  expect(saved.revision).toMatchObject({ startDate: '2026-10-30', contractEndDate: '2026-10-03', name: 'Revised RM2250 PACKAGE' });
  expect(saved.original).toMatchObject({ startDate: '2026-09-30', contractEndDate: '2026-10-03', name: 'RM2250 PACKAGE' });
  expect(saved.cycles).toEqual(seeded.previousCycles);

  await date.fill('2026-09-29');
  await revision.getByRole('button', { name: locale === 'zh' ? '保存草稿' : 'Save draft', exact: true }).click();
  expect(await date.evaluate(input => (input as HTMLInputElement).validity.rangeUnderflow)).toBe(true);
  expect(await page.evaluate(async id => (await import('/src/store/index.ts')).useStore.getState().clientPlans.find(plan => plan.id === id)?.contractEndDate, seeded.revisionId)).toBe('2026-10-03');
});
