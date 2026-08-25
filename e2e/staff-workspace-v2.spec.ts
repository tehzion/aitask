import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const hasCommittedVisualBaseline = process.platform === 'darwin';

const screenshotOptions = (page: import('@playwright/test').Page) => ({
  animations: 'disabled' as const,
  caret: 'hide' as const,
  scale: 'css' as const,
  mask: [page.getByAltText('Staff Demo')],
});

const openStaffWorkspace = async (page: import('@playwright/test').Page) => {
  await page.clock.install({ time: new Date('2026-08-26T00:00:00.000Z') });
  await page.goto('/login');
  await page.evaluate(() => localStorage.setItem('aitask:locale', 'en'));
  await page.reload();
  await page.getByRole('button', { name: 'Use Staff Demo' }).click();
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Access Dashboard' }).click();
  await page.waitForURL(url => ['/', '/settings'].includes(url.pathname));
  if (/\/settings$/.test(page.url())) await page.getByRole('button', { name: 'Continue for now' }).click();
  const releaseNotice = page.getByRole('button', { name: 'Happy working' });
  await releaseNotice.waitFor({ state: 'visible', timeout: 3_000 }).catch(() => undefined);
  if (await releaseNotice.isVisible().catch(() => false)) await releaseNotice.click();
  await expect(page.getByRole('heading', { name: 'My work' })).toBeVisible();
};

test('staff v2 puts assigned action ahead of manager controls', async ({ page }) => {
  test.setTimeout(90_000);
  await openStaffWorkspace(page);

  await expect(page.getByText('Your next move')).toBeVisible();
  await expect(page.getByRole('button', { name: /Open task/ })).toBeVisible();
  await expect(page.getByText('Workspace analytics')).toHaveCount(0);
  await expect(page.locator('main').getByRole('button', { name: 'Create Task' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'My work' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Schedule', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Inbox', exact: true })).toBeVisible();

  if (hasCommittedVisualBaseline) {
    await expect(page).toHaveScreenshot('staff-v2-dashboard-desktop-light.png', screenshotOptions(page));
  }

  await page.goto('/tasks');
  await expect(page.getByRole('heading', { name: 'All work' })).toBeVisible();
  await expect(page.getByLabel('Filter by assignee')).toHaveCount(0);
  await expect(page.locator('main').getByRole('button', { name: 'Table', exact: true })).toHaveCount(0);
  await expect(page.locator('main').getByRole('button', { name: 'Board', exact: true })).toHaveCount(0);
  if (hasCommittedVisualBaseline) {
    await expect(page).toHaveScreenshot('staff-v2-all-work-desktop-light.png', screenshotOptions(page));
  }

  await page.getByRole('button', { name: /6\. Video Editing/ }).click();
  await expect(page.getByRole('combobox', { name: 'All task statuses' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send for review' })).toBeVisible();
  await expect(page.getByText('Check the earlier step')).toBeVisible();
  const taskFocusAxe = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
  expect(taskFocusAxe.violations, `Staff task focus: ${taskFocusAxe.violations.map(item => item.id).join(', ')}`).toEqual([]);

  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Send for review' }).click();
  await expect(page.getByRole('button', { name: 'Waiting for review' })).toBeDisabled();
});

test('staff mobile keeps focus, task actions and secondary creation reachable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStaffWorkspace(page);

  const openTask = page.getByRole('button', { name: /Open task/ });
  const openTaskBox = await openTask.boundingBox();
  expect(openTaskBox && openTaskBox.y + openTaskBox.height).toBeLessThan(780);
  if (hasCommittedVisualBaseline) {
    await expect(page).toHaveScreenshot('staff-v2-dashboard-mobile-light.png', screenshotOptions(page));
  }

  await openTask.click();
  await expect(page.getByRole('combobox', { name: 'All task statuses' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send for review' })).toBeVisible();
  if (hasCommittedVisualBaseline) {
    await expect(page).toHaveScreenshot('staff-v2-task-focus-mobile-light.png', screenshotOptions(page));
  }
  await page.getByRole('button', { name: /Close 6\. Video Editing/ }).click();

  await page.goto('/');
  await page.getByRole('button', { name: 'Open more staff actions' }).click();
  await expect(page.getByRole('button', { name: 'Create task' })).toBeVisible();
  await page.getByRole('button', { name: 'Create task' }).click();
  await expect(page.getByRole('heading', { name: 'Create task' })).toBeVisible();
});

test('staff v2 remains readable in Chinese dark mode', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStaffWorkspace(page);
  await page.evaluate(() => {
    localStorage.setItem('aitask:locale', 'zh');
    localStorage.setItem('aitask-color-theme', 'dark');
  });
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(page.getByRole('heading', { name: '我的工作' })).toBeVisible();
  await expect(page.getByText('下一步工作')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  if (hasCommittedVisualBaseline) {
    await expect(page).toHaveScreenshot('staff-v2-dashboard-mobile-dark-zh.png', screenshotOptions(page));
  }
});
