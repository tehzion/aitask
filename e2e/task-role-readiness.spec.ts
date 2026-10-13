import { expect, test, type Page } from '@playwright/test';

const openAs = async (page: Page, actorId: string) => {
  await page.evaluate(async id => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ currentUser: useStore.getState().users.find(user => user.id === id)! });
  }, actorId);
  await page.goto('/tasks?taskId=stage-task');
  await expect(page.getByRole('dialog', { name: actorId === 'stage-client' ? 'Delivery details' : 'Stage artwork', exact: true })).toBeVisible();
};

const seed = async (page: Page) => {
  await page.goto('/login');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
    const state = useStore.getState();
    const base = state.users.find(user => user.name === 'Staff Demo')!;
    const member = (id: string, role: 'Staff' | 'HOD' | 'Project Manager' | 'Client') => ({ ...base, id, name: id, role, departments: role === 'Client' ? ['Client'] : ['Designer'], department: role === 'Client' ? 'Client' : 'Designer', companyName: role === 'Client' ? 'Stage Company' : undefined, customRoleId: undefined, customRoleName: undefined, permissions: undefined, isSuperAdmin: false, mustResetPassword: false });
    const users = [member('stage-pm', 'Project Manager'), member('stage-hod', 'HOD'), member('stage-staff', 'Staff'), member('stage-client', 'Client')];
    for (const user of users) { enablePasswordResetBypass(user.id); localStorage.setItem(`aitask:release-notice:2026-08-service-operations:${user.id}`, 'acknowledged'); }
    localStorage.setItem('aitask:locale', 'en');
    useStore.setState({ currentUser: users[0], users, rolePermissions: [], projects: [], clientPlans: [], deliverables: [], serviceCycles: [], notifications: [], clients: [{ id: 'stage-company', clientName: 'Stage Company', createdBy: 'stage-pm', createdAt: '2026-10-01', updatedAt: '2026-10-01' }], tasks: [{ ...state.tasks[0], id: 'stage-task', title: 'Stage artwork', clientId: 'stage-company', clientName: 'Stage Company', projectId: undefined, deliverableId: undefined, serviceCycleId: undefined, department: 'Designer', assignedTo: '', assignedBy: 'stage-pm', createdBy: 'stage-pm', status: 'Pending', isCompleted: false, completionPercentage: 0, revisionCount: 0, clientApprovalStatus: 'Pending', visibility: 'client-visible', predecessorTaskIds: [], workState: {}, workHistory: [], comments: [], approvalHistory: [] }], backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 } });
    if (!useStore.getState().updateTaskAssignee('stage-task', 'stage-hod').ok) throw new Error('PM assignment failed');
  });
};

test('legacy HOD can delegate and approve through the full editor without completing for the PM', async ({ page }) => {
  await seed(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ users: useStore.getState().users.map(user => user.id === 'stage-hod' ? { ...user, role: 'Staff' as const, customRoleId: 'builtin-hod' } : user) });
  });
  await openAs(page, 'stage-hod');
  await page.getByRole('button', { name: 'Full edit', exact: true }).click();
  await page.getByRole('combobox', { name: 'Choose a team member', exact: true }).selectOption('stage-staff');
  await page.getByRole('button', { name: 'Assign Task', exact: true }).click();
  await expect(page.getByRole('progressbar', { name: 'Task progress', exact: true })).toHaveAttribute('aria-valuenow', '20');
  await openAs(page, 'stage-staff');
  await page.getByRole('button', { name: 'Start work', exact: true }).click();
  await page.getByRole('button', { name: 'Send for review', exact: true }).click();
  await openAs(page, 'stage-hod');
  await page.getByRole('button', { name: 'Full edit', exact: true }).click();
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByRole('progressbar', { name: 'Task progress', exact: true })).toHaveAttribute('aria-valuenow', '80');
  await expect(page.getByRole('button', { name: 'Confirm completion', exact: true })).toHaveCount(0);
});

test('customer revision returns to Staff and requires another HOD approval before PM completion', async ({ page }) => {
  test.setTimeout(60_000);
  await seed(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ tasks: useStore.getState().tasks.map(task => ({ ...task, status: 'Approved', assignedTo: 'stage-staff', completionPercentage: 80 })) });
  });
  await openAs(page, 'stage-client');
  await page.getByPlaceholder('Add context for the team…').fill('Use the new artwork');
  await page.getByRole('button', { name: 'Request changes', exact: true }).click();
  await expect(page.getByRole('progressbar', { name: 'Delivery progress', exact: true })).toHaveAttribute('aria-valuenow', '50');
  await openAs(page, 'stage-pm');
  await expect(page.getByRole('button', { name: 'Confirm completion', exact: true })).toHaveCount(0);
  await openAs(page, 'stage-staff');
  await page.getByRole('button', { name: 'Send for review', exact: true }).click();
  await openAs(page, 'stage-hod');
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await openAs(page, 'stage-client');
  await page.getByRole('button', { name: 'Approve delivery', exact: true }).click();
  await openAs(page, 'stage-pm');
  await page.getByRole('button', { name: 'Confirm completion', exact: true }).click();
  await expect(page.getByRole('progressbar', { name: 'Task progress', exact: true })).toHaveAttribute('aria-valuenow', '100');
});

test('a missing department HOD shows an actionable error and does not claim a successful submission', async ({ page }) => {
  await seed(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ users: useStore.getState().users.filter(user => user.id !== 'stage-hod'), tasks: useStore.getState().tasks.map(task => ({ ...task, assignedTo: 'stage-staff', status: 'In Progress', completionPercentage: 30 })) });
  });
  await openAs(page, 'stage-staff');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const { getDepartmentReviewers } = await import('/src/lib/taskWorkflowAccess.ts');
    const state = useStore.getState();
    const reviewers = new Set(getDepartmentReviewers(state.users, state.tasks[0], state.rolePermissions).map(user => user.id));
    useStore.setState({ users: state.users.filter(user => !reviewers.has(user.id)), backend: { ...state.backend, mode: 'local', status: 'local' } });
  });
  await page.getByRole('button', { name: 'Send for review', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('No HOD is configured for this department.');
  await expect(page.getByRole('progressbar', { name: 'Task progress', exact: true })).toHaveAttribute('aria-valuenow', '30');
});
