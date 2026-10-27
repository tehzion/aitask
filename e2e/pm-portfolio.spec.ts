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
      projects: [{ id: 'pm-project', clientId: 'pm-company', clientName: 'PM Company', projectName: 'Inherited campaign', services: ['Design'], startDate: '2026-10-01', deadline: '', totalTasks: 4, completedTasks: 1, createdBy: boss.id, projectManagerIds: [pm.id] }],
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
  await expect(page.getByRole('heading', { name: 'Requires your action', exact: true })).toBeVisible();
};
const queue = (page: Page, title: string) => page.getByRole('heading', { name: title, exact: true }).locator('../..');

test('PM dashboard separates department, final completion, and customer review', async ({ page }) => {
  await seedPM(page);
  // The Designer HOD reviews this submission; the PM follows up but is not asked to decide.
  await expect(queue(page, 'With department review').getByRole('link', { name: 'Department submission', exact: true })).toBeVisible();
  await expect(queue(page, 'Awaiting your review').getByRole('link', { name: 'Department submission' })).toHaveCount(0);
  await expect(queue(page, 'Client review (optional)').getByRole('link', { name: 'Department submission' })).toHaveCount(0);
  await expect(queue(page, 'Ready to finalize').getByRole('link', { name: 'Signed portfolio work' })).toBeVisible();
  await expect(queue(page, 'Client review (optional)').getByRole('link', { name: 'Customer acceptance pending' })).toBeVisible();
  await expect(page.getByText('Hidden other portfolio', { exact: true })).toHaveCount(0);
  const summary = page.getByRole('definition').locator('..');
  await expect(summary.filter({ hasText: 'Awaiting your review' }).getByRole('definition')).toHaveText('0');
  await expect(summary.filter({ hasText: 'Ready to finalize' }).getByRole('definition')).toHaveText('1');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const a11y = await new AxeBuilder({ page }).include('main').analyze();
  expect(a11y.violations.map(violation => violation.id)).toEqual([]);
});

test('PM can follow signed portfolio work through final completion', async ({ page }) => {
  await seedPM(page);
  await queue(page, 'Ready to finalize').getByRole('link', { name: 'Signed portfolio work' }).click();
  const guided = page.getByRole('dialog', { name: 'Signed portfolio work' });
  await expect(guided).toBeVisible();
  await guided.getByRole('button', { name: 'Confirm completion', exact: true }).click();
  await expect.poll(() => page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const task = useStore.getState().tasks.find(task => task.id === 'pm-final');
    return { status: task?.status, progress: task?.completionPercentage };
  })).toEqual({ status: 'Completed', progress: 100 });
  await page.goto('/');
  await expect(queue(page, 'Ready to finalize').getByRole('link', { name: 'Signed portfolio work' })).toHaveCount(0);
  await expect(queue(page, 'Client review (optional)').getByRole('link', { name: 'Signed portfolio work' })).toBeVisible();
});

test('PM sees completion in both task views while review is pending', async ({ page }) => {
  await seedPM(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/tasks?taskId=pm-submit');
  const dialog = page.getByRole('dialog', { name: 'Department submission' });
  await expect(dialog.getByLabel('Status').getByText('Waiting for review', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Confirm completion', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('combobox', { name: 'Task status', exact: true })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await dialog.getByRole('button', { name: 'Full edit', exact: true }).click();
  await expect(dialog.getByRole('combobox', { name: 'Task status', exact: true })).toHaveCount(0);
  const result = await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    return useStore.getState().updateTaskStatus('pm-submit', 'Completed');
  });
  expect(result.ok).toBe(false);
});

test('PM can complete a waiting task with explicit no-approval mode', async ({ page }) => {
  await seedPM(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState(state => ({ tasks: state.tasks.map(task => task.id === 'pm-submit' ? { ...task, approvalMode: 'none', requiresInternalApproval: false } : task) }));
  });
  await page.goto('/tasks?taskId=pm-submit');
  const dialog = page.getByRole('dialog', { name: 'Department submission' });
  await expect(dialog.getByRole('button', { name: 'Confirm completion', exact: true })).toBeEnabled();
  await page.reload();
  const reopened = page.getByRole('dialog', { name: 'Department submission' });
  await reopened.getByRole('button', { name: 'Confirm completion', exact: true }).click();
  await expect.poll(() => page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const task = useStore.getState().tasks.find(item => item.id === 'pm-submit');
    return { status: task?.status, percent: task?.completionPercentage, completedAt: Boolean(task?.completedAt), signed: Boolean(task?.reviewDecision) };
  })).toEqual({ status: 'Completed', percent: 100, completedAt: true, signed: false });
});

