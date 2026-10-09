import { expect, test, type Page } from '@playwright/test';

const seed = async (page: Page) => {
  await page.goto('/login');
  await page.evaluate(async () => {
    const { useStore, stopBackendAutoSync } = await import('/src/store/index.ts');
    const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
    const { useToastStore } = await import('/src/store/useToastStore.ts');
    stopBackendAutoSync();
    const state = useStore.getState();
    const client = { id: 'role-client', name: 'Customer', role: 'Client', companyName: 'Customer Co', department: 'Client', departments: ['Client'], mustResetPassword: false };
    const staff = { id: 'role-staff', name: 'Contact', role: 'Staff', department: 'Designer', departments: ['Designer'] };
    enablePasswordResetBypass(client.id);
    localStorage.setItem(`aitask:release-notice:2026-08-service-operations:${client.id}`, 'acknowledged');
    const base = { clientName: 'Customer Co', clientId: 'role-company', serviceType: 'Design', description: 'Shared brief', department: 'Designer', assignedTo: staff.id, createdBy: staff.id, startDate: '2026-10-01', dueDate: '2026-10-08', priority: 'Medium', status: 'Waiting Approval', isCompleted: false, completionPercentage: 100, clientApprovalStatus: 'Pending', revisionCount: 0, isRecurring: false, visibility: 'client-visible', comments: [], approvalHistory: [] };
    useStore.setState({ currentUser: client, users: [client, staff], tasks: [{ ...base, id: 'customer-a', title: 'Customer artwork A' }, { ...base, id: 'customer-b', title: 'Customer artwork B' }, { ...base, id: 'customer-private', title: 'Internal secret', visibility: 'internal' }, { ...base, id: 'customer-foreign', title: 'Foreign secret', clientName: 'Other Co' }], clients: [{ id: 'role-company', clientName: 'Customer Co', createdAt: '2026-10-01', updatedAt: '2026-10-01' }], projects: [], clientPlans: [], serviceCycles: [], deliverables: [], cycleComments: [], addons: [], rolePermissions: [], backend: { ...state.backend, mode: 'local', status: 'local', isSaving: false, isPulling: false, hasLocalChanges: false, pendingMutations: 0 } });
    useToastStore.setState({ toasts: [] });
  });
};
const open = async (page: Page) => { await page.goto('/tasks?taskId=customer-a'); return page.getByRole('dialog', { name: 'Delivery details' }); };

test('Customer retries one failed feedback save without duplicating it or wiping newer text', async ({ page }) => {
  await seed(page);
  const dialog = await open(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ commitPendingMutation: async () => ({ ok: false, error: 'Customer save failed' }), retryPendingSave: async () => ({ ok: true }) });
  });
  const feedback = dialog.getByRole('textbox', { name: 'Share feedback' });
  await feedback.fill('Submitted feedback');
  await dialog.getByRole('button', { name: 'Send feedback' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Customer save failed');
  await feedback.fill('New unsent feedback');
  await dialog.getByRole('button', { name: 'Retry save', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(feedback).toHaveValue('New unsent feedback');
  const texts = await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    return useStore.getState().tasks.find(task => task.id === 'customer-a')?.comments?.map(comment => comment.text);
  });
  expect(texts).toEqual(['Submitted feedback']);
});

