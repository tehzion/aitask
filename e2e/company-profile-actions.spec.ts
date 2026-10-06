import { expect, test, type Page } from '@playwright/test';

const companyName = 'QA Profile Company';

const seedCompany = async (page: Page) => {
  await page.goto('/login');
  return page.evaluate(async name => {
    const { useStore } = await import('/src/store/index.ts');
    const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
    const state = useStore.getState();
    const boss = state.users.find(user => user.isSuperAdmin)!;
    enablePasswordResetBypass(boss.id);
    const baseTask = state.tasks[0];
    localStorage.setItem(`aitask:release-notice:2026-08-service-operations:${boss.id}`, 'acknowledged');
    useStore.setState({
      currentUser: { ...boss, mustResetPassword: false },
      clients: [], projects: [], tasks: [], notifications: [], clientPlans: [], serviceCycles: [],
      deliverables: [], cycleComments: [], addons: [], servicePricingSnapshots: [],
      backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 },
    });
    const created = useStore.getState().createClientWithPlan({
      clientName: name, planName: 'QA Retainer', origin: 'custom',
      serviceItems: [{ id: 'qa-profile-design', name: 'Design', platforms: [], unit: 'post', quantity: 1, unitPriceMinor: 100 }],
      startDate: '2026-09-01', billingDay: 1, discountType: 'none', discountValue: 0, taxRateBps: 0,
    });
    if (!created.ok || !created.clientId || !created.planId) throw new Error('Could not create the company fixture');
    const activation = useStore.getState().activateClientPlan(created.planId);
    if (!activation.ok) throw new Error('Could not activate the service fixture');
    const keep = useStore.getState().createClientProfile({ clientName: 'QA Keep Company' });
    if (!keep.ok) throw new Error('Could not create the unrelated company fixture');
    useStore.setState({
      projects: [{ id: 'qa-profile-project', clientId: created.clientId, clientName: name, projectName: 'QA Campaign', serviceType: 'Design', serviceTypes: ['Design'], createdBy: boss.id, createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z' }],
      tasks: [{ ...baseTask, id: 'qa-profile-task', clientId: created.clientId, clientName: name, projectId: 'qa-profile-project', title: 'QA artwork', createdBy: boss.id, assignedTo: boss.id, comments: [], approvalHistory: [] }],
      notifications: [
        { id: 'qa-profile-notification', targetClient: name, title: 'Company update', message: 'Review company work.', route: { page: 'clients' }, isRead: false, createdAt: '2026-09-01T00:00:00Z', iconType: 'status' },
        { id: 'qa-keep-notification', targetClient: 'QA Keep Company', title: 'Keep company update', message: 'Unrelated company work.', route: { page: 'clients' }, isRead: false, createdAt: '2026-09-01T00:00:00Z', iconType: 'status' },
      ],
    });
    return { clientId: created.clientId, keepId: keep.id };
  }, companyName);
};

const openEditor = async (page: Page, desktop: boolean) => {
  if (desktop) {
    await page.getByRole('row').filter({ hasText: companyName }).getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Edit details', exact: true }).click();
  } else {
    await page.getByRole('button', { name: 'Details', exact: true }).click();
    await page.getByRole('dialog', { name: companyName }).getByRole('button', { name: 'Edit details', exact: true }).click();
  }
  const dialog = page.getByRole('dialog', { name: companyName });
  await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
  return dialog;
};

for (const desktop of [true, false]) {
  test(`${desktop ? 'desktop menu' : 'mobile details'} saves company info across reload and deletes its linked records`, async ({ page }, testInfo) => {
    const browserErrors: string[] = [];
    page.on('pageerror', error => browserErrors.push(error.message));
    await page.setViewportSize(desktop ? { width: 1600, height: 1000 } : { width: 390, height: 844 });
    const fixture = await seedCompany(page);
    await page.goto(`/projects?search=${encodeURIComponent(companyName)}`);
    const dialog = await openEditor(page, desktop);
    await dialog.locator('input[type="date"]').fill('2026-09-01');
    await dialog.getByPlaceholder('e.g. John Doe').fill('Alicia Tan');
    await dialog.getByPlaceholder('john@brand.com').fill('alicia@acme.example');
    await dialog.getByPlaceholder('Phone number', { exact: true }).fill('+60 12-345 6789');
    await dialog.getByPlaceholder('https://...', { exact: true }).fill('https://acme.example.com');
    await dialog.getByPlaceholder('Facebook URL', { exact: true }).fill('https://facebook.com/acme');
    await dialog.getByPlaceholder('Business address...').fill('88 Market Street');
    await dialog.getByPlaceholder('Notes about contact or client details...').fill('Call before visiting');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Edit details', exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Close client details' }).click();
    await page.reload();

    const reopened = await openEditor(page, desktop);
    await expect(reopened.locator('input[type="date"]')).toHaveValue('2026-09-01');
    await expect(reopened.getByPlaceholder('e.g. John Doe')).toHaveValue('Alicia Tan');
    await expect(reopened.getByPlaceholder('john@brand.com')).toHaveValue('alicia@acme.example');
    await expect(reopened.getByPlaceholder('Phone number', { exact: true })).toHaveValue('+60 12-345 6789');
    await expect(reopened.getByPlaceholder('https://...', { exact: true })).toHaveValue('https://acme.example.com/');
    await expect(reopened.getByPlaceholder('Facebook URL', { exact: true })).toHaveValue('https://facebook.com/acme');
    await expect(reopened.getByPlaceholder('Business address...')).toHaveValue('88 Market Street');
    await expect(reopened.getByPlaceholder('Notes about contact or client details...')).toHaveValue('Call before visiting');
    await reopened.getByRole('button', { name: 'Cancel', exact: true }).click();
    await reopened.getByRole('button', { name: 'Close client details' }).click();

    if (desktop) {
      await page.getByRole('row').filter({ hasText: companyName }).getByRole('button', { name: 'More actions' }).click();
      await expect(page.getByRole('menuitem', { name: 'Edit details', exact: true })).toBeVisible();
      await expect(page.getByRole('menuitem', { name: 'Delete company', exact: true })).toBeVisible();
      expect(await page.getByRole('menuitem', { name: 'Delete company', exact: true }).evaluate(element => {
        const bounds = element.getBoundingClientRect();
        const hit = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
        return bounds.bottom <= window.innerHeight && hit !== null && element.contains(hit);
      })).toBe(true);
      await page.screenshot({ path: testInfo.outputPath('company-actions.png') });
      await page.getByRole('menuitem', { name: 'Delete company', exact: true }).click();
    } else {
      await page.getByRole('button', { name: 'Details', exact: true }).click();
      await page.getByRole('dialog', { name: companyName }).getByRole('button', { name: 'Delete company', exact: true }).click();
    }
    const confirmation = page.getByRole('dialog', { name: companyName });
    await expect(confirmation.getByText(/This also removes linked tasks, projects, service plans and delivery records/)).toBeVisible();
    await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(confirmation.getByRole('button', { name: 'Edit details', exact: true })).toBeVisible();
    await confirmation.getByRole('button', { name: 'Delete company', exact: true }).click();
    await confirmation.getByRole('button', { name: 'Delete company', exact: true }).click();
    await expect(confirmation).toBeHidden();
    await page.reload();
    await expect(page.getByText('No companies found', { exact: true })).toBeVisible();

    const remaining = await page.evaluate(async id => {
      const { useStore } = await import('/src/store/index.ts');
      const state = useStore.getState();
      return {
        clients: state.clients.filter(item => item.id === id).length,
        projects: state.projects.filter(item => item.clientId === id).length,
        tasks: state.tasks.filter(item => item.clientId === id).length,
        plans: state.clientPlans.filter(item => item.clientId === id).length,
        cycles: state.serviceCycles.filter(item => item.clientId === id).length,
        deliverables: state.deliverables.filter(item => item.clientId === id).length,
        pricing: state.servicePricingSnapshots.filter(item => item.clientId === id).length,
        notifications: state.notifications.filter(item => item.targetClient === 'QA Profile Company').length,
        keepCompany: state.clients.some(item => item.clientName === 'QA Keep Company'),
        keepNotification: state.notifications.some(item => item.id === 'qa-keep-notification'),
      };
    }, fixture.clientId);
    expect(remaining).toEqual({ clients: 0, projects: 0, tasks: 0, plans: 0, cycles: 0, deliverables: 0, pricing: 0, notifications: 0, keepCompany: true, keepNotification: true });
    expect(browserErrors).toEqual([]);
  });
}