test('PM completes approved work from the full status picker with a custom status list', async ({ page }) => {
  await seedPM(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ taskStatuses: ['Pending', 'In Progress', 'Waiting Approval', 'Cancelled'] });
  });
  await page.goto('/tasks?taskId=pm-final');
  const dialog = page.getByRole('dialog', { name: 'Signed portfolio work' });
  await expect(dialog.getByRole('button', { name: 'Confirm completion', exact: true })).toBeEnabled();
  await expect(dialog.getByRole('combobox', { name: 'Task status', exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Confirm completion', exact: true }).click();
  await expect.poll(() => page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const task = useStore.getState().tasks.find(task => task.id === 'pm-final')!;
    return { status: task.status, completed: task.isCompleted, progress: task.completionPercentage, timestamp: Boolean(task.completedAt) };
  })).toEqual({ status: 'Completed', completed: true, progress: 100, timestamp: true });
  await page.reload();
  await expect(page.getByRole('dialog', { name: 'Signed portfolio work' }).getByLabel('Status').getByText('Completed', { exact: true })).toBeVisible();
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

test('PM delegates assigned work to the department HOD through the full editor', async ({ page }) => {
  await seedPM(page);
  const hodId = await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const state = useStore.getState();
    const source = state.tasks.find(task => task.id === 'pm-edit')!;
    useStore.setState({ tasks: [...state.tasks, { ...source, id: 'pm-direct', title: 'Directly assigned PM work', clientId: undefined, clientName: 'Assigned company', projectId: undefined, projectName: undefined, assignedTo: state.currentUser!.id }] });
    return state.users.find(user => user.role === 'HOD')!.id;
  });
  await page.goto('/tasks?taskId=pm-direct');
  let editor = page.getByRole('dialog', { name: 'Directly assigned PM work' });
  await editor.getByRole('button', { name: 'Full edit', exact: true }).click();
  editor = page.getByRole('dialog', { name: 'Directly assigned PM work' });
  await editor.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(editor.getByRole('combobox', { name: 'Assignee', exact: true })).toBeEnabled();
  await editor.getByRole('combobox', { name: 'Assignee', exact: true }).selectOption(hodId);
  await editor.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await expect.poll(() => page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    return useStore.getState().tasks.find(task => task.id === 'pm-direct')?.assignedTo;
  })).toBe(hodId);
  await page.goto('/');
  await expect(page.getByText('Directly assigned PM work', { exact: true })).toHaveCount(0);
});

test('PM company edits reject foreign scope and save the accessible company ID', async ({ page }) => {
  await seedPM(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const state = useStore.getState();
    useStore.setState({
      clients: [...state.clients, { id: 'pm-second', clientName: 'Second PM company', createdBy: state.currentUser!.id, createdAt: '', updatedAt: '' }],
      tasks: state.tasks.map(task => task.id === 'pm-edit' ? { ...task, projectId: undefined, projectName: undefined } : task),
    });
  });
  await page.goto('/tasks?taskId=pm-edit');
  const editor = page.getByRole('dialog', { name: 'Inherited editable work' });
  await editor.getByRole('button', { name: 'Full edit', exact: true }).click();
  await editor.getByRole('button', { name: 'Edit', exact: true }).click();
  await editor.getByRole('textbox', { name: 'Client / Brand', exact: true }).fill('Foreign Company');
  await editor.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await expect(editor.getByText('This company is outside your portfolio.', { exact: true })).toBeVisible();
  await editor.getByRole('textbox', { name: 'Client / Brand', exact: true }).fill('Second PM company');
  await editor.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await expect.poll(() => page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const task = useStore.getState().tasks.find(task => task.id === 'pm-edit');
    return { id: task?.clientId, name: task?.clientName };
  })).toEqual({ id: 'pm-second', name: 'Second PM company' });
});
