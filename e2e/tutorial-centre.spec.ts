import { expect, test } from '@playwright/test';

const loginWithDemo = async (page: import('@playwright/test').Page, username: string) => {
  await page.goto('/login');
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(() => localStorage.setItem('aitask:locale', 'en'));
  await page.getByRole('button', { name: `Use ${username}` }).click();
  await page.getByRole('button', { name: 'Access Dashboard' }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/login'));
  if (/\/settings$/.test(page.url())) await page.getByRole('button', { name: 'Continue for now' }).click();
  const releaseNotice = page.getByRole('button', { name: 'Happy working' });
  await releaseNotice.waitFor({ state: 'visible', timeout: 3_000 }).catch(() => undefined);
  if (await releaseNotice.isVisible().catch(() => false)) await releaseNotice.click();
};

test('project managers can search, read, and safely launch a practical guide', async ({ page }) => {
  await loginWithDemo(page, 'Project Manager Demo');
  await page.goto('/help');

  await expect(page.getByRole('heading', { name: 'Tutorial centre' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your learning checklist' })).toBeVisible();
  const search = page.getByRole('textbox', { name: 'Search tutorials' });
  await search.fill('assign task');
  await expect(page.getByText('How to assign a task to an HOD', { exact: true })).toBeVisible();
  await page.getByText('How to assign a task to an HOD', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'How to assign a task to an HOD', level: 3 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Step-by-step instructions' })).toBeVisible();
  const detail = page.locator('aside[aria-labelledby="selected-tutorial-title"]');
  await detail.getByRole('button', { name: 'No', exact: true }).click();
  await detail.getByRole('radio', { name: 'Instructions are unclear.' }).check();
  await detail.getByRole('button', { name: 'Send feedback', exact: true }).click();
  await expect(detail.getByRole('status')).toContainText('Thanks — your feedback was saved.');
  await detail.getByRole('button', { name: 'Guide me' }).click();
  await expect(page.getByText('Step 1 of 2', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/tasks$/);
  await expect(page.getByText('Open the task list', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByText('Step 2 of 2', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close tutorial' }).click();
  await expect(page.getByText('Step 1 of 2', { exact: true })).toHaveCount(0);
});

test('client tutorial search stays limited to client-visible workflows and supports Chinese search', async ({ page }) => {
  await loginWithDemo(page, 'UrbanEats Client Demo');
  await page.goto('/help');

  const search = page.getByRole('textbox', { name: 'Search tutorials' });
  await search.fill('assign task');
  await expect(page.getByText('How to assign a task to an HOD', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '切换为中文' }).click();
  const chineseSearch = page.getByRole('textbox', { name: '搜索教程' });
  await chineseSearch.fill('下载');
  await expect(page.getByText('如何下载可用的交付成果', { exact: true })).toBeVisible();
  await expect(page.getByText('如何创建任务', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Website Design Project', { exact: true })).toHaveCount(0);
});
