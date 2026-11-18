import { expect, test, type Page } from '@playwright/test';

/** PM writes a task with a brief for an HOD; the HOD and Staff read it; the PM sees the revision allowance. */
const seed = async (page: Page) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/login');
  await page.waitForFunction(() => Boolean(document.querySelector('form input, main')));
  return page.evaluate(async () => {
    localStorage.setItem('aitask:locale', 'en');
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
    useStore.setState({
      currentUser: { ...pm, mustResetPassword: false },
      clients: [{ id: 'journey-co', clientName: 'Journey Co', createdBy: pm.id, createdAt: '', updatedAt: '' }] as never,
      projects: [{ id: 'journey-project', clientId: 'journey-co', clientName: 'Journey Co', projectName: 'Journey project', createdBy: pm.id, projectManagerIds: [pm.id],
        hodMemberIds: [hod.id], staffMemberIds: [staff.id], includedRevisions: 1, services: ['Design'], startDate: '2026-01-01', deadline: '' }] as never,
      tasks: [], notifications: [],
      backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 },
    });
    return { pmId: pm.id, hodId: hod.id, staffId: staff.id };
  });
};

const actAs = (page: Page, userId: string) => page.evaluate(async id => {
  const { useStore } = await import('/src/store/index.ts');
  const state = useStore.getState();
  const user = state.users.find(item => item.id === id)!;
  useStore.setState({ currentUser: { ...user, mustResetPassword: false } });
}, userId);

test('a PM writes a brief, the HOD and Staff read it but cannot change it, and revisions are tracked', async ({ page }) => {
  const ids = await seed(page);
  await page.goto('/tasks');

  // PM creates a task with a brief for the HOD.
  await page.getByRole('button', { name: 'New task', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Create task', exact: true });
  await dialog.getByLabel(/^Project/).selectOption('journey-project');
  await dialog.getByLabel('Task Title').fill('Launch banner');
  await dialog.getByLabel(/Assign to Position\/Department/).selectOption('Designer');
  await dialog.getByRole('combobox', { name: 'Assignee', exact: true }).selectOption({ index: 1 });
  await dialog.getByText('Additional details').click();
  await dialog.getByLabel('Reference links (one per line)').fill('https://example.com/moodboard');
  await dialog.getByLabel('Must include').fill('Logo top left');
  await dialog.getByLabel('Avoid').fill('Stock photos');
  await dialog.getByRole('button', { name: /^Create/ }).click();
  await expect.poll(() => page.evaluate(async () => (await import('/src/store/index.ts')).useStore.getState().tasks.length)).toBe(1);
  const created = await page.evaluate(async () => (await import('/src/store/index.ts')).useStore.getState().tasks[0]);
  expect(created.brief).toMatchObject({ mustHave: 'Logo top left', avoid: 'Stock photos', references: ['https://example.com/moodboard'], updatedBy: ids.pmId });
  await expect(page.getByText('Has brief').first()).toBeVisible();

  // The HOD and the assigned Staff read the brief and cannot edit it.
  await page.evaluate(async ({ taskId, staffId }) => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ tasks: useStore.getState().tasks.map(task => task.id === taskId ? { ...task, assignedTo: staffId, assignmentState: 'assigned_staff', status: 'In Progress' } : task) });
  }, { taskId: created.id, staffId: ids.staffId });
  for (const userId of [ids.hodId, ids.staffId]) {
    await actAs(page, userId);
    await page.goto(`/tasks?taskId=${created.id}`);
    const brief = page.getByRole('region', { name: 'Client brief' });
    await expect(brief).toBeVisible();
    await expect(brief.getByText('Logo top left')).toBeVisible();
    await expect(brief.getByRole('link', { name: 'https://example.com/moodboard' })).toBeVisible();
    await expect(brief.getByRole('button', { name: /brief/i })).toHaveCount(0);
    const refused = await page.evaluate(async id => (await import('/src/store/index.ts')).useStore.getState().updateTaskBrief(id, { references: [], mustHave: 'Hijack' }), created.id);
    expect(refused.ok).toBe(false);
  }

  // The PM sees that another revision goes beyond what the project includes.
  await page.evaluate(async ({ taskId, staffId }) => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ tasks: useStore.getState().tasks.map(task => task.id === taskId
      ? { ...task, status: 'Waiting Approval', revisionCount: 1, assignedTo: staffId, workState: { reviewRequestedBy: staffId, reviewRequestedAt: new Date().toISOString() } } : task) });
  }, { taskId: created.id, staffId: ids.staffId });
  await actAs(page, ids.pmId);
  await page.goto(`/tasks?taskId=${created.id}`);
  await expect(page.getByText('Revision 1 of 1').first()).toBeVisible();
  await expect(page.getByText('This will be one more revision than the project includes.')).toBeVisible();
});

test('an HOD sees the department delivery pulse and the brief flag on department work', async ({ page }) => {
  const ids = await seed(page);
  await page.evaluate(async ({ pmId, hodId, staffId }) => {
    const { useStore } = await import('/src/store/index.ts');
    const state = useStore.getState();
    const base = { ...(state.tasks[0] || {}) };
    const iso = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString();
    const ymd = (offset: number) => iso(offset).slice(0, 10);
    const task = (id: string, extra: Record<string, unknown>) => ({ ...base, id, title: id, clientId: 'journey-co', clientName: 'Journey Co', projectId: 'journey-project', projectName: 'Journey project',
      department: 'Designer', createdBy: pmId, assignedBy: pmId, assignedTo: staffId, responsibleHodId: hodId, serviceType: 'Design', priority: 'Medium', startDate: '2026-01-01',
      comments: [], approvalHistory: [], workHistory: [], workState: {}, revisionCount: 0, visibility: 'internal', clientApprovalStatus: 'Pending', ...extra });
    useStore.setState({ tasks: [
      task('h-done-1', { status: 'Completed', isCompleted: true, dueDate: ymd(-2), completedAt: iso(-3) }),
      task('h-done-2', { status: 'Completed', isCompleted: true, dueDate: ymd(-5), completedAt: iso(-3), revisionCount: 2 }),
      task('h-open', { status: 'In Progress', isCompleted: false, dueDate: ymd(4), brief: { references: [], mustHave: 'Use brand blue', updatedBy: pmId, updatedAt: iso(-1) } }),
    ] as never });
  }, ids);
  await actAs(page, ids.hodId);
  await page.goto('/');
  const glance = page.getByRole('region', { name: 'Department delivery' }).or(page.locator('section, div').filter({ has: page.getByRole('heading', { name: 'Department delivery' }) }).last());
  await expect(page.getByRole('heading', { name: 'Department delivery' })).toBeVisible();
  await expect(glance.getByText('50%').first()).toBeVisible(); // on time: 1 of 2
  await expect(page.getByRole('link', { name: /See details in Reports/ })).toBeVisible();
  await expect(page.getByText('Has brief').first()).toBeVisible();
});
