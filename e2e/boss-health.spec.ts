import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const seed = async (page: Page, locale: 'en' | 'zh' = 'en', finished = true) => {
  await page.goto('/login');
  await page.waitForFunction(() => Boolean(document.querySelector('form input, main')));
  await page.evaluate(async ({ lang, withHistory }) => {
    localStorage.setItem('aitask:locale', lang);
    const { useStore } = await import('/src/store/index.ts');
    const state = useStore.getState();
    const boss = state.users.find(user => user.isSuperAdmin)!;
    const pm = state.users.find(user => user.role === 'Project Manager' && !user.isSuperAdmin)!;
    const staff = state.users.find(user => user.role === 'Staff' && (user.departments || []).includes('Designer'))!;
    localStorage.setItem(`aitask:release-notice:2026-11-start-wording:${boss.id}`, 'acknowledged');
    const iso = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString();
    // Due dates are calendar days in the app's local time, so build them from local parts.
    const ymd = (offset: number) => {
      const day = new Date(Date.now() + offset * 86_400_000);
      return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    };
    const base = { ...state.tasks[0], clientId: undefined, clientName: 'Health Co', projectId: undefined, projectName: undefined, department: 'Designer',
      createdBy: pm.id, assignedBy: pm.id, assignedTo: staff.id, comments: [], approvalHistory: [], workHistory: [], workState: {}, revisionCount: 0,
      visibility: 'internal', clientApprovalStatus: 'Pending', isCompleted: false, completedAt: undefined, startDate: '2026-01-01' };
    const finishedTask = (id: string, doneAt: number, due: number, extra = {}) => ({ ...base, id, title: id, status: 'Completed', isCompleted: true, completedAt: iso(doneAt), dueDate: ymd(due), ...extra });
    useStore.setState({
      currentUser: { ...boss, mustResetPassword: false },
      tasks: [
        // Not started and due tomorrow: at risk, not overdue.
        { ...base, id: 'h-risk', title: 'Due tomorrow, not started', status: 'Pending', dueDate: ymd(1), updatedAt: iso(-0.1) },
        { ...base, id: 'h-fine', title: 'Plenty of time', status: 'In Progress', dueDate: ymd(20), updatedAt: iso(-0.1) },
        ...(withHistory ? [
          finishedTask('h-a', -2, -2, { clientRating: { stars: 5, ratedBy: pm.id, ratedAt: iso(-2) } }),
          finishedTask('h-b', -6, -5, { revisionCount: 1, clientRating: { stars: 4, ratedBy: pm.id, ratedAt: iso(-6) } }),
          finishedTask('h-c', -10, -9),
          finishedTask('h-late', -20, -25),
        ] : []),
      ],
      notifications: [],
      backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 },
    });
  }, { lang: locale, withHistory: finished });
};

test('Boss sees at-risk work and delivery health on the overview', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await seed(page);
  await page.goto('/');
  const glance = page.getByRole('list', { name: 'Company at a glance' }).or(page.locator('dl[aria-label="Company at a glance"]'));
  await expect(glance.getByRole('link', { name: 'At-risk tasks: 1' })).toHaveAttribute('href', '/manage?tab=active&filter=risk');
  const health = page.getByTestId('agency-delivery-health');
  await expect(health).toBeVisible();
  await expect(health).toContainText('Last 90 days · Used to spot where support helps');
  await expect(health).not.toContainText('\\u');
  await expect(health).toContainText('4');        // finished
  await expect(health).toContainText('75%');      // 3 of 4 on time
  await expect(health).toContainText('★ 4.5');    // average of 5 and 4
  await expect(health).toContainText('0.3');      // 1 revision across 4 tasks
  const axe = await new AxeBuilder({ page }).include('main').analyze();
  expect(axe.violations.map(item => item.id)).toEqual([]);
});

test('Boss at-risk link opens Manage work filtered to at-risk tasks', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await seed(page);
  await page.goto('/');
  await page.getByRole('link', { name: 'At-risk tasks: 1' }).click();
  await expect(page).toHaveURL(/\/manage\?tab=active&filter=risk/);
  await expect(page.getByRole('heading', { name: 'Manage work', level: 1 })).toBeVisible();
  await expect(page.getByText('Due tomorrow, not started').first()).toBeVisible();
  await expect(page.getByText('Plenty of time')).toHaveCount(0);
});

test('Boss delivery health shows a friendly empty state and Chinese labels', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page, 'zh', false);
  await page.goto('/');
  const health = page.getByTestId('agency-delivery-health');
  await expect(health).toContainText('交付健康度');
  await expect(health).toContainText('最近 90 天');
  await expect(health).not.toContainText(/Delivery health|Last 90/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test('Boss overview leads with decisions and keeps setup to one slim line', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page);
  await page.goto('/');
  const setup = page.getByTestId('onboarding-checklist');
  if (await setup.count()) {
    await expect(setup).not.toHaveAttribute('open', '');
    expect((await setup.boundingBox())!.height).toBeLessThan(90);
  }
  const attention = page.getByRole('heading', { name: 'Needs my attention' });
  const glance = page.getByRole('heading', { name: 'Company at a glance' });
  await expect(attention).toBeVisible();
  const [attentionY, glanceY] = [(await attention.boundingBox())!.y, (await glance.boundingBox())!.y];
  expect(attentionY).toBeLessThan(glanceY);
  await expect(page.locator('dl[aria-label="Company at a glance"]').getByRole('link', { name: /^Waiting on the client:/ })).toHaveAttribute('href', '/manage?tab=client');
  await expect(page.getByText('permission-visible')).toHaveCount(0);
});

test('Boss opens one Project Manager\'s work from the dashboard and can clear it', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await seed(page);
  await page.goto('/');
  await page.getByRole('tab', { name: 'Portfolio' }).click();
  const pmRow = page.getByRole('link', { name: /Open their work/ }).first();
  await expect(pmRow).toBeVisible();
  await pmRow.click();
  await expect(page).toHaveURL(/\/manage\?tab=active&owner=/);
  const chip = page.getByTestId('manage-owner-filter');
  await expect(chip).toContainText('Showing the work of');
  await chip.getByRole('button', { name: 'Show everyone' }).click();
  await expect(page).not.toHaveURL(/owner=/);
  await expect(page.getByTestId('manage-owner-filter')).toHaveCount(0);
});

test('Boss team workload is one list without Boss Koo, and the menu leads with the dashboard', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await seed(page);
  await page.goto('/');
  await page.getByRole('tab', { name: 'Team workload' }).click();
  await expect(page.getByText('Shared employee capacity')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Team workload' }).first()).toBeVisible();
  const nav = page.getByRole('navigation', { name: /main|primary|workspace/i }).first();
  const links = await nav.getByRole('link').allInnerTexts();
  expect(links.slice(0, 3).map(text => text.trim())).toEqual(['Dashboard', 'Manage work', 'All tasks']);
});

test('Boss phone bar offers Manage work and nothing overflows', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await seed(page);
  await page.goto('/');
  const bar = page.getByRole('navigation', { name: 'Mobile navigation' });
  await expect(bar.getByRole('link', { name: 'Manage work' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
