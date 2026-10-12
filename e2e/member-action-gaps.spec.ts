import { expect, test, type Page } from '@playwright/test';

const seed = async (page: Page) => {
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
    useStore.setState({ currentUser: { ...boss, mustResetPassword: false }, users: [boss,
      { id: 'member-gap-staff', name: 'Member gap Staff', role: 'Staff', departments: ['Designer'], department: 'Designer' }],
      backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 } });
  });
};

test('member creation cannot close during saving and retries one account after an exception', async ({ page }) => {
  await seed(page);
  await page.goto('/approvals?tab=members');
  await page.getByRole('button', { name: 'Add Member', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add new member' });
  await dialog.getByRole('textbox').first().fill('Retry member QA');
  await dialog.getByLabel('Designer', { exact: true }).check();
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    let calls = 0;
    useStore.setState({ commitPendingMutation: () => {
      if (++calls > 1) return Promise.resolve({ ok: true });
      return new Promise((_, reject) => { (window as unknown as { rejectMember: () => void }).rejectMember = () => reject(new Error('Injected member exception')); });
    } });
  });
  await dialog.getByRole('button', { name: 'Create member', exact: true }).click();
  await expect.poll(() => page.evaluate(() => typeof (window as unknown as { rejectMember?: () => void }).rejectMember)).toBe('function');
  await expect(dialog.getByRole('button', { name: 'Creating account...', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await page.evaluate(() => (window as unknown as { rejectMember: () => void }).rejectMember());
  await expect(dialog.getByText('Injected member exception')).toBeVisible();
  await expect(dialog.getByRole('textbox').first()).toBeDisabled();
  await dialog.getByRole('button', { name: /Retry save|Create member/, exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(await page.evaluate(async () => (await import('/src/store/index.ts')).useStore.getState().users.filter(user => user.name === 'Retry member QA').length)).toBe(1);
});

test('department submission locks its choices and recovers an exception', async ({ page }) => {
  await seed(page);
  await page.goto('/approvals?tab=members');
  await page.getByRole('row').filter({ hasText: 'Member gap Staff' }).getByRole('button', { name: 'Edit departments', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit departments' });
  await dialog.getByLabel('Video Editor', { exact: true }).check();
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ updateMemberDepartments: () => new Promise((_, reject) => {
      (window as unknown as { rejectDepartments: () => void }).rejectDepartments = () => reject(new Error('Injected departments exception'));
    }) });
  });
  await dialog.getByRole('button', { name: 'Save departments', exact: true }).click();
  await expect(dialog.getByLabel('Video Editor', { exact: true })).toBeDisabled();
  await page.evaluate(() => (window as unknown as { rejectDepartments: () => void }).rejectDepartments());
  await expect(dialog.getByText('Injected departments exception')).toBeVisible();
  await expect(dialog.getByLabel('Video Editor', { exact: true })).toBeChecked();
  await expect(dialog.getByRole('button', { name: 'Save departments', exact: true })).toBeEnabled();
});

test('permission submission locks its choices and restores controls after an exception', async ({ page }) => {
  await seed(page);
  await page.goto('/approvals?tab=members');
  await page.getByRole('row').filter({ hasText: 'Member gap Staff' }).getByRole('button', { name: 'Manage permissions', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /Manage access for/ });
  await dialog.getByRole('button', { name: /Custom access/ }).click();
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ updateMemberPermissions: () => new Promise((_, reject) => {
      (window as unknown as { rejectPermissions: () => void }).rejectPermissions = () => reject(new Error('Injected permissions exception'));
    }) });
  });
  await dialog.getByRole('button', { name: 'Save custom access', exact: true }).click();
  await expect(dialog.getByRole('button', { name: /Use role defaults/ })).toBeDisabled();
  await expect(dialog.getByRole('checkbox').first()).toBeDisabled();
  await page.evaluate(() => (window as unknown as { rejectPermissions: () => void }).rejectPermissions());
  await expect(dialog.getByText('Injected permissions exception')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Save custom access', exact: true })).toBeEnabled();
});