test('a rejected save keeps the company form open with the entered details and an error', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await seedCompany(page);
  await page.goto(`/projects?search=${encodeURIComponent(companyName)}`);
  const dialog = await openEditor(page, true);
  await dialog.getByPlaceholder('e.g. John Doe').fill('Unsaved contact');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ commitPendingMutation: async () => ({ ok: false, error: 'Supabase did not confirm this save.' }) });
  });
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Supabase did not confirm this save.');
  await expect(dialog.getByPlaceholder('e.g. John Doe')).toHaveValue('Unsaved contact');
  await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
});

test('the company menu stays reachable in a short viewport and supports keyboard dismissal', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 600 });
  await seedCompany(page);
  await page.goto(`/projects?search=${encodeURIComponent(companyName)}`);
  const trigger = page.getByRole('row').filter({ hasText: companyName }).getByRole('button', { name: 'More actions' });
  await trigger.click();
  const menu = page.getByRole('menu', { name: 'Client actions' });
  await expect(menu).toBeVisible();
  await page.keyboard.press('End');
  const deleteAction = page.getByRole('menuitem', { name: 'Delete company', exact: true });
  await expect(deleteAction).toBeFocused();
  expect(await deleteAction.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    const hit = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
    return bounds.top >= 0 && bounds.bottom <= window.innerHeight && hit !== null && element.contains(hit);
  })).toBe(true);
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('a linked client account does not recreate a deleted company in the Companies list', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await seedCompany(page);
  await page.evaluate(async name => {
    const { useStore } = await import('/src/store/index.ts');
    const state = useStore.getState();
    useStore.setState({ users: [...state.users, {
      id: 'qa-linked-client-account', name: 'QA Client Account', role: 'Client',
      department: 'Client', departments: ['Client'], companyName: name,
    }] });
  }, companyName);
  await page.goto(`/projects?search=${encodeURIComponent(companyName)}`);
  await page.getByRole('row').filter({ hasText: companyName }).getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Delete company', exact: true }).click();
  await page.getByRole('dialog', { name: companyName }).getByRole('button', { name: 'Delete company', exact: true }).click();
  await page.reload();
  await expect(page.getByText('No companies found', { exact: true })).toBeVisible();
});
