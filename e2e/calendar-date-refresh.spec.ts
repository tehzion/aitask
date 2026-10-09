import { expect, test } from '@playwright/test';

test.use({ timezoneId: 'Asia/Jakarta' });

for (const refresh of ['midnight', 'resume'] as const) {
  test(`Calendar metrics and the selected filter refresh at ${refresh}`, async ({ page }) => {
    await page.clock.install({ time: new Date('2026-10-07T16:59:50Z') });
    await page.clock.pauseAt(new Date('2026-10-07T16:59:51Z'));
    await page.goto('/login');
    await page.getByLabel('Email or username').fill('Boss Koo');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Access Dashboard' }).click();
    await page.waitForURL(url => url.pathname !== '/login');
    if (page.url().endsWith('/settings')) await page.getByRole('button', { name: 'Continue for now' }).click();
    await page.getByRole('button', { name: 'Happy working' }).click();
    await expect(page.getByRole('heading', { name: 'Agency operations' })).toBeVisible();
    await page.evaluate(async () => {
      const { useStore, stopBackendAutoSync } = await import('/src/store/index.ts');
      stopBackendAutoSync();
      const state = useStore.getState();
      const template = state.tasks[0];
      const fixtures = [
        ['audit-yesterday', 'Yesterday fixture', '2026-10-07'],
        ['audit-today-a', 'New day A', '2026-10-08'],
        ['audit-today-b', 'New day B', '2026-10-08'],
      ];
      useStore.setState({
        tasks: fixtures.map(([id, title, dueDate]) => ({
          ...template, id, title, startDate: dueDate, dueDate, status: 'Pending',
          isCompleted: false, completionPercentage: 0,
          assignedTo: state.currentUser!.id, createdBy: state.currentUser!.id,
        })),
      });
    });
    await page.goto('/calendar');
    const due = page.locator('button[data-calendar-filter="due-today"]');
    await expect(due).toContainText('1');
    await due.click();
    if (refresh === 'midnight') await page.clock.fastForward(10_000);
    else {
      await page.clock.setSystemTime(new Date('2026-10-08T01:00:00Z'));
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    }
    await expect(due).toContainText('2');
    await expect(page.getByRole('button', { name: /Yesterday fixture/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /New day A/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /New day B/ }).first()).toBeVisible();
    await expect(page.locator('button[data-calendar-filter="overdue"]')).toContainText('1');
  });
}
