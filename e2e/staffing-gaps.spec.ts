import { expect, test } from '@playwright/test';

// Team feedback item 7: the Boss sees where work cannot reach a Staff member.
test('the Boss sees departments and projects with staffing gaps', async ({ page }) => {
  await page.goto('/login');
  await page.waitForFunction(() => Boolean(document.querySelector('form input, main')));
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const state = useStore.getState();
    const boss = state.users.find(user => user.isSuperAdmin)!;
    localStorage.setItem(`aitask:release-notice:2026-11-start-wording:${boss.id}`, 'acknowledged');
    useStore.setState({
      currentUser: { ...boss, mustResetPassword: false },
      backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 },
    });
  });
  await page.goto('/');
  await expect(page.getByRole('tab', { name: 'Portfolio', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const state = useStore.getState();
    const boss = state.currentUser!;
    const hod = { id: 'gap-hod', name: 'Gap Shooting HOD', role: 'HOD' as const, departments: ['Video Shooting' as const] };
    useStore.setState({
      users: [...state.users.filter(user => !(user.role === 'Staff' && user.departments.includes('Video Shooting'))), hod],
      projects: [...state.projects,
        { id: 'gap-no-staff', clientId: 'gap-client', clientName: 'Gap Co', projectName: 'Shoot Campaign', services: [], startDate: '2026-01-01', deadline: '', projectManagerIds: [boss.id], hodMemberIds: [hod.id], staffMemberIds: [], createdBy: boss.id, status: 'Active', milestones: [] },
        { id: 'gap-no-hod', clientId: 'gap-client', clientName: 'Gap Co', projectName: 'No Lead Campaign', services: [], startDate: '2026-01-01', deadline: '', projectManagerIds: [boss.id], hodMemberIds: [], staffMemberIds: [], createdBy: boss.id, status: 'Active', milestones: [] },
      ],
      tasks: [...state.tasks, { ...state.tasks[0], id: 'gap-task', title: 'Gap shoot', projectId: 'gap-no-staff', department: 'Video Shooting', status: 'Pending', isCompleted: false, assignedTo: hod.id }],
    } as never);
  });
  await page.getByRole('tab', { name: 'Portfolio', exact: true }).click();
  const panel = page.locator('section', { has: page.getByRole('heading', { name: 'Staffing gaps', exact: true }) }).last();
  await expect(panel).toBeVisible();
  const departments = panel.getByRole('list', { name: 'Departments with no Staff' });
  await expect(departments.getByRole('listitem').filter({ hasText: 'Video Shooting' })).toContainText('HOD: Gap Shooting HOD');
  await expect(panel.getByRole('list', { name: 'Active projects with no Staff' }).getByRole('link', { name: 'Gap Co · Shoot Campaign' })).toBeVisible();
  await expect(panel.getByRole('list', { name: 'Projects with no HOD' })).toContainText('No Lead Campaign');
  await departments.getByRole('link', { name: 'Manage Video Shooting team' }).click();
  await expect(page).toHaveURL(/\/approvals\?tab=members&department=Video(%20|\+)Shooting/);
  await expect(page.getByRole('button', { name: 'Show all departments' })).toBeVisible();
  await expect(page.getByText('Gap Shooting HOD', { exact: true }).filter({ visible: true }).first()).toBeVisible();
});

test('a PM does not see the staffing gaps panel', async ({ page }) => {
  await page.goto('/login');
  await page.waitForFunction(() => Boolean(document.querySelector('form input, main')));
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const state = useStore.getState();
    const pm = state.users.find(user => user.role === 'Project Manager' && !user.isSuperAdmin)!;
    localStorage.setItem(`aitask:release-notice:2026-11-start-wording:${pm.id}`, 'acknowledged');
    useStore.setState({ currentUser: { ...pm, mustResetPassword: false }, backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 } });
  });
  await page.goto('/');
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Staffing gaps', exact: true })).toHaveCount(0);
});
