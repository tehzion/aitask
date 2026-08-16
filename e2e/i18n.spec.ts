import { expect, test } from '@playwright/test';

test('the interface can switch between English and Simplified Chinese and remembers the choice', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sign in to AiTask' })).toBeVisible();
  await expect(page.getByRole('button', { name: '切换为中文' })).toBeVisible();

  await page.getByRole('button', { name: '切换为中文' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.getByRole('heading', { name: '登录 AiTask' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Switch to English' })).toBeVisible();

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.getByRole('heading', { name: '登录 AiTask' })).toBeVisible();

  await page.getByRole('button', { name: 'Switch to English' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { name: 'Sign in to AiTask' })).toBeVisible();
});

test('user-authored task content stays exactly as typed in Chinese mode', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Use Admin Demo' }).click();
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Access Dashboard' }).click();
  await page.waitForURL(/\/(?:settings)?$/);
  const continueButton = page.getByRole('button', { name: 'Continue for now' });
  if (/\/settings$/.test(page.url())) {
    await expect(continueButton).toBeVisible();
    await continueButton.click();
  }

  // Seed a task whose title collides with UI dictionary keys, plus a client named "Settings".
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const state = useStore.getState();
    useStore.setState({
      clients: [...state.clients, {
        id: 'CL-i18n-probe', clientName: 'Settings', email: 'settings@example.com',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      }],
      tasks: [{
        id: 'T-i18n-probe', clientName: 'Settings', serviceType: 'Design', title: 'Dashboard',
        description: 'Due in two days.', department: 'Management',
        assignedTo: state.currentUser.id, createdBy: state.currentUser.id,
        startDate: '2026-08-01', dueDate: '2026-08-18', priority: 'Medium',
        status: 'Pending', completionPercentage: 0, isCompleted: false,
        revisionCount: 0, clientApprovalStatus: 'Pending', isRecurring: false,
        comments: [{ id: 'c-i18n', userId: state.currentUser.id, text: 'Due soon', createdAt: new Date().toISOString() }],
        approvalHistory: [],
      }],
    });
  });

  await page.goto('/tasks');
  const taskTitle = page.locator('main').getByText('Dashboard', { exact: true }).filter({ visible: true });
  await expect(taskTitle.first()).toBeVisible();
  await expect(page.locator('main').getByText(/T-i18n-probe - Settings/).filter({ visible: true }).first()).toBeVisible();

  // Switch to Chinese via the Navbar switcher.
  await page.getByRole('button', { name: '切换为中文' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');

  // UI chrome translates, user content does not.
  await expect(page.getByRole('heading', { name: '任务管理' })).toBeVisible();
  await expect(page.locator('main').getByText('Dashboard', { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.locator('main').getByText(/T-i18n-probe - Settings/).filter({ visible: true }).first()).toBeVisible();

  // Open the task modal: the comment "Due soon" must not be word-mangled.
  await taskTitle.first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText('Due soon')).toBeVisible();
  await expect(page.getByText('到期 soon')).toHaveCount(0);
  await page.keyboard.press('Escape');
});