test('Customer approval does not announce success until persistence is confirmed', async ({ page }) => {
  await seed(page);
  const dialog = await open(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ commitPendingMutation: async () => ({ ok: false, error: 'Approval not saved' }), retryPendingSave: async () => ({ ok: true }) });
  });
  await dialog.getByRole('button', { name: 'Approve delivery' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Approval not saved');
  await expect(dialog.getByText('Needs your review', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Delivered', { exact: true })).toHaveCount(0);
  const successes = () => page.evaluate(async () => {
    const { useToastStore } = await import('/src/store/useToastStore.ts');
    return useToastStore.getState().toasts.filter(toast => toast.type === 'success').map(toast => toast.message);
  });
  expect(await successes()).toEqual([]);
  await dialog.getByRole('button', { name: 'Retry save', exact: true }).click();
  expect(await successes()).toContain('Task approved successfully');
});

test('Customer thrown save errors leave the form available for retry', async ({ page }) => {
  await seed(page);
  const dialog = await open(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ commitPendingMutation: async () => { throw new Error('Customer network interruption'); }, retryPendingSave: async () => ({ ok: true }) });
  });
  await dialog.getByRole('textbox', { name: 'Share feedback' }).fill('Keep this feedback');
  await dialog.getByRole('button', { name: 'Send feedback' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Customer network interruption');
  await expect(dialog.getByRole('button', { name: 'Retry save', exact: true })).toBeEnabled();
});

test('Customer date and service filters survive reload without exposing hidden deliveries', async ({ page }) => {
  await seed(page);
  await page.goto('/tasks?service=Design&date=next_7');
  await page.getByRole('button', { name: /Open delivery filters/ }).click();
  await expect(page.getByRole('combobox', { name: /Service/ })).toHaveValue('Design');
  await expect(page.getByRole('combobox', { name: /Expected date/ })).toHaveValue('next_7');
});

test('Customer keeps newer approval context after a slow save acknowledgement', async ({ page }) => {
  await seed(page);
  const dialog = await open(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ commitPendingMutation: () => new Promise(resolve => { (window as unknown as { finishCustomerSave: () => void }).finishCustomerSave = () => resolve({ ok: true }); }) });
  });
  const note = dialog.getByRole('textbox', { name: 'Decision note' });
  await note.fill('Submitted approval context');
  await dialog.getByRole('button', { name: 'Approve delivery' }).click();
  await note.fill('Newer unsent context');
  await page.evaluate(() => (window as unknown as { finishCustomerSave: () => void }).finishCustomerSave());
  await expect(note).toHaveValue('Newer unsent context');
});

test('Customer late approval acknowledgement cannot affect another account', async ({ page }) => {
  await seed(page);
  const dialog = await open(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ commitPendingMutation: () => new Promise(resolve => { (window as unknown as { finishCustomerSave: () => void }).finishCustomerSave = () => resolve({ ok: true }); }) });
  });
  await dialog.getByRole('button', { name: 'Approve delivery' }).click();
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const current = useStore.getState();
    const client = { ...current.currentUser!, id: 'other-customer' };
    const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
    enablePasswordResetBypass(client.id);
    localStorage.setItem(`aitask:release-notice:2026-08-service-operations:${client.id}`, 'acknowledged');
    useStore.setState({ currentUser: client, users: [client, ...current.users.filter(user => user.role !== 'Client')], tasks: current.tasks.map(task => ({ ...task, clientApprovalStatus: 'Pending', status: 'Waiting Approval', isCompleted: false, approvalHistory: [] })) });
  });
  const note = dialog.getByRole('textbox', { name: 'Decision note' });
  await note.fill('Another account draft');
  await page.evaluate(() => (window as unknown as { finishCustomerSave: () => void }).finishCustomerSave());
  await expect(note).toHaveValue('Another account draft');
  expect(await page.evaluate(async () => { const { useToastStore } = await import('/src/store/useToastStore.ts'); return useToastStore.getState().toasts.filter(toast => toast.type === 'success').length; })).toBe(0);
});

