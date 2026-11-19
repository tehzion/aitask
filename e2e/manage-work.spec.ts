import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

type Who = 'pm' | 'hod' | 'staff';

const seed = async (page: Page, who: Who, locale: 'en' | 'zh' = 'en') => {
  await page.goto('/login');
  await page.waitForFunction(() => Boolean(document.querySelector('form input, main')));
  await page.evaluate(async ({ role, lang }) => {
    localStorage.setItem('aitask:locale', lang);
    const { useStore } = await import('/src/store/index.ts');
    const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
    const state = useStore.getState();
    const pm = state.users.find(user => user.role === 'Project Manager' && !user.isSuperAdmin)!;
    const hod = state.users.find(user => user.role === 'HOD')!;
    const staff = state.users.find(user => user.role === 'Staff' && (user.departments || []).includes('Designer'))!;
    for (const user of [pm, hod, staff]) {
      enablePasswordResetBypass(user.id);
      localStorage.setItem(`aitask:release-notice:2026-11-start-wording:${user.id}`, 'acknowledged');
    }
    const actor = role === 'pm' ? pm : role === 'hod' ? hod : staff;
    const iso = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString();
    const ymd = (offset: number) => iso(offset).slice(0, 10);
    const base = { ...state.tasks[0], clientId: 'manage-co', clientName: 'Manage Co', projectId: 'manage-project', projectName: 'Manage project', department: 'Designer',
      createdBy: pm.id, assignedBy: pm.id, assignedTo: staff.id, responsibleHodId: hod.id, serviceType: 'Design', priority: 'Medium', startDate: '2026-01-01',
      comments: [], approvalHistory: [], workHistory: [], workState: {}, revisionCount: 0, visibility: 'internal', clientApprovalStatus: 'Pending', approvalMode: 'hod', isCompleted: false, completedAt: undefined };
    useStore.setState({
      currentUser: { ...actor, mustResetPassword: false },
      clients: [{ id: 'manage-co', clientName: 'Manage Co', createdBy: pm.id, createdAt: '', updatedAt: '' }] as never,
      projects: [{ id: 'manage-project', clientId: 'manage-co', clientName: 'Manage Co', projectName: 'Manage project', createdBy: pm.id, projectManagerIds: [pm.id], hodMemberIds: [hod.id],
        staffMemberIds: [staff.id], includedRevisions: 2, services: ['Design'], startDate: '2026-01-01', deadline: '' }] as never,
      tasks: [
        { ...base, id: 'm-open', title: 'Open banner', status: 'In Progress', dueDate: ymd(6) },
        { ...base, id: 'm-late', title: 'Late reel', status: 'In Progress', dueDate: ymd(-3) },
        { ...base, id: 'm-review', title: 'Review me', status: 'Waiting Approval', dueDate: ymd(2), workState: { reviewRequestedBy: staff.id, reviewRequestedAt: iso(-1) } },
        { ...base, id: 'm-ready', title: 'Finalize me', status: 'Approved', dueDate: ymd(1), workState: { reviewRequestedBy: staff.id, reviewRequestedAt: iso(-2) } },
        { ...base, id: 'm-revise', title: 'Revise poster', status: 'Revision', revisionCount: 1, dueDate: ymd(3) },
        { ...base, id: 'm-client', title: 'With the client', status: 'Completed', isCompleted: true, visibility: 'client-visible', completedAt: iso(-5), dueDate: ymd(-6) },
        { ...base, id: 'm-done', title: 'Accepted post', status: 'Completed', isCompleted: true, visibility: 'client-visible', clientApprovalStatus: 'Approved', completedAt: iso(-8), dueDate: ymd(-9),
          clientRating: { stars: 5, ratedBy: pm.id, ratedAt: iso(-7) } },
      ],
      notifications: [],
      backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 },
    });
  }, { role: who, lang: locale });
};

