import { expect, test, type Page } from '@playwright/test';

const seedBoss = async (page: Page) => {
  await page.goto('/login');
  // Let the app finish its startup load so seeded state is not overwritten.
  await page.waitForFunction(() => Boolean(document.querySelector('form input, main')));
  await page.evaluate(async () => {
    localStorage.setItem('aitask:locale', 'en');
    const { useStore } = await import('/src/store/index.ts');
    const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
    const state = useStore.getState();
    const boss = state.users.find(user => user.isSuperAdmin)!;
    enablePasswordResetBypass(boss.id);
    localStorage.setItem(`aitask:release-notice:2026-11-start-wording:${boss.id}`, 'acknowledged');
    useStore.setState({ currentUser: { ...boss, mustResetPassword: false }, backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 } });
  });
};

// A dialog taller than the window must scroll, or its lower controls (for
// example Add service in a plan's Edit details) cannot be reached.
test('a tall dialog scrolls inside a short window', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 480 });
  await seedBoss(page);
  await page.goto('/approvals?tab=members');
  await page.getByRole('button', { name: 'Add Member', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add new member' });
  await expect(dialog).toBeVisible();
  const metrics = await dialog.evaluate(element => ({ scrollHeight: element.scrollHeight, clientHeight: element.clientHeight, overflowY: getComputedStyle(element).overflowY }));
  expect(metrics.overflowY).toBe('auto');
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
  await dialog.evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(dialog.locator('button').last()).toBeInViewport();
});
