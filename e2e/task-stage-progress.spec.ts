import { expect, test, type Page } from '@playwright/test';

const openAs = async (page: Page, actorId: string) => {
  await page.evaluate(async id => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ currentUser: useStore.getState().users.find(user => user.id === id)! });
  }, actorId);
  await page.goto('/tasks?taskId=stage-task');
  await expect(page.getByRole('dialog', { name: actorId === 'stage-client' ? 'Delivery details' : 'Stage artwork', exact: true })).toBeVisible();
};

test('milestone progress follows role actions from assignment through revision and PM completion', async ({ page }) => {
  test.setTimeout(60_000);
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
    useStore.setState({ currentUser: users[0], users, rolePermissions: [], projects: [], clientPlans: [], deliverables: [], serviceCycles: [], notifications: [], clients: [{ id: 'stage-company', clientName: 'Stage Company', createdBy: 'stage-pm', createdAt: '2026-10-01', updatedAt: '2026-10-01' }], tasks: [{ ...state.tasks[0], generatedFromDeliverable: false, workflowStepId: undefined, workflowStepKind: undefined, workflowDependenciesReady: undefined, internalReview: undefined, id: 'stage-task', title: 'Stage artwork', clientId: 'stage-company', clientName: 'Stage Company', projectId: undefined, deliverableId: undefined, serviceCycleId: undefined, department: 'Designer', assignedTo: '', assignedBy: 'stage-pm', createdBy: 'stage-pm', status: 'Pending', isCompleted: false, completionPercentage: 0, revisionCount: 0, clientApprovalStatus: 'Pending', visibility: 'client-visible', predecessorTaskIds: [], workState: {}, workHistory: [], comments: [], approvalHistory: [] }], backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 } });
    if (!useStore.getState().updateTaskAssignee('stage-task', 'stage-hod').ok) throw new Error('PM assignment failed');
  });
  await page.goto('/clients?period=all');
  await expect(page.getByRole('progressbar', { name: 'Work progress', exact: true })).toHaveAttribute('aria-valuenow', '10');
  await openAs(page, 'stage-hod');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    if (!useStore.getState().updateTaskAssignee('stage-task', 'stage-staff').ok) throw new Error('HOD delegation failed');
  });
  await openAs(page, 'stage-staff');
  const progress = page.getByRole('progressbar', { name: 'Task progress', exact: true });
  await expect(progress).toHaveAttribute('aria-valuenow', '20');
  await page.getByRole('button', { name: 'Accept assignment', exact: true }).click();
  await expect(progress).toHaveAttribute('aria-valuenow', '30');
  await page.getByRole('button', { name: 'Start work', exact: true }).click();
  await page.getByRole('button', { name: 'Send for review', exact: true }).click();
  await expect(progress).toHaveAttribute('aria-valuenow', '60');
  await expect(page.getByRole('button', { name: 'Complete task', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
  await openAs(page, 'stage-hod');
  await page.getByRole('button', { name: 'Request Revision', exact: true }).click();
  await expect(progress).toHaveAttribute('aria-valuenow', '50');
  await openAs(page, 'stage-staff');
  await page.getByRole('button', { name: 'Send for review', exact: true }).click();
  await expect(progress).toHaveAttribute('aria-valuenow', '60');
  await openAs(page, 'stage-hod');
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(progress).toHaveAttribute('aria-valuenow', '80');
  await expect(page.getByRole('button', { name: 'Confirm completion', exact: true })).toHaveCount(0);
  await openAs(page, 'stage-client');
  await page.getByRole('button', { name: 'Approve delivery', exact: true }).click();
  await expect(page.getByRole('progressbar', { name: 'Delivery progress', exact: true })).toHaveAttribute('aria-valuenow', '80');
  await openAs(page, 'stage-pm');
  await page.getByRole('button', { name: 'Confirm completion', exact: true }).click();
  await expect(progress).toHaveAttribute('aria-valuenow', '100');
  await page.goto('/clients?period=all');
  await expect(page.getByRole('progressbar', { name: 'Work progress', exact: true })).toHaveAttribute('aria-valuenow', '100');
});
