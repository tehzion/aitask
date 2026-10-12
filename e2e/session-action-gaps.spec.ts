import { expect, test, type Page } from '@playwright/test';

const seedBoss = async (page: Page) => {
  await page.goto('/login');
  await page.evaluate(async () => {
    localStorage.setItem('aitask:locale', 'en');
    const { useStore } = await import('/src/store/index.ts');
    const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
    const state = useStore.getState();
    const boss = state.users.find(user => user.isSuperAdmin)!;
    enablePasswordResetBypass(boss.id);
    localStorage.setItem(`aitask:release-notice:2026-08-service-operations:${boss.id}`, 'acknowledged');
    useStore.setState({ currentUser: { ...boss, mustResetPassword: false }, backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 } });
  });
};

test('an old role response cannot clear another account’s in-flight role draft', async ({ page }) => {
  await seedBoss(page);
  await page.goto('/approvals?tab=roles');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const finish: Array<() => void> = [];
    (window as unknown as { finishRoles: Array<() => void> }).finishRoles = finish;
    useStore.setState({ commitPendingMutation: () => new Promise(resolve => finish.push(() => resolve({ ok: true }))) });
  });
  const name = page.getByPlaceholder('e.g. Account Manager');
  await name.fill('First account role');
  await page.getByRole('button', { name: 'Create Role', exact: true }).click();
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
    enablePasswordResetBypass('another-role-account');
    localStorage.setItem('aitask:release-notice:2026-08-service-operations:another-role-account', 'acknowledged');
    useStore.setState(state => ({ currentUser: { ...state.currentUser!, id: 'another-role-account', mustResetPassword: false } }));
  });
  await expect(name).toHaveValue('');
  await name.fill('Another account role');
  await page.getByRole('button', { name: 'Create Role', exact: true }).click();
  await expect(name).toBeDisabled();
  await page.evaluate(() => (window as unknown as { finishRoles: Array<() => void> }).finishRoles[0]());
  await expect(name).toHaveValue('Another account role');
  await expect(name).toBeDisabled();
  await page.evaluate(() => (window as unknown as { finishRoles: Array<() => void> }).finishRoles[1]());
  await expect(name).toHaveValue('');
  await expect(name).toBeEnabled();
});

test('password exception retains fields and releases its save control', async ({ page }) => {
  await seedBoss(page);
  await page.goto('/settings');
  await page.getByLabel('Current Password', { exact: true }).fill('Password123!');
  await page.getByLabel('New Password', { exact: true }).fill('NextPassword123!');
  await page.getByLabel('Confirm Password', { exact: true }).fill('NextPassword123!');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ updateCurrentUserPassword: async () => { throw new Error('Injected password exception'); } });
  });
  await page.getByRole('button', { name: 'Update password', exact: true }).click();
  await expect(page.getByText('Injected password exception')).toBeVisible();
  await expect(page.getByLabel('New Password', { exact: true })).toHaveValue('NextPassword123!');
  await expect(page.getByRole('button', { name: 'Update password', exact: true })).toBeEnabled();
});

test('discarded status creation keeps its newer draft and shows review feedback', async ({ page }) => {
  await seedBoss(page);
  await page.goto('/settings');
  const input = page.getByPlaceholder('e.g. Under QA, Draft');
  await input.fill('Discarded status');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ commitPendingMutation: async () => ({ ok: false, error: 'Injected uncertain status' }) });
  });
  await page.getByRole('button', { name: 'Add Status', exact: true }).click();
  await expect(page.getByText('Injected uncertain status')).toBeVisible();
  await input.fill('Next status draft');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState(state => ({ taskStatuses: state.taskStatuses.filter(status => status !== 'Discarded status'), commitPendingMutation: async () => ({ ok: true }) }));
  });
  await page.getByRole('button', { name: 'Retry save', exact: true }).click();
  await expect(page.getByText('The pending status change is no longer available. Review your draft before saving again.')).toBeVisible();
  await expect(input).toHaveValue('Next status draft');
});