test('Customer Use latest discards a failed approval and retains newer context', async ({ page }) => {
  await seed(page);
  const dialog = await open(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const original = useStore.getState().tasks;
    useStore.setState({ commitPendingMutation: async () => ({ ok: false, error: 'Approval not saved' }), discardMutation: async () => { useStore.setState({ tasks: original }); } });
  });
  const note = dialog.getByRole('textbox', { name: 'Decision note' });
  await note.fill('Submitted context');
  await dialog.getByRole('button', { name: 'Approve delivery' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Approval not saved');
  await expect(dialog.getByText('Needs your review', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Delivered', { exact: true })).toHaveCount(0);
  await note.fill('Revised context');
  page.once('dialog', dialog => dialog.accept());
  await dialog.getByRole('button', { name: 'Use latest', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(note).toHaveValue('Revised context');
  await expect(dialog.getByRole('button', { name: 'Approve delivery' })).toBeEnabled();
});

test('Customer delivery stages refresh automatically at midnight', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-07T23:59:00') });
  await seed(page);
  await page.evaluate(async () => { const { useStore } = await import('/src/store/index.ts'); useStore.setState({ tasks: useStore.getState().tasks.map(task => task.id === 'customer-a' ? { ...task, status: 'Pending', dueDate: '2026-10-07' } : task) }); });
  await page.goto('/tasks?stage=timing_changed');
  await expect(page.getByRole('link', { name: 'Customer artwork A', exact: true })).toHaveCount(0);
  await page.clock.fastForward(120_000);
  await expect(page.getByRole('link', { name: 'Customer artwork A', exact: true })).toBeVisible();
  await expect(page.getByText('Internal secret')).toHaveCount(0);
  await expect(page.getByText('Foreign secret')).toHaveCount(0);
});

test('Customer progress uses the current plan and period while preserving delivery history', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-07T12:00:00') });
  await seed(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const plan = { id: 'current-plan', clientId: 'role-company', clientName: 'Customer Co', name: 'Customer Plan', status: 'Active', revision: 2, origin: 'custom', currency: 'MYR', serviceItems: [], discountType: 'none', discountValue: 0, taxRateBps: 0, startDate: '2026-10-01', billingDay: 1, createdBy: 'role-staff', createdAt: '2026-10-01', updatedAt: '2026-10-01' };
    const cycle = { id: 'current-cycle', clientId: plan.clientId, clientName: plan.clientName, planId: plan.id, planRevision: 2, periodStart: '2026-10-01', periodEnd: '2026-10-31', status: 'Published', createdBy: 'role-staff', createdAt: '2026-10-01', updatedAt: '2026-10-01' };
    const cycles = [{ ...cycle, id: 'old-plan-cycle', planId: 'old-plan' }, { ...cycle, id: 'past-cycle', periodStart: '2026-09-01', periodEnd: '2026-09-30', status: 'Completed' }, { ...cycle, id: 'future-cycle', periodStart: '2026-11-01', periodEnd: '2026-11-30' }, cycle];
    const deliverable = { id: 'ready-output', clientId: plan.clientId, clientName: plan.clientName, cycleId: cycle.id, serviceType: 'Design', title: 'Ready output', platform: '', unit: 'item', quantity: 1, status: 'Ready', taskIds: [], createdAt: '2026-10-01', updatedAt: '2026-10-01' };
    useStore.setState({ clientPlans: [plan], serviceCycles: cycles, deliverables: [deliverable, { ...deliverable, id: 'delivered-output', status: 'Delivered' }, ...cycles.filter(item => item.id !== cycle.id).map(item => ({ ...deliverable, id: `output-${item.id}`, cycleId: item.id, status: 'Delivered' }))] });
  });
  await page.goto('/');
  await expect(page.getByText('50%', { exact: true }).first()).toBeVisible();
  await page.goto('/clients/role-company');
  await expect(page.getByText('50%', { exact: true }).first()).toBeVisible();
  await page.evaluate(async () => { const { useStore } = await import('/src/store/index.ts'); useStore.setState({ serviceCycles: useStore.getState().serviceCycles.filter(item => item.id !== 'current-cycle') }); });
  await expect(page.getByText('No published cycle for this month', { exact: true })).toBeVisible();
  await page.goto('/');
  await expect(page.getByText('No published cycle for this month', { exact: true })).toBeVisible();
});

test('Customer workspace retry reconciles submitted feedback while retaining a newer draft', async ({ page }) => {
  await seed(page);
  const dialog = await open(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ commitPendingMutation: async () => {
      useStore.setState(state => ({ backend: { ...state.backend, mode: 'supabase', status: 'retry_required', hasLocalChanges: true, pendingMutations: 1 } }));
      return { ok: false, error: 'Awaiting confirmation' };
    } });
  });
  const feedback = dialog.getByRole('textbox', { name: 'Share feedback' });
  await feedback.fill('Submitted externally retried feedback');
  await dialog.getByRole('button', { name: 'Send feedback' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Awaiting confirmation');
  await feedback.fill('New draft after failure');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState(state => ({ backend: { ...state.backend, status: 'live', hasLocalChanges: false, pendingMutations: 0 } }));
  });
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(feedback).toHaveValue('New draft after failure');
});

