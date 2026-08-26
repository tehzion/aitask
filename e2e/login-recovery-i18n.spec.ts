import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('the hosted password recovery entry is complete in English and Chinese', async ({ page }) => {
  await page.goto('/login');

  const recoveryEntry = page.getByRole('button', { name: 'Forgot password?' });
  await expect(recoveryEntry).toBeVisible();

  await page.getByRole('button', { name: '切换为中文' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.getByRole('button', { name: '忘记密码？' })).toBeVisible();

  await page.getByRole('button', { name: '忘记密码？' }).click();
  await expect(page.getByRole('heading', { name: '重设您的密码' })).toBeVisible();
  await expect(page.getByText('输入您的账号邮箱或用户名以接收安全恢复链接。')).toBeVisible();
  await expect(page.getByLabel('邮箱或用户名')).toBeVisible();
  await expect(page.getByRole('button', { name: '发送恢复邮件' })).toBeVisible();
  await expect(page.getByRole('button', { name: '返回登录' })).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);

  await page.getByRole('button', { name: '返回登录' }).click();
  await page.getByRole('button', { name: 'Switch to English' }).click();
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send recovery email' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back to Login' })).toBeVisible();
});
