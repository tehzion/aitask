import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const seed = async (page: Page, locale: 'en' | 'zh' = 'en', finished = true) => {
  await page.goto('/login');
  await page.waitForFunction(() => Boolean(document.querySelector('form input, main')));
  await page.evaluate(async ({ lang, withHistory }) => {
    localStorage.setItem('aitask:locale', lang);
    const { useStore } = await import('/src/store/index.ts');
    const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
    const state = useStore.getState();
    const pm = state.users.find(user => user.role === 'Project Manager' && !user.isSuperAdmin)!;
    const staff = state.users.find(user => user.role === 'Staff' && (user.departments || []).includes('Designer'))!;
    enablePasswordResetBypass(staff.id);
    localStorage.setItem(`aitask:release-notice:2026-11-start-wording:${staff.id}`, 'acknowledged');
    const iso = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString();
    // Due dates are calendar days in the app's local time, so build them from local parts.
    const ymd = (offset: number) => {
      const day = new Date(Date.now() + offset * 86_400_000);
      return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    };
    const base = { ...state.tasks[0], clientId: undefined, clientName: 'Record Co', projectId: undefined, projectName: undefined, department: 'Designer',
      createdBy: pm.id, assignedBy: pm.id, assignedTo: staff.id, comments: [], approvalHistory: [], workHistory: [], workState: {}, revisionCount: 0,
      visibility: 'internal', clientApprovalStatus: 'Pending', isCompleted: false, completedAt: undefined, startDate: '2026-01-01' };
    const finishedTask = (id: string, doneAt: number, due: number, extra = {}) => ({ ...base, id, title: id, status: 'Completed', isCompleted: true, completedAt: iso(doneAt), dueDate: ymd(due), ...extra });
    useStore.setState({
      currentUser: { ...staff, mustResetPassword: false },
      tasks: [
        { ...base, id: 'r-open', title: 'Current job', status: 'In Progress', dueDate: ymd(9), updatedAt: iso(-0.1) },
        ...(withHistory ? [
          finishedTask('r-a', -2, -2, { clientRating: { stars: 5, ratedBy: pm.id, ratedAt: iso(-2) } }),
          finishedTask('r-b', -6, -5, { revisionCount: 1 }),
          finishedTask('r-c', -10, -9),
          finishedTask('r-late', -20, -25),
        ] : []),
      ],
      notifications: [],
      backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 },
    });
  }, { lang: locale, withHistory: finished });
};

test('Staff see their own delivery record and on-time streak', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await seed(page);
  await page.goto('/');
  const record = page.getByRole('region', { name: 'My delivery record' }).or(page.locator('[aria-labelledby="my-delivery-record-title"]'));
  await expect(record).toBeVisible();
  await expect(record).toContainText('Only you can see this.');
  await expect(record).toContainText('4');       // finished
  await expect(record).toContainText('75%');     // 3 of 4 on time
  await expect(record).toContainText('★ 5.0');
  await expect(record).toContainText('0.3');     // 1 revision across 4 tasks
  await expect(record).toContainText('3 deliveries on time in a row');
  const axe = await new AxeBuilder({ page }).include('main').analyze();
  expect(axe.violations.map(item => item.id)).toEqual([]);
});

test('Staff with no finished work see a friendly empty state, in Chinese too', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page, 'zh', false);
  await page.goto('/');
  await expect(page.getByText('完成第一项任务后，这里会显示你的交付记录。')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test('Chinese Staff record labels are translated', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await seed(page, 'zh');
  await page.goto('/');
  const record = page.locator('[aria-labelledby="my-delivery-record-title"]');
  await expect(record).toContainText('我的交付记录');
  await expect(record).toContainText('连续 3 次准时交付');
  await expect(record).not.toContainText(/\{[a-z]+\}|My delivery record|on time in a row/);
});
