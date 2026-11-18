import { expect, test, type Page } from '@playwright/test';

// Project Managers add tasks, hand them to a HOD to handle, and manage them.
const seedPm = async (page: Page) => {
  await page.goto('/login');
  await page.getByLabel('Password', { exact: true }).waitFor();
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
    const state = useStore.getState();
    const base = state.users.find(user => user.role === 'Project Manager' && !user.isSuperAdmin)!;
    const pm = { ...base, mustResetPassword: false, permissions: undefined };
    const hod = { ...base, id: 'pm-flow-hod', name: 'Flow HOD', role: 'HOD', department: 'Video Shooting', departments: ['Video Shooting', 'Video Editor'], customRoleId: undefined, permissions: undefined, hasLogin: true };
    const staff = { ...base, id: 'pm-flow-staff', name: 'Flow Staff', role: 'Staff', department: 'Video Editor', departments: ['Video Editor'], customRoleId: undefined, permissions: undefined, hasLogin: true };
    enablePasswordResetBypass(pm.id);
    localStorage.setItem(`aitask:release-notice:2026-11-start-wording:${pm.id}`, 'acknowledged');
    localStorage.setItem('aitask:onboarding:v1', JSON.stringify({ [pm.id]: { status: 'skipped', updatedAt: new Date().toISOString() } }));
    localStorage.setItem('aitask:locale', 'en');
    const now = new Date().toISOString();
    useStore.setState({
      currentUser: pm,
      users: [pm, hod, staff],
      rolePermissions: [],
      tasks: [],
      notifications: [],
      clients: [{ id: 'pm-flow-company', clientName: 'Flow Company', createdBy: pm.id, createdAt: now, updatedAt: now }],
      projects: [{ id: 'pm-flow-project', clientId: 'pm-flow-company', clientName: 'Flow Company', projectName: 'Flow Project', services: ['Video'], serviceType: 'Video', serviceTypes: ['Video'], startDate: '2026-11-01', deadline: '2026-12-31', projectManagerIds: [pm.id], hodMemberIds: [hod.id], staffMemberIds: [], createdBy: pm.id, status: 'Active', defaultApprovalMode: 'hod', milestones: [], memberResponsibilities: {}, requireClearClosureChecklist: false, createdAt: now, updatedAt: now } as never],
      backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 },
    });
  });
};

test('a PM adds a task from the Tasks header and hands it to a HOD to handle', async ({ page }) => {
  await seedPm(page);
  await page.goto('/tasks');
  await page.getByRole('button', { name: 'New task', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Create task', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(/Link to Company \/ Brand/).selectOption('pm-flow-project');
  await dialog.getByLabel('Task Title').fill('PM handed task');
  await dialog.getByLabel(/Assign to Position\/Department/).selectOption('Video Shooting');
  await dialog.getByRole('combobox', { name: 'Assignee', exact: true }).selectOption({ label: 'Flow HOD (HOD)' });
  await dialog.getByRole('button', { name: 'Create & open task', exact: true }).click();
  await expect.poll(() => page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const task = useStore.getState().tasks.find(item => item.title === 'PM handed task');
    return task && { assignedTo: task.assignedTo, projectId: task.projectId, assignmentState: task.assignmentState, responsibleHodId: task.responsibleHodId, createdBy: task.createdBy };
  })).toMatchObject({ assignedTo: 'pm-flow-hod', projectId: 'pm-flow-project' });
  await expect(page.getByText('PM handed task').first()).toBeVisible();
});

test('a PM opens a task, can edit it and sees the project HOD as an assignee', async ({ page }) => {
  await seedPm(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const pm = useStore.getState().currentUser!;
    const now = new Date().toISOString();
    useStore.setState(state => ({ tasks: [{ id: 'pm-flow-task', title: 'Managed by PM', clientId: 'pm-flow-company', clientName: 'Flow Company', projectId: 'pm-flow-project', projectName: 'Flow Project', department: 'Video Shooting', assignedTo: '', createdBy: pm.id, assignedBy: pm.id, status: 'Pending', priority: 'Medium', isCompleted: false, completionPercentage: 0, revisionCount: 0, clientApprovalStatus: 'Pending', comments: [], approvalHistory: [], workHistory: [], workState: {}, predecessorTaskIds: [], startDate: '2026-11-01', dueDate: '2026-11-30', description: '', serviceType: 'Video', visibility: 'internal', isRecurring: false, dueReminderSent: false, updatedAt: now } as never, ...state.tasks] }));
  });
  await page.goto('/tasks?taskId=pm-flow-task');
  const sheet = page.getByRole('dialog', { name: 'Managed by PM' });
  await expect(sheet).toBeVisible();
  // The PM can edit the task and hand it to the project's HOD.
  const edit = sheet.getByRole('button', { name: 'Edit task', exact: true });
  await expect(edit).toBeVisible();
  await edit.click();
  await sheet.getByRole('button', { name: 'Edit', exact: true }).click().catch(() => undefined);
  const assignee = sheet.getByRole('combobox', { name: 'Assignee', exact: true });
  await expect(assignee.getByRole('option', { name: 'Flow HOD (HOD)', exact: true })).toBeAttached();
});
