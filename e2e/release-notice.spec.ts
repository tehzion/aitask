import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const noticeId = '2026-08-service-operations';

const openAdminWorkspace = async (page: import('@playwright/test').Page) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Use Admin Demo' }).click();
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Access Dashboard' }).click();
  if (/\/settings$/.test(page.url())) {
    await page.getByRole('button', { name: 'Continue for now' }).click();
  }
};

const switchDemoUser = async (page: import('@playwright/test').Page, userId: string) => {
  await page.evaluate(async ({ id, updateId }) => {
    const { useStore } = await import('/src/store/index.ts');
    localStorage.removeItem(`aitask:release-notice:${updateId}:${id}`);
    const user = useStore.getState().users.find(candidate => candidate.id === id)!;
    useStore.setState({ currentUser: { ...user, mustResetPassword: false } });
  }, { id: userId, updateId: noticeId });
  await page.goto('/');
};

test('each account receives the service operations update once', async ({ page }) => {
  await openAdminWorkspace(page);

  const dialog = page.getByRole('dialog', { name: 'Service operations are now in one calm workspace' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Build client plans your way')).toBeVisible();
  await expect(dialog.getByText('Run monthly delivery with clarity')).toBeVisible();
  await expect(page.locator('#root')).toHaveAttribute('inert', '');
  await expect(dialog.getByRole('button', { name: 'Happy working' })).toBeFocused();

  const axe = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
  expect(axe.violations, `Release notice: ${axe.violations.map(item => item.id).join(', ')}`).toEqual([]);

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.locator('#root')).not.toHaveAttribute('inert', '');
  await page.reload();
  await expect(dialog).toHaveCount(0);
});

test('release notice content follows the existing role workbench rules', async ({ page }) => {
  await openAdminWorkspace(page);
  await page.getByRole('button', { name: 'Happy working' }).click();

  await switchDemoUser(page, 'u-boss');
  await expect(page.getByRole('dialog', { name: 'Service operations are now in one calm workspace' })).toContainText('Keep every agreement intact');
  await page.getByRole('button', { name: 'Happy working' }).click();

  await switchDemoUser(page, 'u-operation-demo-local');
  await expect(page.getByRole('dialog', { name: 'A clearer way to run client delivery' })).toContainText('Generate per-service task chains');
  await expect(page.getByRole('dialog')).not.toContainText(/price|pricing/i);
  await page.getByRole('button', { name: 'Happy working' }).click();

  await switchDemoUser(page, 'u-staff-demo-local');
  await expect(page.getByRole('dialog', { name: 'Your production work is easier to follow' })).toContainText('Keep dependencies visible');
  await page.getByRole('button', { name: 'Happy working' }).click();

  await switchDemoUser(page, 'u-account-demo-local');
  await expect(page.getByRole('dialog', { name: 'A clearer account view of client service' })).toContainText('Plan ahead for renewals');
  await page.getByRole('button', { name: 'Happy working' }).click();

  await switchDemoUser(page, 'u-client-urban');
  const clientDialog = page.getByRole('dialog', { name: 'Your client workspace is easier to follow' });
  await expect(clientDialog).toContainText('Follow published monthly delivery');
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
  await page.getByRole('button', { name: 'Use Admin Demo' }).click();
  await page.getByLabel('密码').fill('password123');
  await page.getByRole('button', { name: '进入仪表板' }).click();
  if (/\/settings$/.test(page.url())) {
    await page.getByRole('button', { name: '暂时继续' }).click();
  }

  const dialog = page.getByRole('dialog', { name: '客户服务运营现已集中在一个清晰的工作区' });
  await expect(dialog).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(dialog.getByRole('button', { name: '开始工作吧' })).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.getByRole('button', { name: '开始工作吧' }).click();
  await expect(dialog).toBeHidden();
});
