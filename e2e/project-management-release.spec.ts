import { expect, test } from '@playwright/test';

for (const mobile of [false, true]) {
  test(`${mobile ? 'mobile' : 'desktop'} PM manages milestones and closes and reopens an assigned project`, async ({ page }) => {
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
    await page.goto('/login');
    // Let the app finish its startup load so seeded state is not overwritten.
    await page.waitForFunction(() => Boolean(document.querySelector('form input, main')));
    await page.evaluate(async () => {
      const { useStore, stopBackendAutoSync } = await import('/src/store/index.ts');
      const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
      stopBackendAutoSync();
      const state = useStore.getState();
      const pm = { id: 'release-pm', name: 'Release PM', role: 'Project Manager', department: 'Management', departments: ['Management'], mustResetPassword: false };
      enablePasswordResetBypass(pm.id);
      localStorage.setItem(`aitask:release-notice:2026-08-service-operations:${pm.id}`, 'acknowledged');
      useStore.setState({
        currentUser: pm, users: [pm], rolePermissions: [], tasks: [], notifications: [],
        clients: [{ id: 'release-company', clientName: 'Release company', createdBy: pm.id, createdAt: '2026-10-01', updatedAt: '2026-10-01' }],
        projects: [{ id: 'release-project', clientId: 'release-company', clientName: 'Release company', projectName: 'Release launch', services: ['Graphic Design'], startDate: '2026-10-01', deadline: '2026-11-30', projectManagerIds: [pm.id], hodMemberIds: [], staffMemberIds: [], createdBy: pm.id, status: 'Active', defaultApprovalMode: 'pm', milestones: [] }],
        registrations: [], clientPlans: [], serviceCycles: [], deliverables: [], cycleComments: [], addons: [], servicePricingSnapshots: [],
        backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 },
      });
    });
    await page.goto('/projects');
    await expect(page.getByRole('heading', { name: 'Release company', exact: true })).toBeVisible();
    const tutorial = page.getByRole('button', { name: 'Explore on my own', exact: true });
    if (await tutorial.isVisible()) await tutorial.click();
    const details = page.getByRole('button', { name: 'Details', exact: true });
    if (await details.isVisible()) await details.click();
    else {
      await page.getByRole('button', { name: 'More actions', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Details', exact: true }).click();
    }
    await page.getByRole('button', { name: 'Open project', exact: true }).click();
    const panel = page.getByRole('dialog', { name: 'Release launch', exact: true });
    await expect(panel).toBeVisible();
    await panel.getByRole('tab', { name: 'Settings', exact: true }).click();
    await expect(panel.getByText('Project default: PM approval', { exact: true })).toBeVisible();
    await panel.getByRole('tab', { name: 'Milestones', exact: true }).click();
    await panel.getByPlaceholder('Milestone name').fill('Launch ready');
    await panel.locator('input[type="date"]').fill('2026-11-30');
    await panel.locator('form select').last().selectOption('Completed');
    await panel.getByRole('button', { name: 'Save milestone', exact: true }).click();
    await expect(panel.getByText('Launch ready', { exact: true })).toBeVisible();
    await panel.getByRole('tab', { name: 'Overview', exact: true }).click();
    await panel.getByRole('button', { name: 'Mark completed', exact: true }).click();
    await panel.getByRole('button', { name: 'Close project', exact: true }).click();
    await expect(panel.getByRole('button', { name: 'Reopen project', exact: true })).toBeVisible();
    await panel.getByRole('tab', { name: 'Milestones', exact: true }).click();
    await expect(panel.getByRole('button', { name: 'Save milestone', exact: true })).toHaveCount(0);
    await panel.getByRole('tab', { name: 'Overview', exact: true }).click();
    await panel.getByRole('button', { name: 'Reopen project', exact: true }).click();
    await expect(panel.getByRole('button', { name: 'Mark completed', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
