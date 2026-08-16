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
