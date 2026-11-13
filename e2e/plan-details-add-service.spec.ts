import { expect, test } from '@playwright/test';

for (const locale of ['en', 'zh'] as const) test(`plan details adds a service through one revision editor (${locale})`, async ({ page }) => {
  const zh = locale === 'zh';
  await page.addInitScript(value => localStorage.setItem('aitask:locale', value), locale);
  await page.clock.install({ time: new Date('2026-10-15T04:00:00Z') });
  await page.goto('/login');
  const seeded = await page.evaluate(async () => {
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

  await page.goto(`/clients/${seeded.clientId}`);
  await page.getByRole('tab', { name: zh ? '方案与交付' : 'Plan & delivery', exact: true }).click();
  await page.getByRole('button', { name: zh ? '编辑详情' : 'Edit details', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: zh ? '编辑详情' : 'Edit details' });
  await expect(dialog).toBeVisible();
  await expect(page.locator('#next-month-plan')).toHaveCount(1);

  await dialog.getByRole('button', { name: zh ? '添加服务' : 'Add service', exact: true }).click();
  await dialog.getByLabel(zh ? '服务名称' : 'Service name', { exact: true }).last().fill('Paid social');
  await dialog.getByLabel(zh ? '单价（马币）' : 'Unit price (MYR)', { exact: true }).last().fill('150');
  await dialog.getByRole('button', { name: zh ? '保存草稿' : 'Save draft', exact: true }).click();
  await expect(dialog.getByText(zh ? '草稿已保存。安排前请检查更改。' : 'Draft saved. Review the changes before scheduling.', { exact: true })).toBeVisible();

  const saved = await page.evaluate(async ({ planId, clientId }) => {
    const { useStore } = await import('/src/store/index.ts');
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

  await dialog.getByRole('button', { name: zh ? '查看更改' : 'Review changes', exact: true }).click();
  await dialog.getByRole('button', { name: new RegExp(`^${zh ? '安排于' : 'Schedule for'}`) }).click();
  await expect(dialog.getByText(zh ? '下月方案已排定。' : 'Next month’s plan is scheduled.', { exact: true })).toBeVisible();
  await expect(page.locator('#next-month-plan')).toHaveCount(1);
  await dialog.getByRole('button', { name: zh ? '关闭' : 'Close', exact: true }).click();

  const scheduled = await page.evaluate(async ({ planId, clientId }) => {
    const { useStore } = await import('/src/store/index.ts');
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
