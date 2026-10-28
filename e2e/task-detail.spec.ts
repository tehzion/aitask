import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe.configure({ timeout: 90_000 });

const STAFF = 'u-staff-demo-local';
const HOD = 'u-hod-demo-local';
const PM = 'u-admin';

type Extra = Record<string, unknown>;

// One project with an ordinary task and, optionally, a delivery-linked task.
const seed = async (page: Page, actorId: string, task: Extra = {}, linked = false) => {
  page.on('dialog', dialog => void dialog.accept());
  await page.goto('/login');
  await page.waitForFunction(() => Boolean(document.querySelector('form input')));
  await page.evaluate(async ({ actorId, task, linked }) => {
    const { useStore, stopBackendAutoSync } = await import('/src/store/index.ts');
    const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
    const state = useStore.getState();
    const now = new Date().toISOString();
    for (const id of ['u-staff-demo-local', 'u-hod-demo-local', 'u-admin', 'u-boss']) {
      enablePasswordResetBypass(id);
      localStorage.setItem(`aitask:release-notice:2026-08-service-operations:${id}`, 'acknowledged');
    }
    localStorage.setItem('aitask:locale', 'en');
    const day = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); };
    const base = {
      id: 'td-task', title: 'Follow-up call with client', description: 'Confirm the shoot date by phone.', clientId: 'td-company', clientName: 'TD Company',
      projectId: 'td-project', projectName: 'TD Launch', serviceType: 'Account', department: 'Designer', assignedTo: 'u-staff-demo-local',
      assignedBy: 'u-hod-demo-local', createdBy: 'u-admin', startDate: day(-3), dueDate: day(4), priority: 'Medium', status: 'Pending',
      isCompleted: false, completionPercentage: 0, revisionCount: 0, clientApprovalStatus: 'Pending', isRecurring: false,
      visibility: 'internal', comments: [], approvalHistory: [], workHistory: [], updatedAt: now, approvalMode: 'hod',
    };
    useStore.setState({
      currentUser: { ...state.users.find(user => user.id === actorId)!, mustResetPassword: false },
      clients: [{ id: 'td-company', clientName: 'TD Company', createdBy: 'u-admin', createdAt: day(-30), updatedAt: day(-30) }],
      projects: [{ id: 'td-project', clientId: 'td-company', clientName: 'TD Company', projectName: 'TD Launch', services: ['Account'], startDate: day(-30), deadline: day(30), createdBy: 'u-admin', projectManagerIds: ['u-admin'], hodMemberIds: ['u-hod-demo-local'], staffMemberIds: ['u-staff-demo-local'] }],
      deliverables: linked ? [{ id: 'td-deliverable', clientId: 'td-company', clientName: 'TD Company', cycleId: 'td-cycle', title: 'Monthly banner set', status: 'In Progress', taskIds: ['td-task'], attachments: [] }] : [],
      serviceCycles: [], clientPlans: [], notifications: [], registrations: [],
      tasks: [{ ...base, ...(linked ? { deliverableId: 'td-deliverable', serviceCycleId: 'td-cycle' } : {}), ...task }],
      backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 },
    });
    localStorage.setItem('aitask:onboarding:v1', JSON.stringify(Object.fromEntries(['u-staff-demo-local', 'u-hod-demo-local', 'u-admin', 'u-boss'].map(id => [id, { status: 'skipped', updatedAt: now }]))));
    stopBackendAutoSync();
  }, { actorId, task, linked });
};

const openAs = async (page: Page, actorId: string) => {
  await page.evaluate(async id => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ currentUser: { ...useStore.getState().users.find(user => user.id === id)!, mustResetPassword: false } });
  }, actorId);
  await page.goto('/tasks?taskId=td-task');
  const panel = page.getByRole('dialog', { name: 'Follow-up call with client' });
  await expect(panel).toBeVisible();
  return panel;
};

