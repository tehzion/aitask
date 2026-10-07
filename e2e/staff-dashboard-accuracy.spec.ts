import { expect, test, type Page } from '@playwright/test';

test.use({ timezoneId: 'Asia/Jakarta' });
test.describe.configure({ timeout: 90_000 });
const metric = (page: Page, label: string) => page.locator('[aria-labelledby="staff-role-context"]').getByText(label, { exact: true }).locator('..').locator('p').first();
const seed = async (page: Page, department: 'Operation' | 'Account & Finance' | 'Designer', time = '2026-10-07T07:00:00Z') => {
  await page.clock.install({ time: new Date(new Date(time).getTime() - 86400000) });
  await page.clock.pauseAt(new Date(time));
  await page.goto('/login');
  await expect(page.getByLabel('Email or username')).toBeVisible();
  await page.evaluate(async department => {
    const { useStore } = await import('/src/store/index.ts');
    const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
    const state = useStore.getState();
    const staff = { ...state.users.find(user => user.name === 'Staff Demo')!, id: 'staff-dash-audit-user', name: 'Dashboard audit staff', department, departments: [department], mustResetPassword: false };
    const other = { ...(state.users.find(user => user.id !== staff.id && user.role === 'Staff') || state.users.find(user => user.isSuperAdmin)!), department, departments: [department] };
    enablePasswordResetBypass(staff.id);
    localStorage.setItem(`aitask:release-notice:2026-08-service-operations:${staff.id}`, 'acknowledged');
    localStorage.setItem('aitask:locale', 'en');
    const template = { ...state.tasks[0], clientId: 'staff-dash-a', clientName: 'Assigned company', projectId: undefined, projectName: undefined,
      assignedTo: staff.id, createdBy: other.id, department, startDate: '2026-10-01', dueDate: '2026-10-07', status: 'Pending', isCompleted: false,
      revisionCount: 0, predecessorTaskIds: [], comments: [], approvalHistory: [], deliverableId: undefined, serviceCycleId: undefined };
    useStore.setState({ currentUser: staff, users: [staff, other], rolePermissions: [], clients: [], projects: [],
      tasks: [
        { ...template, id: 'assigned', title: 'Assigned dependency task', predecessorTaskIds: ['creator-visible'] },
        { ...template, id: 'creator-visible', title: 'Creator visible predecessor', clientId: 'staff-dash-b', clientName: 'Creator only company', assignedTo: other.id, createdBy: staff.id },
        { ...template, id: 'foreign', title: 'Foreign task', assignedTo: other.id, createdBy: other.id },
        { ...template, id: 'completed', title: 'Assigned completed task', status: 'Completed' },
        { ...template, id: 'cancelled', title: 'Assigned cancelled task', status: 'Cancelled' },
        { ...template, id: 'waiting', title: 'Assigned waiting task', status: 'Waiting Approval' },
        { ...template, id: 'future', title: 'Assigned future task', dueDate: '2026-10-08' },
      ], clientPlans: [{ id: 'staff-dash-plan', clientId: 'staff-dash-a', clientName: 'Assigned company', name: 'Assigned plan', status: 'Active', contractEndDate: '2026-11-06' }],
      serviceCycles: [], deliverables: [], notifications: [], backend: { ...state.backend, mode: 'local', status: 'local', isLoading: false, isSaving: false, isPulling: false, hasLocalChanges: false, pendingMutations: 0 } });
  }, department);
  await page.goto('/');
  await page.clock.runFor(600);
  await expect(page.getByRole('heading', { name: 'My work', exact: true })).toBeVisible();
  await page.evaluate(async () => (await import('/src/store/index.ts')).stopBackendAutoSync());
};

test('assigned queue totals and basic open-task metrics match the role scope', async ({ page }) => {
  await seed(page, 'Operation');
  await expect(metric(page, 'Due today')).toHaveText('2');
  await expect(metric(page, 'Waiting review')).toHaveText('1');
  await expect(page.getByRole('tab', { name: /Needs action/ })).toContainText('1');
  await expect(page.getByRole('tab', { name: /Up next/ })).toContainText('1');
  await expect(page.getByRole('tab', { name: /Waiting/ })).toContainText('1');
  await expect(page.getByRole('tab', { name: /Done/ })).toContainText('2');
  await expect(page.getByText('Foreign task', { exact: true })).toHaveCount(0);
});

for (const department of ['Operation', 'Designer'] as const) {
 test(`${department} dashboard counts an accessible predecessor assigned to another member`, async ({ page }) => {
  await seed(page, department);
  const actualVisibleBlockers = await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const { getVisibleTasks } = await import('/src/lib/access.ts');
    const { getTaskBlockers } = await import('/src/lib/staffWorkspace.ts');
    const s = useStore.getState();
    return getTaskBlockers(s.tasks.find(task => task.id === 'assigned')!, getVisibleTasks(s.currentUser, s.tasks, s.rolePermissions, { clients: s.clients, projects: s.projects })).length;
  });
  expect(actualVisibleBlockers).toBe(1);
  await expect(metric(page, 'Blocked steps')).toHaveText('1');
  await expect(page.getByRole('button').filter({ hasText: 'Assigned dependency task' })).toContainText('1 blocker');
 });
}


