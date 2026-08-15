import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const expectNoAxeViolations = async (page: import('@playwright/test').Page, context: string) => {
  const results = await new AxeBuilder({ page }).include('main').analyze();
  expect(results.violations, `${context}: ${results.violations.map(item => `${item.id} (${item.nodes.length})`).join(', ')}`).toEqual([]);
};

const openDemoWorkspace = async (page: import('@playwright/test').Page) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Use Admin Demo' }).click();
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Access Dashboard' }).click();
  await expect(page).toHaveURL(/\/(?:settings)?$/);
  const continueButton = page.getByRole('button', { name: 'Continue for now' });
  if (/\/settings$/.test(page.url())) {
    await expect(continueButton).toBeVisible();
    await continueButton.click();
  }
  await expect(page.getByRole('heading', { name: 'Admin Dashboard' })).toBeVisible();
};

test('day/night mode and keyboard shortcuts remain accessible', async ({ page }) => {
  await openDemoWorkspace(page);

  const root = page.locator('html');
  const themeButton = page.getByRole('button', { name: 'Switch to night mode' });
  await expect(themeButton).toHaveAttribute('aria-keyshortcuts', 'Shift+D');
  await expectNoAxeViolations(page, 'Admin dashboard in day mode');

  await page.keyboard.press('Shift+D');
  await expect(root).toHaveClass(/dark/);
  await expect(page.getByRole('button', { name: 'Switch to day mode' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(11, 17, 21)');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('aitask-color-theme'))).toBe('dark');
  await page.waitForTimeout(250);
  await expectNoAxeViolations(page, 'Admin dashboard in night mode');

  await page.reload();
  await expect(root).toHaveClass(/dark/);

  await page.keyboard.press('?');
  const guide = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(guide).toBeVisible();
  await expect(page.locator('#root')).toHaveAttribute('inert', '');
  await expect(page.locator('#root')).toHaveAttribute('aria-hidden', 'true');
  await expect(guide.getByText('Press G, then the page key.')).toBeVisible();
  await expect(guide.getByRole('button', { name: 'Close keyboard shortcuts' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(guide).toBeHidden();
  await expect(page.locator('#root')).not.toHaveAttribute('inert', '');
  await expect(page.locator('#root')).not.toHaveAttribute('aria-hidden', 'true');

  const appearanceTrigger = page.getByRole('button', { name: 'Appearance settings' });
  await appearanceTrigger.click();
  await expect(page.getByRole('menuitemradio', { name: 'Dark' })).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.getByRole('menuitemradio', { name: 'System' })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(page.getByRole('menuitemradio', { name: 'Light' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(appearanceTrigger).toBeFocused();

  await page.keyboard.press('g');
  await page.keyboard.press('t');
  await expect(page).toHaveURL(/\/tasks$/);
  await expect(page.getByRole('heading', { name: 'Tasks Management' })).toBeVisible();
  await expectNoAxeViolations(page, 'Tasks in night mode');

  await page.keyboard.press('/');
  const globalSearch = page.getByRole('textbox', { name: 'Search tasks' });
  await expect(globalSearch).toBeFocused();
  await globalSearch.fill('video');
  await page.keyboard.press('Shift+D');
  await expect(root).toHaveClass(/dark/);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open menu' }).click();
  const navigation = page.locator('aside[aria-label="Primary navigation"]');
  await expect(navigation).toHaveAttribute('aria-hidden', 'false');
  await expect(navigation.getByRole('link', { name: 'Dashboard' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(navigation.getByRole('button', { name: 'Logout' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(navigation.getByRole('link', { name: 'Dashboard' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(navigation).toHaveAttribute('aria-hidden', 'true');
  await expect(navigation).toHaveAttribute('inert', '');
  await expect(page.getByRole('button', { name: 'Open menu' })).toBeFocused();
});