const saved = (page: Page) => page.evaluate(async () => {
  const { useStore } = await import('/src/store/index.ts');
  const task = useStore.getState().tasks.find(item => item.id === 'td-task')!;
  return { status: task.status, isCompleted: task.isCompleted, revisionCount: task.revisionCount, attachmentLink: task.attachmentLink, history: (task.workHistory || []).length };
});

test('A: an ordinary task is started and sent for review without any attachment', async ({ page }) => {
  await seed(page, STAFF);
  const panel = await openAs(page, STAFF);
  await expect(panel.getByText('Optional', { exact: true })).toBeVisible();
  await expect(panel.getByText(/output link or upload a deliverable/i)).toHaveCount(0);
  await expect(panel.getByText('Assignment acceptance is not recorded.')).toHaveCount(0);
  await panel.getByRole('button', { name: 'Start work', exact: true }).click();
  await expect.poll(() => saved(page).then(task => task.status)).toBe('In Progress');
  const send = panel.getByRole('button', { name: 'Send for review', exact: true });
  await expect(send).toBeEnabled();
  await send.click();
  await expect.poll(() => saved(page).then(task => task.status)).toBe('Waiting Approval');
  await expect(panel.getByText('Reviewer', { exact: true })).toBeVisible();
  await expect(panel.getByText(/HOD Demo/).first()).toBeVisible();
});

test('B: an optional link can be added and the task is still submitted normally', async ({ page }) => {
  await seed(page, STAFF, { status: 'In Progress' });
  const panel = await openAs(page, STAFF);
  await panel.getByRole('button', { name: 'Edit task', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Follow-up call with client' });
  await editor.getByLabel('Attachment URL').fill('https://example.com/call-notes');
  await editor.getByPlaceholder('Attachment label').fill('Call notes');
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(() => saved(page).then(task => task.attachmentLink)).toBe('https://example.com/call-notes');
  await page.goto('/tasks?taskId=td-task');
  const reopened = page.getByRole('dialog', { name: 'Follow-up call with client' });
  await expect(reopened.getByRole('link', { name: /Call notes/ })).toBeVisible();
  await reopened.getByRole('button', { name: 'Send for review', exact: true }).click();
  await expect.poll(() => saved(page).then(task => task.status)).toBe('Waiting Approval');
});

test('C: a delivery-linked task still requires its output before review', async ({ page }) => {
  await seed(page, STAFF, { status: 'In Progress' }, true);
  const panel = await openAs(page, STAFF);
  await expect(panel.getByText('This task delivers a client deliverable. Add its output before sending it for review.')).toBeVisible();
  await expect(panel.getByText('Add the required output before submitting.')).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Send for review', exact: true })).toBeDisabled();
  const blocked = await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    return useStore.getState().updateTaskStatus('td-task', 'Waiting Approval');
  });
  expect(blocked.ok).toBe(false);
  expect((await saved(page)).status).toBe('In Progress');
});

test('D: with approval disabled the assignee completes the task directly', async ({ page }) => {
  await seed(page, STAFF, { status: 'In Progress', approvalMode: 'none', requiresInternalApproval: false });
  const panel = await openAs(page, STAFF);
  await expect(panel.getByRole('button', { name: 'Send for review', exact: true })).toHaveCount(0);
  await panel.getByRole('button', { name: 'Complete task', exact: true }).click();
  await expect.poll(() => saved(page)).toMatchObject({ status: 'Completed', isCompleted: true });
});

