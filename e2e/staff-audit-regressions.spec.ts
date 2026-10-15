import { test, expect, type Page } from '@playwright/test';

test.use({ timezoneId: 'Asia/Kuala_Lumpur' });

const seed = async (page: Page, waiting = false) => {
  await page.goto('/login');
  await page.evaluate(async isWaiting => {
    const { useStore, stopBackendAutoSync } = await import('/src/store/index.ts');
    const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
    stopBackendAutoSync();
    const old = useStore.getState();
    const user = { id: 'audit-worker', name: 'Audit Worker', role: 'Staff', departments: ['Designer'], mustResetPassword: false };
    const hod = { id: 'audit-hod', name: 'Audit HOD Contact', role: 'HOD', departments: ['Designer'] };
    const pm = { id: 'audit-pm', name: 'Audit PM', role: 'Project Manager', departments: ['Management'] };
    enablePasswordResetBypass(user.id);
    localStorage.setItem('aitask:locale', 'en');
    localStorage.setItem(`aitask:release-notice:2026-08-service-operations:${user.id}`, 'acknowledged');
    const task = { id: 'audit-work', title: 'Audit artwork', clientName: 'Audit Company', serviceType: 'Design', description: '', department: 'Designer', assignedTo: user.id, assignedBy: hod.id, createdBy: pm.id, startDate: '2026-10-01', dueDate: '2026-10-15', priority: 'Medium', status: isWaiting ? 'Waiting Approval' : 'Pending', isCompleted: false, completionPercentage: isWaiting ? 60 : 20, revisionCount: 0, clientApprovalStatus: 'Pending', isRecurring: false, visibility: 'internal' };
    useStore.setState({ currentUser: user, users: [user, hod, pm], tasks: [task], clients: [], projects: [], notifications: [], rolePermissions: [], serviceCycles: [], deliverables: [], clientPlans: [], backend: { ...old.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 } });
  }, waiting);
  await page.goto(waiting ? '/tasks?taskId=audit-work' : '/tasks');
};

test('All work refreshes urgency and due labels at local midnight', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-14T15:59:50Z') });
  await page.clock.pauseAt(new Date('2026-10-14T15:59:59Z'));
  await seed(page);
  await expect(page.getByRole('tab', { name: /Up next/ })).toContainText('1');
  await expect(page.getByText('Due in 1 day', { exact: true })).toBeVisible();
  await page.clock.runFor(2000);
  await expect(page.getByRole('tab', { name: /Needs action/ })).toContainText('1');
  await expect(page.getByRole('tab', { name: /Up next/ })).toContainText('0');
  await expect(page.getByText('Due today', { exact: true })).toBeVisible();
});

test('All work catches up on focus after a suspended date boundary', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-14T15:59:50Z') });
  await page.clock.pauseAt(new Date('2026-10-14T15:59:59Z'));
  await seed(page);
  await page.clock.setSystemTime(new Date('2026-10-14T16:00:01Z'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('tab', { name: /Needs action/ })).toContainText('1');
  await expect(page.getByText('Due today', { exact: true })).toBeVisible();
});

test('Staff review enquiry notifies the displayed HOD contact and PM', async ({ page }) => {
  await seed(page, true);
  const sheet = page.getByRole('dialog', { name: 'Audit artwork' });
  await expect(sheet.getByText('Audit HOD Contact', { exact: true })).toBeVisible();
  await sheet.getByRole('button', { name: 'Request review update', exact: true }).click();
  await sheet.getByLabel('What review update do you need?').fill('Please share the review result');
  await sheet.getByRole('button', { name: 'Request review update', exact: true }).last().click();
  await expect.poll(() => page.evaluate(async () => (await import('/src/store/index.ts')).useStore.getState().notifications
    .filter(item => item.title === 'New Comment' && item.targetUserId?.startsWith('audit-'))
    .map(item => item.targetUserId).sort())).toEqual(['audit-hod', 'audit-pm']);
  await expect(sheet.getByText('Please share the review result', { exact: true })).toBeVisible();
});
