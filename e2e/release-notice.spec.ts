import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const noticeId = '2026-10-project-workflows';

const openAdminWorkspace = async (page: import('@playwright/test').Page) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Use Project Manager Demo' }).click();
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Access Dashboard' }).click();
  if (/\/settings$/.test(page.url())) {
    await page.getByRole('button', { name: 'Continue for now' }).click();
  }
};

const switchDemoUser = async (page: import('@playwright/test').Page, userId: string) => {
  await page.evaluate(async ({ id, updateId }) => {
    const { useStore } = await import('/src/app/store/workspaceStore.ts');
    localStorage.removeItem(`aitask:release-notice:${updateId}:${id}`);
    const user = useStore.getState().users.find(candidate => candidate.id === id)!;
    useStore.setState({ currentUser: { ...user, mustResetPassword: false } });
  }, { id: userId, updateId: noticeId });
  await page.goto('/');
};

test('each account receives the current role-specific update once', async ({ page }) => {
  await openAdminWorkspace(page);

  const dialog = page.getByRole('dialog', { name: 'Projects have clearer owners and next steps' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Review project health and milestones')).toBeVisible();
  await expect(dialog.getByText('Hand work to the right department')).toBeVisible();
  await expect(dialog.locator('li')).toHaveCount(3);
  await expect(page.locator('#root')).toHaveAttribute('inert', '');
  await expect(dialog.getByRole('button', { name: 'Continue to AiTask' })).toBeFocused();
  await page.screenshot({ path: 'audit-evidence/2026-10-25/content-audit/release-notice-en-desktop.png' });

  const axe = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
  expect(axe.violations, `Release notice: ${axe.violations.map(item => item.id).join(', ')}`).toEqual([]);

  await dialog.getByRole('button', { name: 'See all updates' }).click();
  await expect(dialog.getByRole('heading', { name: 'More from this update' })).toBeVisible();
  await expect(dialog.getByText('Use reports to guide follow-up')).toBeVisible();
  await dialog.getByRole('button', { name: 'Back to summary' }).click();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.locator('#root')).not.toHaveAttribute('inert', '');
  await page.reload();
  await expect(dialog).toHaveCount(0);

  await page.goto('/help');
  await page.getByRole('button', { name: 'View latest updates' }).click();
  await expect(dialog).toBeVisible();
});

test('release notice content follows the existing role workbench rules', async ({ page }) => {
  await openAdminWorkspace(page);
  await page.getByRole('button', { name: 'Continue to AiTask' }).click();

  await switchDemoUser(page, 'u-boss');
  const bossDialog = page.getByRole('dialog', { name: 'Project and team work are easier to follow' });
  await expect(bossDialog).toContainText('Manage member access');
  await page.getByRole('button', { name: 'Continue to AiTask' }).click();

  await switchDemoUser(page, 'u-hod-demo-local');
  const hodDialog = page.getByRole('dialog', { name: 'Department handoffs are easier to follow' });
  await expect(hodDialog).toContainText('Assign eligible staff');
  await expect(hodDialog).not.toContainText(/pricing|member access|client acceptance/i);
  await page.getByRole('button', { name: 'Continue to AiTask' }).click();

  await switchDemoUser(page, 'u-operation-demo-local');
  const operationDialog = page.getByRole('dialog', { name: 'Your assigned work is easier to follow' });
  await expect(operationDialog).toContainText('Keep updates with the task');
  await expect(operationDialog).not.toContainText(/pricing|member access|assign eligible staff/i);
  await expect(page.getByRole('dialog')).not.toContainText(/price|pricing/i);
  await page.getByRole('button', { name: 'Continue to AiTask' }).click();

  await switchDemoUser(page, 'u-staff-demo-local');
  await expect(page.getByRole('dialog', { name: 'Your assigned work is easier to follow' })).toContainText('Keep updates with the task');
  await page.getByRole('button', { name: 'Continue to AiTask' }).click();

  await switchDemoUser(page, 'u-account-demo-local');
  await expect(page.getByRole('dialog', { name: 'Your assigned work is easier to follow' })).toContainText('Keep updates with the task');
  await page.getByRole('button', { name: 'Continue to AiTask' }).click();

  await switchDemoUser(page, 'u-client-urban');
  const clientDialog = page.getByRole('dialog', { name: 'Shared deliveries are easier to follow' });
  await expect(clientDialog).toContainText('Follow published deliveries');
  await expect(clientDialog).not.toContainText(/price|pricing|internal task/i);
});

test('the notice is Chinese, dark-mode readable, and usable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login');
  await page.evaluate(() => {
    localStorage.setItem('aitask:locale', 'zh');
    localStorage.setItem('aitask-color-theme', 'dark');
  });
  await page.reload();
  await page.getByRole('button', { name: '使用 Project Manager Demo' }).click();
  await page.getByLabel('密码').fill('password123');
  await page.getByRole('button', { name: '进入仪表板' }).click();
  if (/\/settings$/.test(page.url())) {
    await page.getByRole('button', { name: '暂时继续' }).click();
  }

  const dialog = page.getByRole('dialog', { name: '项目负责人和下一步更明确' });
  await expect(dialog).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(dialog.getByRole('button', { name: '继续使用 AiTask' })).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: 'audit-evidence/2026-10-25/content-audit/release-notice-zh-mobile.png' });
  await page.getByRole('button', { name: '继续使用 AiTask' }).click();
  await expect(dialog).toBeHidden();
});
