import { expect, test, type Page } from '@playwright/test';

const seedBoss = async (page: Page) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/login');
  await page.evaluate(async () => {
    localStorage.setItem('aitask:locale', 'en');
    const { useStore } = await import('/src/store/index.ts');
    const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
    const state = useStore.getState();
    const boss = state.users.find(user => user.isSuperAdmin)!;
    enablePasswordResetBypass(boss.id);
    localStorage.setItem(`aitask:release-notice:2026-08-service-operations:${boss.id}`, 'acknowledged');
    useStore.setState({ currentUser: { ...boss, mustResetPassword: false },
      registrations: [{ id: 'remaining-registration', name: 'Remaining Applicant', email: 'remaining@example.test', phone: '', jobPosition: 'Designer', requestedRole: 'Staff', status: 'Pending', createdAt: '2026-09-01T00:00:00Z' }],
      backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 } });
  });
};

test('approval rejection preserves a newer registration and unrelated new member', async ({ page }) => {
  await seedBoss(page);
  await page.goto('/approvals?registrationId=remaining-registration');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ commitPendingMutation: async () => {
      useStore.setState(state => ({ registrations: state.registrations.map(reg => ({ ...reg, phone: '+60129999999' })),
        users: [...state.users, { id: 'new-remote-member', name: 'New remote member', role: 'Staff', departments: ['Designer'] }] }));
      return { ok: false, error: 'Injected approval failure' };
    } });
  });
  await page.getByRole('button', { name: 'Confirm & approve', exact: true }).click();
  await expect.poll(() => page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    return { phone: useStore.getState().registrations[0].phone,
      newMember: useStore.getState().users.some(user => user.id === 'new-remote-member') };
  })).toEqual({ phone: '+60129999999', newMember: true });
});

test('role save exception leaves usable retry without a second role', async ({ page }) => {
  await seedBoss(page);
  await page.goto('/approvals?tab=roles');
  await page.getByPlaceholder('e.g. Account Manager').fill('Remaining Retry Role');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    let calls = 0;
    useStore.setState({ commitPendingMutation: async () => {
      if (++calls === 1) throw new Error('Injected role exception');
      return { ok: true };
    } });
  });
  await page.getByRole('button', { name: 'Create Role', exact: true }).click();
  await expect(page.getByText('Injected role exception', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Retry save', exact: true }).click();
  await expect(page.getByPlaceholder('e.g. Account Manager')).toHaveValue('');
  expect(await page.evaluate(async () => (await import('/src/store/index.ts')).useStore.getState().rolePermissions.filter(role => role.name === 'Remaining Retry Role').length)).toBe(1);
});

test('profile rejection preserves a newer canonical profile and submitted retry draft', async ({ page }) => {
  await seedBoss(page);
  await page.goto('/settings');
  await page.getByLabel('Name', { exact: true }).fill('Submitted profile name');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ commitPendingMutation: async () => {
      useStore.setState(state => ({ currentUser: { ...state.currentUser!, name: 'Newer canonical profile' },
        users: state.users.map(user => user.id === state.currentUser!.id ? { ...user, name: 'Newer canonical profile' } : user) }));
      return { ok: false, error: 'Injected profile failure' };
    } });
  });
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page.getByText('Injected profile failure', { exact: true })).toBeVisible();
  expect(await page.evaluate(async () => (await import('/src/store/index.ts')).useStore.getState().currentUser?.name)).toBe('Newer canonical profile');
  await expect(page.getByRole('button', { name: 'Retry save', exact: true })).toBeVisible();
});

test('profile save exception restores controls and retains the submitted draft', async ({ page }) => {
  await seedBoss(page);
  await page.goto('/settings');
  await page.getByLabel('Name', { exact: true }).fill('Recoverable profile');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ commitPendingMutation: async () => { throw new Error('Injected profile exception'); } });
  });
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page.getByText('Injected profile exception', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry save', exact: true })).toBeEnabled();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Recoverable profile');
});

test('status save exception retries one status and keeps newer input', async ({ page }) => {
  await seedBoss(page);
  await page.goto('/settings');
  const input = page.getByPlaceholder('e.g. Under QA, Draft');
  await input.fill('Remaining status');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    let calls = 0;
    useStore.setState({ commitPendingMutation: async () => {
      if (++calls === 1) throw new Error('Injected status exception');
      return { ok: true };
    } });
  });
  await page.getByRole('button', { name: 'Add Status', exact: true }).click();
  await expect(page.getByText('Injected status exception', { exact: true })).toBeVisible();
  await input.fill('Newer status draft');
  await page.getByRole('button', { name: 'Retry save', exact: true }).click();
  await expect(input).toHaveValue('Newer status draft');
  expect(await page.evaluate(async () => (await import('/src/store/index.ts')).useStore.getState().taskStatuses.filter(status => status === 'Remaining status').length)).toBe(1);
});
