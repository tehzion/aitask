import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const noticeId = '2026-11-start-wording';

const openAdminWorkspace = async (page: import('@playwright/test').Page) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Use Project Manager Demo' }).click();
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
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

test('each account receives the release update once', async ({ page }) => {
  await openAdminWorkspace(page);

  const dialog = page.getByRole('dialog', { name: 'Clearer words for plans and months' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Start plan', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Start month', { exact: true })).toBeVisible();
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

test('dismissal survives a reload before persistent acknowledgement and remains scoped to the account', async ({ page }) => {
  await openAdminWorkspace(page);
  const dialog = page.getByRole('dialog', { name: 'Clearer words for plans and months' });
  await expect(dialog).toBeVisible();
  const userId = await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    return useStore.getState().currentUser!.id;
  });
  await dialog.getByRole('button', { name: 'Happy working' }).click();
  await page.evaluate(({ id, updateId }) => localStorage.removeItem(`aitask:release-notice:${updateId}:${id}`), { id: userId, updateId: noticeId });
  await page.reload();
  await expect(dialog).toHaveCount(0);

  await switchDemoUser(page, 'u-staff-demo-local');
  await expect(page.getByRole('dialog', { name: 'Clearer names for client months' })).toBeVisible();
});

test('each role hears only what changed for them', async ({ page }) => {
  await openAdminWorkspace(page);
  await page.getByRole('button', { name: 'Happy working' }).click();

  await switchDemoUser(page, 'u-boss');
  await expect(page.getByRole('dialog', { name: 'Clearer words for plans and months' })).toContainText('Replaces Publish.');
  await page.getByRole('button', { name: 'Happy working' }).click();

  await switchDemoUser(page, 'u-hod-demo-local');
  await expect(page.getByRole('dialog', { name: 'Clearer names for client months' })).toContainText('Your tasks are unchanged');
  await page.getByRole('button', { name: 'Happy working' }).click();

  await switchDemoUser(page, 'u-operation-demo-local');
  await expect(page.getByRole('dialog', { name: 'Clearer names for client months' })).toContainText('Your tasks are unchanged');
  await expect(page.getByRole('dialog')).not.toContainText(/price|pricing|Start plan|Start month/i);
  await page.getByRole('button', { name: 'Happy working' }).click();

  await switchDemoUser(page, 'u-client-urban');
  const clientDialog = page.getByRole('dialog', { name: 'Clearer words for your monthly service' });
  await expect(clientDialog).toContainText('Not started, In progress or Done');
  await expect(clientDialog).not.toContainText(/price|pricing|internal task|Staff/i);
});

test('the notice is Chinese, dark-mode readable, and usable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login');
  // Let the app finish its startup load so seeded state is not overwritten.
  await page.waitForFunction(() => Boolean(document.querySelector('form input, main')));
  await page.evaluate(() => {
    localStorage.setItem('aitask:locale', 'zh');
    localStorage.setItem('aitask-color-theme', 'dark');
  });
  await page.reload();
  await page.getByRole('button', { name: '使用 Project Manager Demo' }).click();
  await page.getByLabel('密码').fill('password123');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  if (/\/settings$/.test(page.url())) {
    await page.getByRole('button', { name: '暂时继续' }).click();
  }

  const dialog = page.getByRole('dialog', { name: '方案与月份的用词更清晰' });
  await expect(dialog).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(dialog.getByRole('button', { name: '开始工作吧' })).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.getByRole('button', { name: '开始工作吧' }).click();
  await expect(dialog).toBeHidden();
});
