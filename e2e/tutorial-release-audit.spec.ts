import { expect, test } from '@playwright/test';

const loginWithDemo = async (page: import('@playwright/test').Page, username: string) => {
  await page.goto('/login');
  await page.evaluate(() => localStorage.clear());
  await page.getByRole('button', { name: `Use ${username}` }).click();
  await page.getByRole('button', { name: 'Access Dashboard' }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/login'));
  if (/\/settings$/.test(page.url())) await page.getByRole('button', { name: 'Continue for now' }).click();
  const releaseNotice = page.getByRole('button', { name: 'Happy working' });
  await releaseNotice.waitFor({ state: 'visible', timeout: 3_000 }).catch(() => undefined);
  if (await releaseNotice.isVisible().catch(() => false)) await releaseNotice.click();
};

test('internal workflow maps render, while linked tutorials remain role-specific', async ({ page }) => {
  await loginWithDemo(page, 'Project Manager Demo');
  await page.goto('/help');

  await expect(page.getByRole('heading', { name: 'Workflow learning guides' })).toBeVisible();
  const websiteWorkflow = page.locator('details').filter({ hasText: 'Website Design Project' });
  await websiteWorkflow.locator('summary').click();
  await expect(websiteWorkflow.getByText('Set the scope', { exact: true })).toBeVisible();
  await expect(websiteWorkflow.getByRole('button', { name: 'Read linked tutorial' })).toHaveCount(1);

  await websiteWorkflow.getByRole('button', { name: 'Read linked tutorial' }).click();
  await expect(page.getByRole('heading', { name: 'How to create a project', level: 3 })).toBeVisible();
});

test('client tutorial navigation never opens internal related content or injected guides', async ({ page }) => {
  await loginWithDemo(page, 'UrbanEats Client Demo');
  await page.goto('/help?tutorial=understand-dashboard');

  const detail = page.locator('aside[aria-labelledby="selected-tutorial-title"]');
  await expect(detail.getByRole('heading', { name: 'How to read your dashboard', level: 3 })).toBeVisible();
  await expect(detail.getByRole('button', { name: 'How to monitor task progress' })).toHaveCount(0);

  await page.goto('/help?tutorial=create-task');
  await expect(page.getByRole('heading', { name: 'Choose a tutorial', level: 3 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'How to create a task', level: 3 })).toHaveCount(0);

  await page.evaluate(() => window.dispatchEvent(new CustomEvent('aitask-start-tutorial-guide', {
    detail: { tutorialId: 'create-task', steps: [{ target: 'body', title: 'Injected guide', body: 'Should never render.' }] },
  })));
  await expect(page.getByText('Injected guide', { exact: true })).toHaveCount(0);

  await page.evaluate(() => window.dispatchEvent(new CustomEvent('aitask-start-tutorial-guide', {
    detail: { tutorialId: 'approve-deliverables', steps: [{ target: 'body', title: 'Injected guide', body: 'Should never render.' }] },
  })));
  await expect(page.getByText('Open Deliveries', { exact: true })).toBeVisible();
  await expect(page.getByText('Injected guide', { exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByText('Open Deliveries', { exact: true })).toHaveCount(0);
});

test('role-relevant catalogue search and the compact tutorial overlay remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await loginWithDemo(page, 'Staff Demo');
  await page.goto('/help');

  const search = page.getByRole('textbox', { name: 'Search tutorials' });
  await search.fill('submit work');
  const submitTutorial = page.locator('button').filter({ hasText: 'How to submit work for approval' }).last();
  await expect(submitTutorial).toBeVisible();
  await submitTutorial.click();
  const detail = page.locator('aside[aria-labelledby="selected-tutorial-title"]');
  await detail.getByRole('button', { name: 'Guide me' }).click();

  await expect(page.getByText('Step 1 of 2', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.keyboard.press('ArrowRight');
  await expect(page.getByText('Step 2 of 2', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByText('Step 2 of 2', { exact: true })).toHaveCount(0);

  for (const { width, height } of [
    { width: 375, height: 800 },
    { width: 390, height: 800 },
    { width: 768, height: 800 },
    { width: 1024, height: 800 },
    { width: 1440, height: 800 },
    { width: 700, height: 320 },
  ]) {
    await page.setViewportSize({ width, height });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test('an active guide remains usable after switching to Simplified Chinese', async ({ page }) => {
  await loginWithDemo(page, 'Project Manager Demo');
  await page.goto('/help?tutorial=create-task');

  const detail = page.locator('aside[aria-labelledby="selected-tutorial-title"]');
  await detail.getByRole('button', { name: 'Guide me' }).click();
  await expect(page.getByText('Step 1 of 2', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '切换为中文' }).click();
  await expect(page.getByText('步骤 1 共 2', { exact: true })).toBeVisible();
  await expect(page.getByText('打开任务', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭教程' }).click();
});
