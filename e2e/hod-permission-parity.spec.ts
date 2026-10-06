import { expect, test, type Page } from '@playwright/test';

const seedHod = async (page: Page, options: { recipients?: boolean; manage?: boolean } = {}) => {
  await page.goto('/login');
  await page.evaluate(async ({ recipients, manage }) => {
    const { useStore, stopBackendAutoSync } = await import('/src/store/index.ts');
    const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
    const { defaultRolePermissions } = await import('/src/lib/access.ts');
    stopBackendAutoSync();
    const state = useStore.getState();
    const hod = { id: 'audit-hod', name: 'Audit HOD', role: 'HOD', department: 'Video Editor', departments: ['Video Shooting', 'Video Editor'], permissions: { ...defaultRolePermissions.HOD, manageCreatedTasks: manage !== false }, mustResetPassword: false };
    enablePasswordResetBypass(hod.id);
    localStorage.setItem(`aitask:release-notice:2026-08-service-operations:${hod.id}`, 'acknowledged');
    const users = [hod, { id: 'audit-pm', name: 'Audit PM', role: 'Project Manager', department: 'Management', departments: ['Management'] }, { id: 'audit-designer', name: 'Audit Designer', role: 'Staff', department: 'Designer', departments: ['Designer'] }];
    if (recipients !== false) users.push({ id: 'audit-editor', name: 'Audit Editor', role: 'Staff', department: 'Video Editor', departments: ['Video Editor'] });
    const base = { clientName: 'Audit Co', serviceType: 'Video Editing', description: '', startDate: '2026-10-01', dueDate: '2026-10-10', status: 'Pending', priority: 'Medium', completionPercentage: 0, isCompleted: false, revisionCount: 0, clientApprovalStatus: 'Pending', isRecurring: false, recurrenceFrequency: 'None', comments: [], approvalHistory: [], visibility: 'internal' };
    const tasks = [
      { ...base, id: 'hod-assigned', title: 'Assigned delegation work', department: 'Video Editor', assignedTo: hod.id, createdBy: 'audit-pm' },
      { ...base, id: 'hod-oversight', title: 'Legacy Editor oversight', department: 'Editor', assignedTo: 'audit-editor', createdBy: 'audit-pm' },
      { ...base, id: 'hod-foreign', title: 'Foreign department work', department: 'Designer', assignedTo: 'audit-designer', createdBy: 'audit-pm' },
    ];
    useStore.setState({ currentUser: hod, users, tasks, clients: [], projects: [], rolePermissions: [], clientPlans: [], serviceCycles: [], deliverables: [], cycleComments: [], addons: [], servicePricingSnapshots: [], backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 } });
  }, options);
};

const openDetails = async (page: Page, id: string, title: string) => {
  await page.goto(`/tasks?taskId=${id}`);
  const sheet = page.getByRole('dialog', { name: title });
  await expect(sheet).toBeVisible();
  const fullEdit = sheet.getByRole('button', { name: 'Full edit', exact: true });
  if (await fullEdit.isVisible()) await fullEdit.click();
  return page.getByRole('dialog', { name: title });
};

test('HOD delegates assigned work only to an eligible staff member and preserves task ownership', async ({ page }) => {
  await seedHod(page);
  const dialog = await openDetails(page, 'hod-assigned', 'Assigned delegation work');
  const choices = dialog.getByRole('combobox', { name: 'Choose a team member' });
  await expect(choices.locator('option[value="audit-editor"]')).toHaveCount(1);
  await expect(choices.locator('option[value="audit-editor"]')).toContainText('1 Active tasks');
  await expect(choices.locator('option[value="audit-designer"]')).toHaveCount(0);
  await choices.selectOption('audit-editor');
  await dialog.getByRole('button', { name: 'Assign Task', exact: true }).click();
  await expect.poll(() => page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const task = useStore.getState().tasks.find(task => task.id === 'hod-assigned');
    return { assignedTo: task?.assignedTo, createdBy: task?.createdBy };
  })).toEqual({ assignedTo: 'audit-editor', createdBy: 'audit-pm' });
  await expect(dialog.getByRole('heading', { name: 'Task Delegation' })).toHaveCount(0);
});

test('department oversight permits edits but does not grant reassignment or foreign task access', async ({ page }) => {
  await seedHod(page);
  const dialog = await openDetails(page, 'hod-oversight', 'Legacy Editor oversight');
  await expect(dialog.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Task Delegation' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.goto('/tasks?taskId=hod-foreign');
  await expect(page.getByRole('dialog', { name: 'Foreign department work' })).toHaveCount(0);
});

test('revoked delegation permissions and empty recipient lists have usable mobile feedback', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await seedHod(page, { recipients: false });
  await page.evaluate(() => localStorage.setItem('aitask-color-theme', 'dark'));
  const dialog = await openDetails(page, 'hod-assigned', 'Assigned delegation work');
  await expect(dialog.getByText('No eligible team members in this department.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Assign Task', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await seedHod(page);
  const revoked = await openDetails(page, 'hod-assigned', 'Assigned delegation work');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const state = useStore.getState();
    const currentUser = { ...state.currentUser!, permissions: { ...state.currentUser!.permissions, manageCreatedTasks: false } };
    useStore.setState({ currentUser, users: state.users.map(user => user.id === currentUser.id ? currentUser : user) });
  });
  await expect(revoked.getByRole('heading', { name: 'Task Delegation' })).toHaveCount(0);
});

