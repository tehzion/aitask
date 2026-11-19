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
        { ...base, id: 'u-start', title: 'Start me', status: 'Pending', dueDate: ymd(1), updatedAt: iso(-0.1) },
        { ...base, id: 'u-quiet', title: 'Gone quiet', status: 'In Progress', dueDate: ymd(0), updatedAt: iso(-4) },
        { ...base, id: 'u-fine', title: 'Plenty of time', status: 'In Progress', dueDate: ymd(10), updatedAt: iso(-0.1) },
        { ...base, id: 'u-review', title: 'Ready for review', status: 'Waiting Approval', dueDate: ymd(4), workState: { reviewRequestedBy: staff.id, reviewRequestedAt: iso(-1) } },
      ],
      notifications: [],
      backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 },
    });
  }, { role: who, lang: locale });
};


test('a PM sees at-risk work flagged early, filters to it, and reads each person\'s load', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await seed(page, 'pm');
  await page.goto('/manage?tab=active');
  const panel = page.getByRole('tabpanel');
  await expect(panel).toContainText('Start me');
  await expect(panel.getByRole('article').filter({ hasText: 'Start me' })).toContainText('At risk: not started yet');
  await expect(panel.getByRole('article').filter({ hasText: 'Gone quiet' })).toContainText('At risk: no update for 2 days');
  await expect(panel.getByRole('article').filter({ hasText: 'Plenty of time' })).not.toContainText('At risk');

  const filter = page.getByRole('button', { name: /Show only at-risk work/ });
  await expect(filter).toContainText('(2)');
  await filter.click();
  await expect(filter).toHaveAttribute('aria-pressed', 'true');
  await expect(panel).toContainText('Start me');
  await expect(panel).toContainText('Gone quiet');
  await expect(panel).not.toContainText('Plenty of time');

  const team = page.getByRole('complementary', { name: 'Clients and team' });
  await expect(team).toContainText('4 open');
  await expect(team).toContainText('2 at risk');
  const axe = await new AxeBuilder({ page }).include('main').analyze();
  expect(axe.violations.map(item => item.id)).toEqual([]);

  await filter.click();
  await team.getByRole('button', { name: /^Show work for / }).click();
  await expect(page.getByRole('searchbox', { name: 'Search task, company or person' })).not.toHaveValue('');
});

test('a PM starts a brief from the service checklist without losing what was typed', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await seed(page, 'pm');
  await page.goto('/manage');
  await page.getByRole('button', { name: 'New task' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByText('Additional details').click();
  const must = dialog.getByLabel('Must include');
  await must.fill('Use the summer promo');
  await dialog.getByRole('button', { name: 'Add checklist for this service' }).click();
  await expect(must).toHaveValue('Use the summer promo\nSize and format: \nColours and fonts: \nLogo and brand assets: \nText to include: ');
  // A second tap adds nothing new.
  await dialog.getByRole('button', { name: 'Add checklist for this service' }).click();
  await expect(must).toHaveValue('Use the summer promo\nSize and format: \nColours and fonts: \nLogo and brand assets: \nText to include: ');
});

test('an HOD uses quick replies for a revision note and keeps their own', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await seed(page, 'hod');
  await page.goto('/manage?taskId=u-review');
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Add note' }).click();
  const note = dialog.getByLabel('Revision note (optional)');
  await dialog.getByRole('button', { name: 'There are wording or spelling mistakes to fix.' }).click();
  await expect(note).toHaveValue('There are wording or spelling mistakes to fix.');

  await note.fill('Keep the logo clear of the edge');
  await dialog.getByRole('button', { name: 'Save as quick reply' }).click();
  await expect(dialog.getByRole('button', { name: 'Keep the logo clear of the edge', exact: true })).toBeVisible();

  // It is still there next time, and can be removed.
  await page.reload();
  await page.goto('/manage?taskId=u-review');
  const again = page.getByRole('dialog');
  await again.getByRole('button', { name: 'Add note' }).click();
  await expect(again.getByRole('button', { name: 'Keep the logo clear of the edge', exact: true })).toBeVisible();
  await again.getByRole('button', { name: 'Remove saved reply: Keep the logo clear of the edge' }).click();
  await expect(again.getByRole('button', { name: 'Keep the logo clear of the edge', exact: true })).toHaveCount(0);
});

test('Chinese PM sees the at-risk wording and team load translated', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await seed(page, 'pm', 'zh');
  await page.goto('/manage?tab=active');
  await expect(page.getByRole('tabpanel')).toContainText('有风险：尚未开始');
  await expect(page.getByRole('complementary', { name: /客户|Clients/ })).toContainText('2 项有风险');
  await expect(page.getByRole('button', { name: /只看有风险的工作/ })).toBeVisible();
});

test('Manage work with at-risk filter and team cards fits a 320px phone in Chinese dark mode', async ({ page }) => {
  await seed(page, 'pm', 'zh');
  await page.evaluate(() => localStorage.setItem('aitask-color-theme', 'dark'));
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/manage?tab=active');
  await expect(page.getByRole('button', { name: /只看有风险的工作/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  const axe = await new AxeBuilder({ page }).include('main').analyze();
  expect(axe.violations.map(item => item.id)).toEqual([]);
});
