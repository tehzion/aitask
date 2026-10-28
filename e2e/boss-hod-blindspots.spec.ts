import { expect, test, type Page } from '@playwright/test';

const seed = async (page: Page, role: 'boss' | 'hod') => {
  await page.goto('/login');
  await expect(page.getByLabel('Email or username')).toBeVisible();
  await page.evaluate(async role => {
    const { useStore, stopBackendAutoSync } = await import('/src/store/index.ts');
    const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
    stopBackendAutoSync();
    const state = useStore.getState();
    const boss = { id: 'blind-boss', name: 'Boss', role: 'Project Manager' as const, isSuperAdmin: true, departments: ['Management' as const] };
    const hod = { id: 'blind-hod', name: 'Department HOD', role: 'HOD' as const, departments: ['Video Shooting' as const, 'Video Editor' as const] };
    const staff = { id: 'blind-staff', name: 'Shared Worker', role: 'Staff' as const, departments: ['Video Shooting' as const, 'Video Editor' as const] };
    const actor = role === 'boss' ? boss : hod;
    enablePasswordResetBypass(actor.id);
    localStorage.setItem(`aitask:release-notice:2026-08-service-operations:${actor.id}`, 'acknowledged');
    localStorage.setItem('aitask:locale', 'en');
    const base = { clientName: 'Blindspot Co', serviceType: 'Video', description: '', startDate: '2026-10-01', dueDate: '', status: 'Pending', priority: 'Medium', completionPercentage: 0, isCompleted: false, revisionCount: 0, clientApprovalStatus: 'Pending', isRecurring: false, comments: [], approvalHistory: [], visibility: 'internal', createdBy: boss.id };
    useStore.setState({
      currentUser: actor, users: [boss, hod, staff], rolePermissions: [],
      tasks: [
        { ...base, id: 'blind-shoot', title: 'Shooting work', department: 'Video Shooting', assignedTo: staff.id },
        { ...base, id: 'blind-edit', title: 'Editing work', department: 'Editor', assignedTo: staff.id },
        { ...base, id: 'blind-assigned', title: 'HOD assigned work', department: 'Video Editor', assignedTo: hod.id },
      ],
      clients: [], projects: [], clientPlans: [], serviceCycles: [], deliverables: [], cycleComments: [], registrations: [], notifications: [],
      backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 },
    });
  }, role);
};

for (const mobile of [false, true]) {
  test(`${mobile ? 'mobile' : 'desktop'} workload includes secondary departments and counts tasks once`, async ({ page }) => {
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
    await seed(page, 'boss');
    await page.goto('/');
    await page.getByRole('tab', { name: 'Team workload', exact: true }).click();
    const workload = page.getByRole('region', { name: 'Team workload', exact: true });
    await workload.getByRole('combobox', { name: 'Filter team by department' }).selectOption('Video Editor');
    await expect(workload.getByText('Shared Worker', { exact: true }).filter({ visible: true })).toBeVisible();
    await workload.getByRole('button', { name: 'By department', exact: true }).click();
    await expect(workload.getByText('Assigned tasks are counted in their task department, once per task.')).toBeVisible();
    if (mobile) {
      const card = workload.locator('.xl\\:hidden').getByText('Video Editor', { exact: true }).locator('..').locator('..');
      await expect(card.getByText('Open', { exact: true }).locator('..').getByText('2', { exact: true })).toBeVisible();
    } else {
      const row = workload.getByRole('row').filter({ hasText: 'Video Editor' });
      await expect(row.getByRole('cell').nth(3)).toHaveText('2');
    }
    await workload.getByRole('combobox', { name: 'Filter team by department' }).selectOption('Video Shooting');
    if (!mobile) {
      const row = workload.getByRole('row').filter({ hasText: 'Video Shooting' });
      await expect(row.getByRole('cell').nth(3)).toHaveText('1');
    }
  });
}

test('HOD department oversight has edit controls without deletion; delegation removes destructive authority', async ({ page }) => {
  await seed(page, 'hod');
  const open = async (id: string, title: string) => {
    await page.goto(`/tasks?taskId=${id}`);
    const dialog = page.getByRole('dialog', { name: title });
    await expect(dialog).toBeVisible();
    const fullEdit = dialog.getByRole('button', { name: 'Edit task', exact: true });
    if (await fullEdit.isVisible()) await fullEdit.click();
    return page.getByRole('dialog', { name: title });
  };
  const oversight = await open('blind-edit', 'Editing work');
  await expect(oversight.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
  await expect(oversight.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
  const assigned = await open('blind-assigned', 'HOD assigned work');
  await expect(assigned.getByRole('button', { name: 'Delete', exact: true })).toBeVisible();
  await assigned.getByRole('combobox', { name: 'Choose a team member' }).selectOption('blind-staff');
  await assigned.getByRole('button', { name: 'Assign Task', exact: true }).click();
  await expect(assigned.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
  await expect(assigned.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
  const scope = await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const { getHodScopeTasks } = await import('/src/lib/staffWorkspace.ts');
    const state = useStore.getState();
    const task = state.tasks.find(task => task.id === 'blind-assigned')!;
    return { creator: task.createdBy, assignedBy: task.assignedBy, delegated: getHodScopeTasks(state.tasks, state.currentUser?.id, 'delegated').map(task => task.id) };
  });
  expect(scope).toEqual({ creator: 'blind-boss', assignedBy: 'blind-hod', delegated: ['blind-assigned'] });
});