test('HOD task creation includes populated Boss-curated projects while excluding unrelated PM projects', async ({ page }) => {
  await seedHod(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const state = useStore.getState();
    const boss = { id: 'audit-boss', name: 'Audit Boss', role: 'Project Manager', isSuperAdmin: true, department: 'Management', departments: ['Management'] };
    const base = { clientId: 'audit-client', clientName: 'Curated Co', projectName: 'Curated Project', startDate: '2026-10-01', deadline: '', services: ['Video Editing'] };
    useStore.setState({ users: [...state.users, boss], projects: [{ ...base, id: 'curated-project', createdBy: boss.id }, { ...base, id: 'foreign-project', clientName: 'Foreign Co', projectName: 'Foreign Project', createdBy: 'audit-pm' }], tasks: [...state.tasks, { ...state.tasks.find(task => task.id === 'hod-foreign')!, id: 'curated-foreign-task', projectId: 'curated-project', clientName: 'Curated Co' }, { ...state.tasks.find(task => task.id === 'hod-foreign')!, id: 'pm-foreign-task', projectId: 'foreign-project', clientName: 'Foreign Co' }] });
  });
  await page.goto('/tasks');
  await page.getByRole('button', { name: 'Create task', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Create task', exact: true });
  const choices = dialog.getByRole('combobox', { name: /Link to Company/ });
  await expect(choices.locator('option[value="curated-project"]')).toHaveCount(1);
  await expect(choices.locator('option[value="foreign-project"]')).toHaveCount(0);
});

test('HOD can edit foreign-department assigned work without exposing delegation', async ({ page }) => {
  await seedHod(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const state = useStore.getState();
    useStore.setState({ tasks: state.tasks.map(task => task.id === 'hod-foreign' ? { ...task, assignedTo: state.currentUser!.id } : task) });
  });
  const dialog = await openDetails(page, 'hod-foreign', 'Foreign department work');
  await expect(dialog.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Task Delegation' })).toHaveCount(0);
});


test('HOD workload links preserve filters and separate personal and delegated work', async ({ page }) => {
  await seedHod(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const state = useStore.getState();
    const oversight = state.tasks.find(task => task.id === 'hod-oversight');
    useStore.setState({ tasks: [
      ...state.tasks.map(task => task.id === 'hod-oversight' ? { ...task, dueDate: '2020-01-01', assignedBy: 'audit-hod' } : task),
      { ...oversight, id: 'cancelled-predecessor', title: 'Cancelled predecessor', status: 'Cancelled', assignedTo: 'audit-editor', dueDate: '2020-01-01' },
      { ...oversight, id: 'completed-successor', title: 'Completed successor', isCompleted: true, predecessorTaskIds: ['hod-oversight'] },
    ] });
  });
  await page.goto('/');
  const workload = page.getByRole('region', { name: 'Department workload' });
  await expect(workload).toBeVisible();
  await expect(workload.getByRole('link', { name: /Audit Editor/ })).toContainText('Active tasks1');
  await expect(workload.getByRole('link', { name: /Audit Editor/ })).toContainText('Overdue1');
  await expect(workload.getByText('Audit Designer')).toHaveCount(0);
  await page.getByRole('tab', { name: /My assignments/ }).click();
  await expect(page.getByRole('heading', { name: 'Assigned delegation work' })).toBeVisible();
  await page.getByRole('tab', { name: /Delegated by me/ }).click();
  await expect(page.getByRole('heading', { name: 'Legacy Editor oversight' })).toBeVisible();
  await workload.getByRole('link', { name: /Audit Editor/ }).click();
  await expect(page).toHaveURL(/assignee=audit-editor/);
  await expect(page.getByRole('button', { name: /Assigned delegation work/ })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: /Legacy Editor oversight/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Assigned delegation work/ })).toHaveCount(0);
  await page.getByRole('button', { name: /Filters/ }).click();
  await expect(page.getByRole('combobox', { name: 'Filter by assignee' })).toHaveValue('audit-editor');
  await page.getByRole('combobox', { name: 'Filter by priority' }).selectOption('Medium');
  await page.getByRole('button', { name: /^Show/ }).click();
  await page.reload();
  await expect(page).toHaveURL(/priority=Medium/);
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page).not.toHaveURL(/assignee=|priority=/);
  await expect(page.getByRole('button', { name: /Assigned delegation work/ })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Department workload' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const mobileWorkload = page.getByRole('region', { name: 'Department workload' });
  await mobileWorkload.scrollIntoViewIfNeeded();
  await mobileWorkload.screenshot({ path: '/tmp/hod-workload-mobile.png' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => { document.documentElement.classList.add('dark'); document.documentElement.style.fontSize = '20px'; });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await mobileWorkload.screenshot({ path: '/tmp/hod-workload-dark.png' });
  await page.setViewportSize({ width: 812, height: 375 });
  await expect(mobileWorkload).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