test('a PM manages work by stage, searches, and opens a task in place', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await seed(page, 'pm');
  await page.goto('/manage');
  await expect(page.getByRole('heading', { name: 'Manage work', level: 1 })).toBeVisible();
  const tabs = page.getByRole('tablist', { name: 'Work by stage' });
  await expect(tabs.getByRole('tab', { name: /^Active/ })).toContainText('5');
  // The HOD reviews first, so the PM follows that one under "With reviewer", not under their own decisions.
  await expect(tabs.getByRole('tab', { name: /^With reviewer/ })).toContainText('1');
  await tabs.getByRole('tab', { name: /^With reviewer/ }).click();
  await expect(page.getByRole('tabpanel')).toContainText('Review me');
  await expect(page.getByRole('tabpanel')).not.toContainText('Finalize me');
  await expect(tabs.getByRole('tab', { name: /^In revision/ })).toContainText('1');
  await tabs.getByRole('tab', { name: /^Needs my review/ }).click();
  await expect(tabs.getByRole('tab', { name: /^With client/ })).toContainText('1');
  await expect(tabs.getByRole('tab', { name: /^Completed/ })).toContainText('2');

  // Starts where this PM's decision is needed: the HOD approved it, the PM finalizes.
  const panel = page.getByRole('tabpanel');
  await expect(tabs.getByRole('tab', { selected: true })).toContainText('Needs my review');
  await expect(panel).toContainText('Finalize me');
  await expect(panel).not.toContainText('Open banner');

  await tabs.getByRole('tab', { name: /^Active/ }).click();
  // Overdue work comes first.
  await expect(panel.getByRole('article').first()).toContainText('Late reel');
  await page.getByRole('searchbox', { name: 'Search task, company or person' }).fill('banner');
  await expect(panel).toContainText('Open banner');
  await expect(panel).not.toContainText('Late reel');

  await panel.getByText('Open banner').first().click();
  await expect(page).toHaveURL(/taskId=m-open/);
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page).toHaveURL(/\/manage/);
});

test('the side panels show clients with their rating and the team pulse', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await seed(page, 'pm');
  await page.goto('/manage');
  const side = page.getByRole('complementary', { name: 'Clients and team' });
  await expect(side.getByText('Manage Co')).toBeVisible();
  await expect(side.getByText('5.0')).toBeVisible();
  await expect(side.getByText(/1 with client/)).toBeVisible();
  await expect(side.getByText(/finished/).first()).toBeVisible();
});

test('an HOD finds Manage work in the main menu and sees department work', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await seed(page, 'hod');
  await page.goto('/');
  await page.getByRole('link', { name: 'Manage work' }).first().click();
  await expect(page).toHaveURL(/\/manage/);
  await expect(page.getByRole('heading', { name: 'Manage work', level: 1 })).toBeVisible();
  await expect(page.getByRole('tab', { name: /^Active/ })).toContainText('5');
});

test('Staff are sent back to their own home and never see the hub in the menu', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await seed(page, 'staff');
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Manage work' })).toHaveCount(0);
  await page.goto('/manage');
  // Either redirected home or shown an access-denied page, never the hub.
  await expect(page.getByRole('heading', { name: 'Manage work', level: 1 })).toHaveCount(0);
  await expect(page.getByRole('tablist', { name: 'Work by stage' })).toHaveCount(0);
});

for (const [theme, viewport] of [['light', { width: 1280, height: 900 }], ['dark', { width: 390, height: 844 }]] as const) {
  test(`Manage work is accessible and does not overflow: ${theme}, ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ colorScheme: theme });
    await seed(page, 'pm');
    await page.evaluate(value => localStorage.setItem('aitask-color-theme', value), theme);
    await page.goto('/manage');
    await expect(page.getByRole('heading', { name: 'Manage work', level: 1 })).toBeVisible();
    const results = await new AxeBuilder({ page }).include('#main-content').analyze();
    expect(results.violations, results.violations.map(item => `${item.id} (${item.nodes.map(node => node.target.join(' ')).join(' | ')})`).join(', ')).toEqual([]);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });
}

test('Manage work is fully translated in Chinese', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await seed(page, 'pm', 'zh');
  await page.goto('/manage');
  await expect(page.getByRole('heading', { name: '管理工作', level: 1 })).toBeVisible();
  const main = page.locator('#main-content');
  await expect(main).toContainText('待我审核');
  await expect(main).toContainText('审核中');
  await expect(main).toContainText('修订中');
  await expect(main).toContainText('客户处理中');
  await expect(main).toContainText('团队，最近 30 天');
  await expect(main).not.toContainText(/\{[a-z]+\}|Needs my review|With reviewer|In revision|Manage work|Team, last/);
});
