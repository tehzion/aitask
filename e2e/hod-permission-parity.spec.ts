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
  await page.setViewportSize({ width: 390, height: 844 });
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
