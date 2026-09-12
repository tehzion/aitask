import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const dismissReleaseNotice = async (page: Page) => {
  const releaseNotice = page.getByRole('button', { name: 'Happy working' });
  await releaseNotice.waitFor({ state: 'visible', timeout: 3_000 }).catch(() => undefined);
  if (await releaseNotice.isVisible().catch(() => false)) await releaseNotice.click();
};

const signIn = async (page: Page, username: string) => {
  await page.goto('/login');
  await page.evaluate(() => localStorage.setItem('aitask:locale', 'en'));
  await page.reload();
  await page.getByLabel('Email or username').fill(username);
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Access Dashboard' }).click();
  await page.waitForURL(url => !/\/login$/.test(url.pathname));
  if (/\/settings$/.test(page.url())) await page.getByRole('button', { name: 'Continue for now' }).click();
  await dismissReleaseNotice(page);
};

test('Staff Chinese workspace localizes dynamic copy and preserves work content', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-08-26T00:00:00.000Z') });
  await signIn(page, 'Staff Demo');
  await page.evaluate(() => localStorage.setItem('aitask:locale', 'zh'));
  await page.reload();

  await expect(page.getByRole('heading', { name: '我的工作' })).toBeVisible();
  await expect(page.getByText('1 个进行中的版本', { exact: true })).toBeVisible();
  await expect(page.getByText('1 active revision', { exact: true })).toHaveCount(0);
  await expect(page.getByText('6. Video Editing', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('UrbanEats · Promo Video Campaign', { exact: true }).first()).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

  await page.goto('/tasks');
  await page.getByRole('button', { name: /6\. Video Editing/ }).click();
  const taskSheet = page.getByRole('dialog', { name: /6\. Video Editing/ });
  await expect(taskSheet).toBeVisible();
  await expect(taskSheet.getByText('6. Video Editing', { exact: true })).toBeVisible();
  await expect(taskSheet.getByText('任务说明', { exact: true })).toBeVisible();
});

test('Boss and Staff queues move focus with keyboard tabs', async ({ page }) => {
  await signIn(page, 'Staff Demo');
  await page.getByRole('tab', { name: /Needs action/ }).focus();
  await page.keyboard.press('ArrowRight');
  const nextStaffTab = page.getByRole('tab', { name: /Up next/ });
  await expect(nextStaffTab).toHaveAttribute('aria-selected', 'true');
  await expect(nextStaffTab).toBeFocused();
  await page.keyboard.press('End');
  const doneTab = page.getByRole('tab', { name: /Done/ });
  await expect(doneTab).toBeFocused();
  await expect(doneTab).toHaveAttribute('aria-selected', 'true');

  await page.getByRole('button', { name: 'Logout' }).click();
  await signIn(page, 'Boss Koo');
  await expect(page.getByRole('heading', { name: 'Super Admin Dashboard' })).toBeVisible();
  const bossTabs = page.getByRole('tablist', { name: 'Boss dashboard views' });
  await bossTabs.getByRole('tab', { name: 'Overview' }).focus();
  await page.keyboard.press('ArrowRight');
  const pulseTab = bossTabs.getByRole('tab', { name: 'Agency pulse' });
  await expect(pulseTab).toHaveAttribute('aria-selected', 'true');
  await expect(pulseTab).toBeFocused();
});

test('Chinese Staff filters keep canonical task values', async ({ page }) => {
  await signIn(page, 'Staff Demo');
  await page.evaluate(() => localStorage.setItem('aitask:locale', 'zh'));
  await page.reload();
  await page.goto('/tasks');

  await page.getByRole('button', { name: '筛选' }).click();
  const status = page.getByRole('combobox', { name: '按状态筛选' });
  await expect(status).toBeVisible();
  await status.selectOption({ label: '进行中' });
  await expect(status).toHaveValue('In Progress');
  await expect(page.getByText('6. Video Editing', { exact: true }).first()).toBeVisible();
});

test('Staff collapsed navigation is labelled and mobile layout remains accessible', async ({ page }) => {
  await signIn(page, 'Staff Demo');
  await page.getByRole('button', { name: 'Collapse navigation' }).click();
  const more = page.getByRole('button', { name: 'More' });
  await expect(more).toHaveAttribute('aria-controls', 'staff-more-menu');
  await expect(page.locator('#staff-more-menu')).toHaveCount(1);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open more staff actions' }).click();
  await expect(page.getByRole('button', { name: 'Create task' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

  const axe = await new AxeBuilder({ page }).include('main').analyze();
  expect(axe.violations, axe.violations.map(item => item.id).join(', ')).toEqual([]);
});