test('Customer failed approval requires confirmation and canonical reload before closing', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await seed(page);
  await page.evaluate(() => localStorage.setItem('aitask-color-theme', 'dark'));
  const dialog = await open(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ commitPendingMutation: async () => ({ ok: false, error: 'Approval not saved' }), discardMutation: async () => { throw new Error('Reload unavailable'); } });
  });
  await dialog.getByRole('button', { name: 'Approve delivery' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Approval not saved');
  await expect(dialog.getByText('Needs your review', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Delivered', { exact: true })).toHaveCount(0);
  page.once('dialog', prompt => prompt.dismiss());
  await dialog.getByRole('button', { name: 'Close panel', exact: true }).click();
  await expect(dialog).toBeVisible();
  page.once('dialog', prompt => prompt.accept());
  await dialog.getByRole('button', { name: 'Close panel', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Reload unavailable');
  await expect(dialog).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/customer-retry-mobile-dark.png' });
});

test('Customer long notes and feedback stay editable without queuing or losing text', async ({ page }) => {
  await seed(page);
  const dialog = await open(page);
  const note = dialog.getByRole('textbox', { name: 'Decision note' });
  const longText = 'a'.repeat(2001);
  await note.fill(longText);
  await dialog.getByRole('button', { name: 'Approve delivery' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Decision notes must be 2,000 characters or less.');
  await expect(note).toHaveValue(longText);
  expect(await page.evaluate(async () => { const { useStore } = await import('/src/store/index.ts'); return useStore.getState().tasks.find(task => task.id === 'customer-a')?.approvalHistory; })).toEqual([]);
  await note.fill('Shortened decision');
  const feedback = dialog.getByRole('textbox', { name: 'Share feedback' });
  await feedback.fill(longText);
  await dialog.getByRole('button', { name: 'Send feedback' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Feedback must be 2,000 characters or less.');
  await expect(feedback).toHaveValue(longText);
  expect(await page.evaluate(async () => { const { useStore } = await import('/src/store/index.ts'); return useStore.getState().tasks.find(task => task.id === 'customer-a')?.comments; })).toEqual([]);
  await feedback.fill('Full feedback after correction');
  await dialog.getByRole('button', { name: 'Send feedback' }).click();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(dialog.getByText('Full feedback after correction', { exact: true })).toBeVisible();
});

test('Customer malformed due dates appear as undated rather than overdue or this month', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-07T12:00:00') });
  await seed(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState(state => ({ tasks: state.tasks.map(task => ({ ...task, status: 'In Progress', dueDate: task.id === 'customer-a' ? '2026-10-99' : '0000-invalid' })) }));
  });
  await page.goto('/tasks?date=no_date');
  await expect(page.getByRole('link', { name: 'Customer artwork A', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Customer artwork B', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Timing changed', exact: true })).toHaveCount(0);
  await page.goto('/tasks?date=this_month');
  await expect(page.getByRole('link', { name: 'Customer artwork A', exact: true })).toHaveCount(0);
});

test('Customer malformed published periods and contract dates do not break the workspace', async ({ page }) => {
  await seed(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const plan = { id: 'bad-date-plan', clientId: 'role-company', clientName: 'Customer Co', name: 'Customer Plan', status: 'Active', revision: 1, origin: 'custom', currency: 'MYR', serviceItems: [], startDate: '2026-10-01', contractEndDate: 'invalid', billingDay: 1, createdAt: '2026-10-01', updatedAt: '2026-10-01' };
    const cycle = { id: 'bad-date-cycle', clientId: plan.clientId, clientName: plan.clientName, planId: plan.id, planRevision: 1, periodStart: 'invalid', periodEnd: '2026-10-31', status: 'Published', createdAt: '2026-10-01', updatedAt: '2026-10-01' };
    useStore.setState({ clientPlans: [plan], serviceCycles: [cycle, { ...cycle, id: 'reversed', periodStart: '2026-11-01', periodEnd: '2026-10-01' }] });
  });
  await page.goto('/clients/role-company');
  await expect(page.getByRole('heading', { name: 'Customer Co', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Deliveries', exact: true }).click();
  await expect(page.getByText('No published deliveries yet', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Services', exact: true }).click();
  await expect(page.getByText('Customer Plan', { exact: true })).toBeVisible();
  await expect(page.getByText('Service reminder', { exact: true })).toHaveCount(0);
});
