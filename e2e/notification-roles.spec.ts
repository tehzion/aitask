import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const seed = async (page: Page, locale: 'en' | 'zh' = 'en') => {
  await page.goto('/login');
  await page.waitForFunction(() => Boolean(document.querySelector('form input, main')));
  await page.evaluate(async lang => {
    localStorage.setItem('aitask:locale', lang);
    const { useStore } = await import('/src/store/index.ts');
    const state = useStore.getState();
    const pm = state.users.find(user => user.role === 'Project Manager' && !user.isSuperAdmin)!;
    localStorage.setItem(`aitask:release-notice:2026-11-start-wording:${pm.id}`, 'acknowledged');
    const at = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
    const notice = (id: string, title: string, message: string, extra: Record<string, unknown>) => ({
      id, title, message, targetUserId: pm.id, isRead: false, readByUserIds: [], iconType: 'alert', route: { page: 'tasks' }, ...extra,
    });
    useStore.setState({
      currentUser: { ...pm, mustResetPassword: false },
      notifications: [
        notice('n-overdue', 'Task Overdue', '"Poster" is overdue (was due 12 Nov 2026).', { createdAt: at(5), category: 'deadline', importance: 'action' }),
        notice('n-low', 'Low Client Rating', '"Logo" was approved by Acme Co and rated 2/5.', { createdAt: at(120), category: 'feedback', importance: 'action' }),
        notice('n-approved', 'Client Approved Task', 'Acme Co approved "Banner".', { createdAt: at(600), category: 'review', importance: 'informational', iconType: 'success' }),
        notice('n-fyi', 'Task Status Updated', '"Flyer" was moved to In Progress by Sam.', { createdAt: at(1500), category: 'status', importance: 'informational', iconType: 'status' }),
      ],
      notificationUnreadCount: 4,
      backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 },
    });
  }, locale);
  await page.goto('/notifications');
};

test('Needs action shows only the updates that call for a decision', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await seed(page);
  await expect(page.getByText('"Flyer" was moved to In Progress by Sam.')).toBeVisible();
  const action = page.getByRole('button', { name: 'Needs action', exact: true });
  await action.click();
  await expect(action).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('"Poster" is overdue (was due 12 Nov 2026).')).toBeVisible();
  await expect(page.getByText('"Logo" was approved by Acme Co and rated 2/5.')).toBeVisible();
  await expect(page.getByText('Acme Co approved "Banner".')).toHaveCount(0);
  await expect(page.getByText('"Flyer" was moved to In Progress by Sam.')).toHaveCount(0);
  const axe = await new AxeBuilder({ page }).include('main').analyze();
  expect(axe.violations.map(item => item.id)).toEqual([]);
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await expect(page.getByText('"Flyer" was moved to In Progress by Sam.')).toBeVisible();
});

test('the role-based notices read naturally in Chinese on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page, 'zh');
  await expect(page.getByRole('button', { name: '未读 (4)', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '需要行动', exact: true }).click();
  await expect(page.getByText('“Poster”已逾期（原定 12 Nov 2026 到期）。')).toBeVisible();
  await expect(page.getByText('Acme Co已批准“Logo”，并评为 2/5 分。')).toBeVisible();
  await expect(page.getByText('任务已逾期').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
