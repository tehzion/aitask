import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const seedPM = async (page: Page) => {
  page.on('dialog', dialog => void dialog.accept());
  await page.goto('/login');
  await expect(page.getByLabel('Email or username')).toBeVisible();
  await page.evaluate(async () => {
    const { useStore, stopBackendAutoSync } = await import('/src/store/index.ts');
    const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
    const state = useStore.getState();
    const pm = state.users.find(user => user.role === 'Project Manager' && !user.isSuperAdmin)!;
    const boss = state.users.find(user => user.isSuperAdmin)!;
    const worker = state.users.find(user => user.role === 'Staff' && user.id !== pm.id)!;
    enablePasswordResetBypass(pm.id);
    localStorage.setItem(`aitask:release-notice:2026-08-service-operations:${pm.id}`, 'acknowledged');
    const base = { clientId: 'pm-company', clientName: 'PM Company', projectId: 'pm-project', projectName: 'Inherited campaign', serviceType: 'Design', description: '', department: 'Designer', assignedTo: worker.id, createdBy: boss.id, startDate: '2026-10-01', dueDate: '', priority: 'Medium', completionPercentage: 0, isCompleted: false, revisionCount: 0, clientApprovalStatus: 'Pending', isRecurring: false, visibility: 'client-visible', comments: [], approvalHistory: [], attachmentLink: 'https://example.com/output.pdf' };
    useStore.setState({
      currentUser: { ...pm, mustResetPassword: false }, rolePermissions: [],
      clients: [{ id: 'pm-company', clientName: 'PM Company', createdBy: pm.id, createdAt: '2026-10-01', updatedAt: '2026-10-01' }],
      projects: [{ id: 'pm-project', clientId: 'pm-company', clientName: 'PM Company', projectName: 'Inherited campaign', services: ['Design'], startDate: '2026-10-01', deadline: '', totalTasks: 4, completedTasks: 1, createdBy: boss.id }],
      tasks: [
        { ...base, id: 'pm-submit', title: 'Department submission', status: 'Waiting Approval', completionPercentage: 70 },
        { ...base, id: 'pm-final', title: 'Signed portfolio work', status: 'Approved', completionPercentage: 80 },
        { ...base, id: 'pm-customer', title: 'Customer acceptance pending', status: 'Completed', isCompleted: true, completionPercentage: 100 },
        { ...base, id: 'pm-edit', title: 'Inherited editable work', status: 'Pending' },
        { ...base, id: 'pm-hidden', title: 'Hidden other portfolio', clientId: 'foreign-company', clientName: 'Foreign Company', projectId: undefined, status: 'Approved' },
      ],
      clientPlans: [], serviceCycles: [], deliverables: [], addons: [], cycleComments: [], servicePricingSnapshots: [], notifications: [],
      backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 },
    });
    stopBackendAutoSync();
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Portfolio delivery', exact: true })).toBeVisible();
};
const queue = (page: Page, title: string) => page.getByRole('heading', { name: title, exact: true }).locator('../..');

test('PM dashboard separates department, final completion, and customer review', async ({ page }) => {
  await seedPM(page);
  await expect(queue(page, 'Internal review').getByRole('link', { name: 'Department submission', exact: true })).toBeVisible();
  await expect(queue(page, 'Client approval').getByRole('link', { name: 'Department submission' })).toHaveCount(0);
  await expect(queue(page, 'Confirm completion').getByRole('link', { name: 'Signed portfolio work' })).toBeVisible();
  await expect(queue(page, 'Client approval').getByRole('link', { name: 'Customer acceptance pending' })).toBeVisible();
  await expect(page.getByText('Hidden other portfolio', { exact: true })).toHaveCount(0);
  const metric = page.getByText('Waiting review', { exact: true }).locator('..');
  await expect(metric.getByText('3', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const a11y = await new AxeBuilder({ page }).include('main').analyze();
  expect(a11y.violations.map(violation => violation.id)).toEqual([]);
});

test('PM can follow signed portfolio work through final completion', async ({ page }) => {
  await seedPM(page);
  await queue(page, 'Confirm completion').getByRole('link', { name: 'Signed portfolio work' }).click();
  const guided = page.getByRole('dialog', { name: 'Signed portfolio work' });
  await expect(guided).toBeVisible();
  await guided.getByRole('button', { name: 'Confirm completion', exact: true }).click();
  await expect.poll(() => page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const task = useStore.getState().tasks.find(task => task.id === 'pm-final');
    return { status: task?.status, progress: task?.completionPercentage };
  })).toEqual({ status: 'Completed', progress: 100 });
  await page.goto('/');
  await expect(queue(page, 'Confirm completion').getByRole('link', { name: 'Signed portfolio work' })).toHaveCount(0);
  await expect(queue(page, 'Client approval').getByRole('link', { name: 'Signed portfolio work' })).toHaveCount(0);
});

test('PM saves a routine edit to a task in an inherited project', async ({ page }) => {
  await seedPM(page);
  await page.goto('/tasks?taskId=pm-edit');
  const guided = page.getByRole('dialog', { name: 'Inherited editable work' });
  await guided.getByRole('button', { name: 'Full edit', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Inherited editable work' });
  await editor.getByRole('button', { name: 'Edit', exact: true }).click();
  await editor.getByRole('combobox', { name: 'Priority', exact: true }).selectOption('High');
  await editor.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await expect.poll(() => page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    return useStore.getState().tasks.find(task => task.id === 'pm-edit')?.priority;
  })).toBe('High');
  await expect(editor.getByRole('alert')).toHaveCount(0);
});