test('assigned clients excludes work only created by Staff', async ({ page }) => {
  await seed(page, 'Account & Finance');
  const actualAssignedClients = await page.evaluate(async () => {
    const s = (await import('/src/store/index.ts')).useStore.getState();
    return new Set(s.tasks.filter(task => task.assignedTo === s.currentUser!.id).map(task => task.clientName)).size;
  });
  expect(actualAssignedClients).toBe(1);
  await expect(metric(page, 'Assigned clients')).toHaveText('1');
});

test('early-morning renewals includes the contract exactly 30 local calendar days away', async ({ page }) => {
  await seed(page, 'Account & Finance', '2026-10-06T17:30:00Z');
  expect(await page.evaluate(() => new Date().getDate())).toBe(7);
  await expect(metric(page, 'Active plans')).toHaveText('1');
  await expect(metric(page, 'Renewals')).toHaveText('1');
});

test('dashboard metrics and queues advance across midnight', async ({ page }) => {
  await seed(page, 'Operation', '2026-10-07T16:59:50Z');
  await expect(metric(page, 'Due today')).toHaveText('2');
  await page.clock.fastForward(11000);
  expect(await page.evaluate(() => new Date().getDate())).toBe(8);
  const actualDueToday = await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const { getTodayInputDate } = await import('/src/lib/utils.ts');
    const { isTaskOpen } = await import('/src/lib/taskReporting.ts');
    const s = useStore.getState();
    return s.tasks.filter(task => task.assignedTo === s.currentUser!.id && isTaskOpen(task) && task.dueDate === getTodayInputDate()).length;
  });
  expect(actualDueToday).toBe(1);
  await expect(metric(page, 'Due today')).toHaveText('1');
  await expect(page.getByRole('tab', { name: /Needs action/ })).toContainText('2');
  await expect(page.getByRole('tab', { name: /Up next/ })).toContainText('0');
});

test('blocker metrics do not expose an inaccessible predecessor', async ({ page }) => {
  await seed(page, 'Operation');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState(state => ({ tasks: state.tasks.map(task => task.id === 'assigned' ? { ...task, predecessorTaskIds: ['foreign'] } : task) }));
  });
  await expect(metric(page, 'Blocked steps')).toHaveText('0');
  await expect(page.getByText('Foreign task', { exact: true })).toHaveCount(0);
});

test('account metrics and queue counts react to reassignment and plan changes', async ({ page }) => {
  await seed(page, 'Account & Finance');
  await expect(metric(page, 'Assigned clients')).toHaveText('1');
  await expect(metric(page, 'Active plans')).toHaveText('1');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState(state => ({ tasks: state.tasks.map(task => task.id === 'creator-visible' ? { ...task, assignedTo: state.currentUser!.id } : task),
      clientPlans: state.clientPlans.map(plan => ({ ...plan, status: 'Paused' })) }));
  });
  await expect(metric(page, 'Assigned clients')).toHaveText('2');
  await expect(metric(page, 'Active plans')).toHaveText('0');
  await expect(metric(page, 'Renewals')).toHaveText('0');
  await expect(page.getByRole('tab', { name: /Needs action/ })).toContainText('2');
});

test('renewal metrics refresh at midnight when a day-31 contract enters the window', async ({ page }) => {
  await seed(page, 'Account & Finance', '2026-10-07T16:59:50Z');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState(state => ({ clientPlans: state.clientPlans.map(plan => ({ ...plan, contractEndDate: '2026-11-07' })) }));
  });
  await expect(metric(page, 'Renewals')).toHaveText('0');
  await page.clock.fastForward(11000);
  await expect(metric(page, 'Renewals')).toHaveText('1');
});

test('a resumed Staff tab updates its date-dependent metrics on focus', async ({ page }) => {
  await seed(page, 'Operation');
  await expect(metric(page, 'Due today')).toHaveText('2');
  await page.clock.setSystemTime(new Date('2026-10-08T07:00:00Z'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(metric(page, 'Due today')).toHaveText('1');
  await expect(page.getByRole('tab', { name: /Needs action/ })).toContainText('2');
});

test('mobile Staff dashboard counts remain scoped and advance at midnight', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page, 'Operation', '2026-10-07T16:59:50Z');
  await expect(metric(page, 'Blocked steps')).toHaveText('1');
  await expect(metric(page, 'Due today')).toHaveText('2');
  await page.clock.fastForward(11000);
  await expect(metric(page, 'Due today')).toHaveText('1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
