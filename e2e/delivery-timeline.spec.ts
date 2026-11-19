import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const seedClient = async (page: Page) => {
  await page.goto('/login');
  await page.waitForFunction(() => Boolean(document.querySelector('form input, main')));
  await page.evaluate(async () => {
    const { useStore, stopBackendAutoSync } = await import('/src/store/index.ts');
    const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
    stopBackendAutoSync();
    const client = { id: 'tl-client', name: 'Casey Client', role: 'Client', companyName: 'Timeline Co', department: 'Client', departments: ['Client'], mustResetPassword: false };
    const staff = { id: 'tl-staff', name: 'Sam Staff', role: 'Staff', department: 'Designer', departments: ['Designer'] };
    enablePasswordResetBypass(client.id);
    localStorage.setItem(`aitask:release-notice:2026-11-start-wording:${client.id}`, 'acknowledged');
    const task = {
      id: 'tl-task', clientName: 'Timeline Co', clientId: 'tl-company', title: 'Brochure', serviceType: 'Design', description: 'Print brochure',
      department: 'Designer', assignedTo: staff.id, createdBy: staff.id, startDate: '2026-10-01', dueDate: '2026-10-08', priority: 'Medium',
      status: 'Approved', isCompleted: false, completionPercentage: 80, clientApprovalStatus: 'Pending', revisionCount: 1, isRecurring: false,
      visibility: 'client-visible', comments: [],
      approvalHistory: [{ id: 'h1', userId: client.id, status: 'Rejected', note: 'Colours: too dark', createdAt: '2026-11-03T09:00:00.000Z' }],
    };
    useStore.setState({ currentUser: client, users: [client, staff], tasks: [task] });
  });
};

test('Client taps a reason chip, sends specific feedback and sees it in the timeline', async ({ page }) => {
  await seedClient(page);
  await page.goto('/tasks?taskId=tl-task');
  const dialog = page.getByRole('dialog', { name: 'Delivery details' });
  await expect(dialog.getByRole('list', { name: 'Delivery timeline' })).toContainText('Casey Client');
  await expect(dialog.getByRole('list', { name: 'Delivery timeline' })).not.toContainText('Sam Staff');
  await expect(dialog.getByText('(revision 1)', { exact: true })).toBeVisible();

  const axe = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
  expect(axe.violations.map(item => item.id)).toEqual([]);

  const note = dialog.getByRole('textbox', { name: 'Decision note' });
  await dialog.getByRole('button', { name: 'Layout' }).click();
  await dialog.getByRole('button', { name: 'Brand match' }).click();
  await expect(dialog.getByRole('button', { name: 'Layout' })).toHaveAttribute('aria-pressed', 'true');
  await expect(note).toHaveValue('Layout: \nBrand match: ');
  await note.fill('Layout: move the logo up\nBrand match: use the blue');
  await dialog.getByRole('button', { name: 'Request changes' }).click();
  await expect(dialog.getByText('Layout: move the logo up', { exact: false })).toBeVisible();
  await expect(dialog.getByText('(revision 2)', { exact: true })).toBeVisible();
});

test('Team sees who assigned, reviewed and what the client decided', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/login');
  await page.waitForFunction(() => Boolean(document.querySelector('form input, main')));
  await page.evaluate(async () => {
    localStorage.setItem('aitask:locale', 'en');
    const { useStore } = await import('/src/store/index.ts');
    const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
    const state = useStore.getState();
    const pm = state.users.find(item => item.role === 'Project Manager' && !item.isSuperAdmin)!;
    enablePasswordResetBypass(pm.id);
    localStorage.setItem(`aitask:release-notice:2026-11-start-wording:${pm.id}`, 'acknowledged');
    const staff = state.users.find(user => user.role === 'Staff' && (user.departments || []).includes('Designer'))!;
    const base = { ...state.tasks[0], clientId: undefined, clientName: 'Timeline Co', projectId: undefined, projectName: undefined, department: 'Designer',
      createdBy: pm.id, assignedBy: pm.id, assignedTo: staff.id, comments: [], workHistory: [], workState: {},
      deliverableId: undefined, serviceCycleId: undefined, generatedFromDeliverable: false, workflowStepId: undefined, startDate: '2026-01-01', dueDate: '2099-01-01', visibility: 'client-visible' };
    useStore.setState({
      currentUser: { ...pm, mustResetPassword: false },
      tasks: [{ ...base, id: 'tl-team', title: 'Timeline banner', status: 'Approved', isCompleted: false, revisionCount: 1, clientApprovalStatus: 'Approved',
        assignedAt: '2026-11-01T09:00:00.000Z',
        approvalHistory: [{ id: 'c1', userId: pm.id, status: 'Rejected', note: 'Use the new logo', createdAt: '2026-11-03T09:00:00.000Z' }] }],
      backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 },
    });
  });
  await page.goto('/tasks?taskId=tl-team');
  const timeline = page.getByRole('list', { name: 'Delivery timeline' });
  await expect(timeline).toContainText('assigned this to');
  await expect(timeline).toContainText('requested changes');
  await expect(timeline).toContainText('Use the new logo');
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate(value => localStorage.setItem('aitask-color-theme', value), theme);
    await page.reload();
    await expect(page.getByRole('list', { name: 'Delivery timeline' })).toBeVisible();
    const axe = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
    expect(axe.violations.map(item => `${theme}: ${item.id}`)).toEqual([]);
  }
});

test('Chinese client sees the timeline and reason chips translated', async ({ page }) => {
  await seedClient(page);
  await page.evaluate(() => localStorage.setItem('aitask:locale', 'zh'));
  await page.goto('/tasks?taskId=tl-task');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: '版面' })).toBeVisible();
  await expect(dialog.getByRole('list', { name: '交付时间线' })).toContainText('第 1 轮修改');
});
