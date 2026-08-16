import { expect, test, type Page } from '@playwright/test';

const seedAdminAndPackage = async (page: Page) => {
  await page.goto('/login');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const state = useStore.getState();
    const boss = state.users.find(user => user.isSuperAdmin)!;
    useStore.setState({
      currentUser: { ...boss, mustResetPassword: false },
      clients: [],
      clientPlans: [],
      serviceCycles: [],
      deliverables: [],
      cycleComments: [],
      addons: [],
      servicePricingSnapshots: [],
      servicePackages: [{
        id: 'PKG-growth-e2e',
        name: 'Growth Plan',
        description: 'Stable E2E package',
        revision: 3,
        currency: 'MYR',
        serviceItems: [{ id: 'SI-video-e2e', name: 'Short Video', platforms: ['TikTok'], unit: 'video', quantity: 1, unitPriceMinor: 25000 }],
        discountType: 'none',
        discountValue: 0,
        taxRateBps: 0,
        isActive: true,
        createdAt: '2026-08-15T00:00:00.000Z',
        updatedAt: '2026-08-15T00:00:00.000Z',
      }],
      backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 },
    });
  });
};

test('keyboard completes standard, duplicated and fully custom client creation', async ({ page }) => {
  test.setTimeout(120_000);
  await seedAdminAndPackage(page);

  const cases = [
    { name: 'Keyboard Standard Co', mode: 'Use standard package', origin: 'standard', quantity: 1 },
    { name: 'Keyboard Duplicate Co', mode: 'Duplicate as Custom Plan', origin: 'customized', quantity: 2 },
    { name: 'Keyboard Custom Co', mode: 'Fully custom', origin: 'custom', quantity: 3 },
  ] as const;

  for (const [index, item] of cases.entries()) {
    await page.goto('/clients');
    const newClient = page.getByRole('button', { name: 'New client' });
    await expect(newClient).toBeVisible();
    await newClient.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Create client and service plan' });
    await expect(dialog).toBeVisible();

    await dialog.getByLabel('Client / company name *').fill(item.name);
    await dialog.getByLabel('Email').fill(index === 0 ? 'invalid-email' : `client${index}@example.com`);
    await dialog.getByLabel('Website').fill('https://example.com');
    await dialog.getByRole('button', { name: 'Continue' }).focus();
    await page.keyboard.press('Enter');
    if (index === 0) {
      await expect(dialog.getByRole('alert')).toContainText('valid email');
      await dialog.getByLabel('Email').fill('standard@example.com');
      await dialog.getByRole('button', { name: 'Continue' }).focus();
      await page.keyboard.press('Enter');
    }

    const mode = dialog.getByRole('button', { name: new RegExp(`^${item.mode}`) });
    await mode.focus();
    await page.keyboard.press('Enter');
    await expect(mode).toHaveAttribute('aria-pressed', 'true');
    await dialog.getByRole('button', { name: 'Continue' }).focus();
    await page.keyboard.press('Enter');

    if (item.origin === 'custom') {
      await dialog.getByLabel('Service name').fill('Custom Content');
      await dialog.getByLabel('Unit').fill('asset');
    }
    if (item.origin !== 'standard') {
      await dialog.getByLabel('Quantity').fill(String(item.quantity));
      await dialog.getByLabel('Price').fill(item.origin === 'customized' ? '320' : '180');
    }
    await dialog.getByRole('button', { name: 'Continue' }).focus();
    await page.keyboard.press('Enter');

    await dialog.getByLabel('Monthly billing day').fill('31');
    await dialog.getByLabel('Contract end date (reminder only)').fill('2027-08-15');
    await dialog.getByRole('button', { name: 'Continue' }).focus();
    await page.keyboard.press('Enter');
    await expect(dialog.getByText(/Ready to save as Draft/)).toBeVisible();

    const save = dialog.getByRole('button', { name: 'Save draft plan' });
    await save.focus();
    await page.keyboard.press('Enter');
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/clients\/CL-/);
    await expect(page.getByRole('heading', { name: item.name })).toBeVisible();

    const saved = await page.evaluate(async clientName => {
      const { useStore } = await import('/src/store/index.ts');
      const plan = useStore.getState().clientPlans.find(candidate => candidate.clientName === clientName);
      return plan ? { origin: plan.origin, quantity: plan.serviceItems[0]?.quantity, billingDay: plan.billingDay } : null;
    }, item.name);
    expect(saved).toEqual({ origin: item.origin, quantity: item.quantity, billingDay: 31 });
  }
});
