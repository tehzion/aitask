import { expect, test, type Page } from '@playwright/test';

const seed = async (page: Page) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/login');
  return page.evaluate(async () => {
    localStorage.setItem('aitask:locale', 'en');
    const { useStore } = await import('/src/store/index.ts');
    const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
    const state = useStore.getState();
    const boss = state.users.find(user => user.isSuperAdmin)!;
    enablePasswordResetBypass(boss.id);
    localStorage.setItem(`aitask:release-notice:2026-08-service-operations:${boss.id}`, 'acknowledged');
    useStore.setState({ currentUser: { ...boss, mustResetPassword: false }, clients: [], projects: [], tasks: [],
      clientPlans: [], serviceCycles: [], deliverables: [], addons: [],
      backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 } });
    const result = useStore.getState().createClientWithPlan({ clientName: 'Creation QA Company', planName: 'QA plan', origin: 'custom',
      serviceItems: [{ id: 'creation-design', name: 'Design', platforms: [], unit: 'post', quantity: 1, unitPriceMinor: 100 }],
      startDate: '2026-10-01', billingDay: 1, contractEndDate: '2027-10-01', discountType: 'none', discountValue: 0, taxRateBps: 0 });
    const activation = useStore.getState().activateClientPlan(result.planId!);
    useStore.setState({ projects: [{ id: 'creation-project', clientId: result.clientId, clientName: 'Creation QA Company', projectName: 'QA Campaign', serviceType: 'Design', serviceTypes: ['Design'], createdBy: boss.id, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z' }] });
    return { clientId: result.clientId!, cycleId: activation.cycleId! };
  });
};

const openTask = async (page: Page) => {
  await page.goto('/tasks');
  await page.getByRole('button', { name: 'New task', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Create task', exact: true });
  await dialog.getByLabel(/Link to Company \/ Brand/).selectOption('creation-project');
  await dialog.getByLabel('Task Title').fill('Recoverable creation');
  await dialog.getByLabel(/Assign to Position\/Department/).selectOption('Designer');
  return dialog;
};

test('task creation exception retries the staged task without creating a duplicate', async ({ page }) => {
  await seed(page);
  const dialog = await openTask(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    let calls = 0;
    useStore.setState({ retryPendingSave: async () => {
      if (++calls === 1) throw new Error('Injected task creation exception');
      return { ok: true };
    } });
  });
  await dialog.getByRole('button', { name: 'Create & open task' }).click();
  await expect(dialog.getByText('Injected task creation exception', { exact: true })).toBeVisible();
  await expect(dialog.getByLabel('Task Title')).toBeDisabled();
  await dialog.getByRole('button', { name: 'Retry saving task', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(await page.evaluate(async () => (await import('/src/store/index.ts')).useStore.getState().tasks.filter(task => task.title === 'Recoverable creation').length)).toBe(1);
});

test('discarded task creation keeps its draft and avoids opening an absent task', async ({ page }) => {
  await seed(page);
  const dialog = await openTask(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ retryPendingSave: async () => ({ ok: false, error: 'Injected uncertain task creation' }) });
  });
  await dialog.getByRole('button', { name: 'Create & open task' }).click();
  await expect(dialog.getByText('Injected uncertain task creation')).toBeVisible();
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ tasks: [], retryPendingSave: async () => ({ ok: true }) });
  });
  await dialog.getByRole('button', { name: 'Retry saving task' }).click();
  await expect(dialog.getByText('The pending task creation is no longer available. Review your draft before saving again.')).toBeVisible();
  await expect(dialog.getByLabel('Task Title')).toHaveValue('Recoverable creation');
  await expect(dialog.getByLabel('Task Title')).toBeEnabled();
  await expect(page).toHaveURL(/\/tasks$/);
});

test('add-on creation exception locks its submitted draft and retries one record', async ({ page }) => {
  const fixture = await seed(page);
  await page.goto(`/clients/${fixture.clientId}`);
  await page.getByRole('tab', { name: 'Add-ons', exact: true }).click();
  await page.getByRole('button', { name: 'Add service add-on' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add service add-on' });
  await dialog.getByLabel('Add-on name').fill('Recoverable add-on');
  await dialog.getByLabel('Service cycle').selectOption(fixture.cycleId);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    let calls = 0;
    useStore.setState({ commitPendingMutation: async () => {
      if (++calls === 1) throw new Error('Injected add-on exception');
      return { ok: true };
    } });
  });
  await dialog.getByRole('button', { name: 'Add add-on', exact: true }).click();
  await expect(dialog.getByText('Injected add-on exception')).toBeVisible();
  await expect(dialog.getByLabel('Add-on name')).toBeDisabled();
  await dialog.getByRole('button', { name: 'Retry save', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(await page.evaluate(async () => (await import('/src/store/index.ts')).useStore.getState().addons.filter(addon => addon.name === 'Recoverable add-on').length)).toBe(1);
});

test('discarded add-on creation retains its draft with review feedback', async ({ page }) => {
  const fixture = await seed(page);
  await page.goto(`/clients/${fixture.clientId}`);
  await page.getByRole('tab', { name: 'Add-ons', exact: true }).click();
  await page.getByRole('button', { name: 'Add service add-on' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add service add-on' });
  await dialog.getByLabel('Add-on name').fill('Discarded add-on');
  await dialog.getByLabel('Service cycle').selectOption(fixture.cycleId);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ commitPendingMutation: async () => ({ ok: false, error: 'Injected uncertain add-on' }) });
  });
  await dialog.getByRole('button', { name: 'Add add-on', exact: true }).click();
  await expect(dialog.getByText('Injected uncertain add-on')).toBeVisible();
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ addons: [], commitPendingMutation: async () => ({ ok: true }) });
  });
  await dialog.getByRole('button', { name: 'Retry save', exact: true }).click();
  await expect(dialog.getByText('The pending add-on is no longer available. Review your draft before saving again.')).toBeVisible();
  await expect(dialog.getByLabel('Add-on name')).toHaveValue('Discarded add-on');
  await expect(dialog.getByLabel('Add-on name')).toBeEnabled();
});