test('E: with approval required the HOD approves and the PM completes', async ({ page }) => {
  await seed(page, STAFF, { status: 'In Progress' });
  let panel = await openAs(page, STAFF);
  await expect(panel.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
  await panel.getByRole('button', { name: 'Send for review', exact: true }).click();
  await expect.poll(() => saved(page).then(task => task.status)).toBe('Waiting Approval');
  panel = await openAs(page, HOD);
  await panel.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect.poll(() => saved(page).then(task => task.status)).toBe('Approved');
  panel = await openAs(page, PM);
  await panel.getByRole('button', { name: 'Confirm completion', exact: true }).click();
  await expect.poll(() => saved(page)).toMatchObject({ status: 'Completed', isCompleted: true });
});

test('F: a requested revision returns the work and it can be resubmitted', async ({ page }) => {
  await seed(page, HOD, { status: 'Waiting Approval', completionPercentage: 60 });
  let panel = await openAs(page, HOD);
  await panel.getByRole('button', { name: 'Add note', exact: true }).click();
  await panel.getByLabel('Revision note (optional)').fill('Please confirm the time as well.');
  await panel.getByRole('button', { name: 'Request revision', exact: true }).click();
  await expect.poll(() => saved(page)).toMatchObject({ status: 'In Progress', revisionCount: 1 });
  panel = await openAs(page, STAFF);
  await expect(panel.getByText('Revision 1', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: /^(Send|Resubmit) for review$/ }).click();
  await expect.poll(() => saved(page).then(task => task.status)).toBe('Waiting Approval');
});

test('G: a completed task keeps its status and history after a refresh', async ({ page }) => {
  await seed(page, STAFF, { status: 'In Progress', approvalMode: 'none', requiresInternalApproval: false });
  let panel = await openAs(page, STAFF);
  await panel.getByRole('button', { name: 'Complete task', exact: true }).click();
  await expect.poll(() => saved(page).then(task => task.status)).toBe('Completed');
  await page.reload();
  panel = page.getByRole('dialog', { name: 'Follow-up call with client' });
  await expect(panel.getByText('Completed', { exact: true }).first()).toBeVisible();
  for (const action of ['Send for review', 'Complete task', 'Start work']) {
    await expect(panel.getByRole('button', { name: action, exact: true })).toHaveCount(0);
  }
  await panel.locator('summary', { hasText: 'History' }).click();
  await expect(panel.getByText(/Status/).first()).toBeVisible();
  expect((await saved(page)).history).toBeGreaterThan(0);
});

test('H: users without authority cannot approve or complete', async ({ page }) => {
  await seed(page, STAFF, { status: 'Waiting Approval', completionPercentage: 60 });
  const panel = await openAs(page, STAFF);
  await expect(panel.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Request revision', exact: true })).toHaveCount(0);
  const attempts = await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    return [useStore.getState().updateTaskStatus('td-task', 'Approved').ok, useStore.getState().updateTaskStatus('td-task', 'Completed').ok];
  });
  expect(attempts).toEqual([false, false]);
  expect((await saved(page)).status).toBe('Waiting Approval');
});

const LONG_TITLE = 'Follow-up call with client about the revised launch schedule, banner sizes and the delivery checklist';

for (const width of [320, 390, 768, 1024, 1440]) {
  test(`task panel fits, wraps long titles and stays accessible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await seed(page, STAFF, { status: 'In Progress', title: LONG_TITLE });
    await page.goto('/tasks?taskId=td-task');
    const panel = page.getByRole('dialog', { name: LONG_TITLE });
    await expect(panel).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const title = panel.getByRole('heading', { name: LONG_TITLE });
    const [titleBox, panelBox] = await Promise.all([title.boundingBox(), panel.boundingBox()]);
    expect((titleBox?.x ?? 0) + (titleBox?.width ?? 0)).toBeLessThanOrEqual((panelBox?.x ?? 0) + (panelBox?.width ?? 0) + 1);
    const send = panel.getByRole('button', { name: 'Send for review', exact: true });
    await expect(send).toBeInViewport();
    await send.focus();
    await expect(send).toBeFocused();
    if (width === 390 || width === 1440) {
      const results = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
      expect(results.violations.map(violation => violation.id)).toEqual([]);
    }
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
  });
}

test('task panel labels read naturally in Simplified Chinese', async ({ page }) => {
  await seed(page, STAFF, { status: 'In Progress' });
  await page.evaluate(() => localStorage.setItem('aitask:locale', 'zh'));
  await page.goto('/tasks?taskId=td-task');
  const panel = page.getByRole('dialog');
  await expect(panel.getByText('附件和链接', { exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: '编辑任务', exact: true })).toBeVisible();
});
