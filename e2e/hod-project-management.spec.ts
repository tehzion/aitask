import { expect, test } from '@playwright/test';

test('assigned HOD updates project details and staff without changing ownership', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/login');
  const fixture = await page.evaluate(async () => {
    const { useStore, stopBackendAutoSync } = await import('/src/store/index.ts');
    const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
    stopBackendAutoSync();
    const state = useStore.getState();
    const pm = { id: 'hod-project-pm', name: 'Project PM', role: 'Project Manager' as const, department: 'Management' as const, departments: ['Management' as const], mustResetPassword: false };
    const hod = { id: 'hod-project-hod', name: 'Project HOD', role: 'HOD' as const, department: 'Designer' as const, departments: ['Designer' as const], mustResetPassword: false };
    const staff = { id: 'hod-project-staff', name: 'Release Staff', role: 'Staff' as const, department: 'Designer' as const, departments: ['Designer' as const], mustResetPassword: false };
    enablePasswordResetBypass(hod.id);
    localStorage.setItem(`aitask:release-notice:2026-10-project-workflows:${hod.id}`, 'acknowledged');
    localStorage.setItem(`aitask:release-notice:2026-11-start-wording:${hod.id}`, 'acknowledged');
    useStore.setState({
      currentUser: hod,
      users: [hod, pm, staff],
      rolePermissions: [],
      tasks: [],
      notifications: [],
      clients: [{ id: 'hod-project-company', clientName: 'HOD Company', createdBy: pm.id, createdAt: '2026-10-01', updatedAt: '2026-10-01' }],
      projects: [{
        id: 'hod-project', clientId: 'hod-project-company', clientName: 'HOD Company',
        projectName: 'HOD project', services: ['Graphic Design'], startDate: '2026-10-01', deadline: '2026-11-30',
        projectManagerIds: [pm.id], hodMemberIds: [hod.id], staffMemberIds: [],
        createdBy: pm.id, status: 'Active', defaultApprovalMode: 'hod', milestones: [],
      }],
      registrations: [], clientPlans: [], serviceCycles: [], deliverables: [], cycleComments: [], addons: [], servicePricingSnapshots: [],
      backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 },
    });
    return { projectId: 'hod-project', staffName: staff.name };
  });

  await page.goto('/projects');
  const tutorial = page.getByRole('button', { name: 'Explore on my own', exact: true });
  if (await tutorial.isVisible()) await tutorial.click();
  await expect(page.getByRole('heading', { name: 'HOD Company', exact: true })).toBeVisible();
  const details = page.getByRole('button', { name: 'Details', exact: true });
  if (await details.isVisible()) await details.click();
  else {
    await page.getByRole('button', { name: 'More actions', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Details', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Edit project', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit project' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Company name')).toBeDisabled();
  await expect(dialog.getByText('Project staff', { exact: true })).toBeVisible();

  await dialog.getByLabel('Project name').fill('HOD project updated');
  await dialog.locator('label', { hasText: fixture.staffName }).locator('input[type="checkbox"]').check();
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect.poll(() => page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const project = useStore.getState().projects.find(item => item.id === 'hod-project');
    return project ? { name: project.projectName, staff: project.staffMemberIds, hods: project.hodMemberIds, pms: project.projectManagerIds } : null;
  })).toEqual({
    name: 'HOD project updated',
    staff: ['hod-project-staff'],
    hods: ['hod-project-hod'],
    pms: ['hod-project-pm'],
  });
});
