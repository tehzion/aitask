import { expect, test } from '@playwright/test';

test('first login reaches the app and critical responsive routes remain usable', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sign in to AiTask' })).toBeVisible();
  await expect(page.getByText('Demo Credentials')).toBeVisible();

  await page.getByLabel('Email or username').fill('Boss Koo');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Access Dashboard' }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole('heading', { name: 'Account Setup' })).toBeVisible();

  await page.getByRole('button', { name: 'Continue for now' }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto('/tasks');
  await expect(page.getByRole('heading', { name: 'Tasks Management' })).toBeVisible();
  await expect(page.getByRole('button', { name: '+ New Task' })).toBeVisible();

  await page.goto('/calendar');
  await expect(page.getByRole('button', { name: 'Previous month' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next month' })).toBeVisible();

  await page.goto('/clients');
  const techNovaRow = page.getByRole('row').filter({ hasText: 'TechNova' });
  await techNovaRow.getByRole('button', { name: 'Details' }).click();
  await expect(page.getByRole('button', { name: 'Rename' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit details' })).toBeVisible();
  await page.getByRole('button', { name: 'Close client details' }).click();

  await page.goto('/approvals');
  await expect(page).toHaveURL(/\/approvals$/);
  await expect(page.getByRole('heading', { name: 'Roles & Permissions' })).toBeVisible();
  await expect(page.getByText('Client Access', { exact: true })).toBeVisible();
  await expect(page.getByText('Task Access', { exact: true })).toBeVisible();
  await expect(page.getByText('View all tasks', { exact: true })).toBeVisible();
  await expect(page.getByText('View all clients', { exact: true })).toBeVisible();
  await expect(page.getByText('Manage assigned clients', { exact: true })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/clients');
  await expect(page.getByRole('heading', { name: 'Clients / Brands' })).toBeVisible();
  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(widths.content).toBeLessThanOrEqual(widths.viewport);
});
