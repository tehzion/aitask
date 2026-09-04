import { expect, test } from '@playwright/test';

test('Account reports include assigned work and exclude other departments', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email or username').fill('Account Demo');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Access Dashboard' }).click();
  await page.waitForURL(url => !/\/login$/.test(url.pathname));
  const releaseNotice = page.getByRole('button', { name: 'Happy working' });
  await releaseNotice.waitFor({ state: 'visible', timeout: 3_000 }).catch(() => undefined);
  if (await releaseNotice.isVisible().catch(() => false)) await releaseNotice.click();

  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const state = useStore.getState();
    const account = state.users.find(user => user.name === 'Account Demo');
    const production = state.users.find(user => user.name === 'Staff Demo');
    if (!account || !production) throw new Error('Expected Account and Staff demo users');
    const common = {
      clientName: 'Report QA Client',
      projectName: 'Report QA Project',
      serviceType: 'Reporting',
      description: 'Deterministic report scope test.',
      createdBy: 'u-boss',
      startDate: '2099-01-01',
      dueDate: '2099-01-02',
      priority: 'Medium' as const,
      completionPercentage: 0,
      isCompleted: false,
      revisionCount: 0,
      clientApprovalStatus: 'Pending' as const,
      isRecurring: false,
      comments: [],
      approvalHistory: [],
      updatedAt: '2099-01-01T00:00:00.000Z',
    };
    useStore.setState({
      tasks: [
        {
          ...common,
          id: 'report-account-assigned',
          title: 'Account assigned report task',
          department: 'Account & Finance' as const,
          assignedTo: account.id,
          status: 'Pending',
        },
        {
          ...common,
          id: 'report-production-foreign',
          title: 'Production task must stay out of Account reports',
          department: 'Video Editor' as const,
          assignedTo: production.id,
          status: 'Completed',
          completionPercentage: 100,
          isCompleted: true,
          completedAt: '2099-01-01T12:00:00.000Z',
        },
      ],
      currentUser: { ...account, mustResetPassword: false },
    });
  });

  await page.goto('/reports');
  const reportHeading = page.getByRole('heading', { name: 'Four-Week Performance Report' });
  await expect(reportHeading).toBeVisible();
  await expect(reportHeading.locator('..').getByText('your accessible workspace tasks', { exact: false })).toBeVisible();
  await expect(page.getByText('Completed', { exact: true }).locator('..').getByText('0', { exact: true })).toBeVisible();
  await expect(page.getByText('Pending', { exact: true }).locator('..').getByText('1', { exact: true })).toBeVisible();
  await expect(page.getByText('Active Assignees', { exact: true }).locator('..').getByText('1', { exact: true })).toBeVisible();

  const accountRow = page.getByRole('row').filter({ hasText: 'Account & Finance' });
  await expect(accountRow).toContainText('1');
  await expect(page.getByRole('row').filter({ hasText: 'Video Editor' })).toHaveCount(0);
});
