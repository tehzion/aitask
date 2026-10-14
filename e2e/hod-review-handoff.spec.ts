import { expect, test } from '@playwright/test';

test('staff submission reaches the department HOD inbox and opens pending work', async ({ page }) => {
  await page.goto('/login');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
    const state = useStore.getState();
    const staff = { ...state.users.find(user => user.name === 'Staff Demo')!, id: 'handoff-staff', department: 'Designer', departments: ['Designer'], mustResetPassword: false };
    const hod = { ...staff, id: 'handoff-hod', name: 'Review HOD', role: 'HOD', customRoleId: undefined, customRoleName: undefined };
    enablePasswordResetBypass(staff.id);
    enablePasswordResetBypass(hod.id);
    for (const user of [staff, hod]) localStorage.setItem(`aitask:release-notice:2026-08-service-operations:${user.id}`, 'acknowledged');
    localStorage.setItem('aitask:locale', 'en');
    useStore.setState({ currentUser: staff, users: [staff, hod], rolePermissions: [], clients: [], projects: [], clientPlans: [], deliverables: [], serviceCycles: [], notifications: [], tasks: [{ ...state.tasks[0], id: 'handoff-task', title: 'Artwork for HOD review', clientName: 'Handoff Company', clientId: undefined, projectId: undefined, department: 'Designer', assignedTo: staff.id, assignedBy: hod.id, createdBy: hod.id, status: 'In Progress', isCompleted: false, revisionCount: 0, completionPercentage: 50, predecessorTaskIds: [], deliverableId: undefined, serviceCycleId: undefined, visibility: 'internal', comments: [], approvalHistory: [] }], backend: { ...state.backend, mode: 'local', status: 'local', pendingMutations: 0, hasLocalChanges: false } });
  });
  await page.goto('/tasks?taskId=handoff-task');
  await page.getByRole('button', { name: 'Send for review', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Waiting for review', exact: true })).toBeDisabled();
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ currentUser: useStore.getState().users.find(user => user.id === 'handoff-hod')! });
  });
  await page.goto('/notifications');
  await expect(page.getByRole('heading', { name: 'Ready for department review', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await expect(page).toHaveURL(/taskId=handoff-task/);
  await expect(page.getByRole('dialog', { name: 'Artwork for HOD review' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'All task statuses' })).toHaveValue('Waiting Approval');
});
