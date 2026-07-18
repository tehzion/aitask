import { expect, test } from '@playwright/test';

test('first login reaches the app and critical responsive routes remain usable', async ({ page }) => {
  await page.goto('/feedback?role=Client&lang=zh');
  await expect(page.getByRole('heading', { name: 'AiTask 一周使用反馈' })).toBeVisible();
  await expect(page.getByLabel('角色')).toHaveValue('Client');
  await expect(page.getByText('请在2026年7月30日前提交。')).toBeVisible();
  await expect(page.getByText('超级管理员检查')).toHaveCount(0);

  const publicViewports = [
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1280, height: 800 },
    { width: 1536, height: 864 },
  ];
  for (const viewport of publicViewports) {
    await page.setViewportSize(viewport);
    for (const route of ['/feedback?role=Client&lang=zh', '/feedback/results']) {
      await page.goto(route);
      const widths = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        content: document.documentElement.scrollWidth,
      }));
      expect(widths.content, `${route} should not overflow at ${viewport.width}px`).toBeLessThanOrEqual(widths.viewport);
    }
  }
  await expect(page.getByRole('heading', { name: 'Feedback reviewer login' })).toBeVisible();

  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sign in to AiTask' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Demo accounts - select username' })).toBeVisible();
  await expect(page.getByText(/^v\d+\.\d+\.\d+\+[a-z0-9]+(?:\.dev)?$/)).toBeVisible();

  await page.getByRole('button', { name: 'Register as Staff' }).click();
  await expect(page.getByRole('heading', { name: 'Register for Access' })).toBeVisible();
  await expect(page.getByText('Staff', { exact: true })).toBeVisible();
  await expect(page.getByText('Client (External Customer)', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Already have an account? Sign in' }).click();

  await page.goto('/account/password');
  await expect(page.getByRole('heading', { name: 'Link unavailable' })).toBeVisible();
  await page.getByRole('button', { name: 'Return to Login' }).click();

  await expect(page.getByRole('button', { name: 'Use Boss Koo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use Admin Demo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use Staff Demo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use Finance Demo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use UrbanEats Client Demo' })).toBeVisible();

  await page.getByLabel('Email or username').fill('Boss Koo');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Access Dashboard' }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole('heading', { name: 'Account Setup' })).toBeVisible();

  await page.getByRole('button', { name: 'Continue for now' }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto('/tasks');
  await expect(page.getByRole('heading', { name: 'Tasks Management' })).toBeVisible();
  const newTaskButton = page.getByRole('button', { name: 'New task' });
  await expect(newTaskButton).toBeVisible();
  await newTaskButton.click();
  const createTaskDialog = page.getByRole('dialog', { name: 'Create Task' });
  await expect(createTaskDialog).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.querySelector('[role="dialog"]')?.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(createTaskDialog).toBeHidden();
  await expect(newTaskButton).toBeFocused();

  await page.goto('/calendar');
  await expect(page.getByRole('button', { name: 'Previous month' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next month' })).toBeVisible();

  await page.setViewportSize({ width: 1536, height: 864 });
  await page.goto('/clients');
  const techNovaRow = page.getByRole('row').filter({ hasText: 'TechNova' });
  const techNovaDetails = techNovaRow.getByRole('button', { name: 'Details' });
  await techNovaDetails.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rename' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit details' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(techNovaDetails).toBeFocused();

  await page.goto('/projects');
  const newCompanyButton = page.getByRole('button', { name: 'New company' });
  await newCompanyButton.click();
  const createCompanyDialog = page.getByRole('dialog', { name: 'Create company' });
  await expect(createCompanyDialog).toBeVisible();
  await expect(createCompanyDialog.getByRole('alert')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(createCompanyDialog).toBeHidden();

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
  await expect(page.getByRole('heading', { name: 'Clients' })).toBeVisible();

  const viewports = [
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1280, height: 800 },
    { width: 1536, height: 864 },
  ];
  const routes = ['/', '/tasks', '/calendar', '/clients', '/projects', '/settings', '/reports'];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const route of routes) {
      await page.goto(route);
      const widths = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        content: document.documentElement.scrollWidth,
      }));
      expect(widths.content, `${route} should not overflow at ${viewport.width}px`).toBeLessThanOrEqual(widths.viewport);
    }
  }
});
