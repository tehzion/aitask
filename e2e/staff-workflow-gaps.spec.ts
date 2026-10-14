import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const title = 'Staff workflow artwork';
const seed = async (page: Page, linked = false) => {
  await page.goto('/login');
  await page.evaluate(async isLinked => {
    const { useStore } = await import('/src/store/index.ts');
    const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
    const s = useStore.getState();
    const staff = s.users.find(user => user.name === 'Staff Demo')!;
    const boss = s.users.find(user => user.isSuperAdmin)!;
    enablePasswordResetBypass(staff.id);
    localStorage.setItem(`aitask:release-notice:2026-08-service-operations:${staff.id}`, 'acknowledged');
    const task = { ...s.tasks[0], id: 'workflow-artwork', title: 'Staff workflow artwork', clientId: undefined, clientName: 'Workflow Company', projectId: undefined, projectName: undefined, department: staff.department, assignedTo: staff.id, createdBy: boss.id, assignedBy: boss.id, status: 'Pending', isCompleted: false, completionPercentage: 0, revisionCount: 0, clientApprovalStatus: 'Pending', comments: [], approvalHistory: [], workHistory: [], workState: {}, predecessorTaskIds: [], serviceCycleId: undefined, deliverableId: isLinked ? 'workflow-output' : undefined, attachmentLink: undefined, attachmentName: undefined, startDate: '2026-10-01', dueDate: '', description: 'Create final artwork', notes: undefined };
    useStore.setState({ currentUser: { ...staff, mustResetPassword: false }, tasks: [task], deliverables: [], serviceCycles: [], clientPlans: [], clients: [], projects: [], notifications: [], backend: { ...s.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 } });
  }, linked);
  await page.goto('/tasks?taskId=workflow-artwork');
  await expect(page.getByRole('dialog', { name: title })).toBeVisible();
};
const saved = (page: Page) => page.evaluate(async () => (await import('/src/store/index.ts')).useStore.getState().tasks[0]);

test('staff drafts survive reload and a successful send removes their recovery copy', async ({ page }) => {
  await seed(page);
  const note = page.getByPlaceholder('Add a work update…');
  await note.fill('Recover my unsent update');
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter(key => key.includes('staff-task')).length)).toBe(1);
  await page.reload();
  await page.getByRole('button', { name: 'Restore draft' }).click();
  await expect(note).toHaveValue('Recover my unsent update');
  await page.getByRole('button', { name: 'Send work update' }).click();
  await expect(note).toHaveValue('');
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter(key => key.includes('staff-task')).length)).toBe(0);
  expect((await saved(page)).comments!.map(item => item.text)).toEqual(['Recover my unsent update']);
});

test('recovered newer input is preserved after a lost earlier acknowledgement', async ({ page }) => {
  await seed(page);
  await page.evaluate(async () => { (await import('/src/store/index.ts')).useStore.setState({ commitPendingMutation: async () => ({ ok: false, error: 'Confirmation lost' }) }); });
  const note = page.getByPlaceholder('Add a work update…');
  await note.fill('Submitted once');
  await page.getByRole('button', { name: 'Send work update' }).click();
  await note.fill('Newer unsent update');
  await page.reload();
  await page.getByRole('button', { name: 'Restore draft' }).click();
  await expect(note).toHaveValue('Newer unsent update');
});

test('recovering an already staged comment cannot offer a duplicate submission', async ({ page }) => {
  await seed(page);
  await page.evaluate(async () => { (await import('/src/store/index.ts')).useStore.setState({ commitPendingMutation: async () => ({ ok: false, error: 'Confirmation lost' }) }); });
  await page.getByPlaceholder('Add a work update…').fill('Submitted once');
  await page.getByRole('button', { name: 'Send work update' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Restore draft' }).click();
  await expect(page.getByPlaceholder('Add a work update…')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Send work update' })).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText('already appears in the task');
});

test('staff accepts an assignment, requests help, resolves it, and sees attributed history after reload', async ({ page }) => {
  await seed(page);
  const sheet = page.getByRole('dialog', { name: title });
  await sheet.getByRole('button', { name: 'Accept assignment' }).click();
  await expect(sheet.getByText('Assignment accepted', { exact: false }).first()).toBeVisible();
  await sheet.getByRole('button', { name: 'Request help or handover' }).click();
  await sheet.getByLabel('What do you need to continue?').fill('Need client assets and a handover from the previous designer');
  await sheet.getByRole('button', { name: 'Send help request' }).click();
  await expect(sheet.getByText('Need client assets and a handover from the previous designer', { exact: true })).toBeVisible();
  expect((await saved(page)).workState!.blocker!.openedBy).toBe((await saved(page)).assignedTo);
  await page.reload();
  await sheet.getByRole('button', { name: 'Clear blocker' }).click();
  await expect(sheet.getByRole('button', { name: 'Clear blocker' })).toHaveCount(0);
  await expect(sheet.getByText('Help request changed', { exact: false }).first()).toBeVisible();
  expect((await saved(page)).workHistory).toHaveLength(3);
});

test('slow help acknowledgement retains a newer help draft', async ({ page }) => {
  await seed(page);
  await page.evaluate(async () => { (await import('/src/store/index.ts')).useStore.setState({ commitPendingMutation: () => new Promise(resolve => { (window as unknown as { finishHelp: () => void }).finishHelp = () => resolve({ ok: true }); }) }); });
  await page.getByRole('button', { name: 'Request help or handover' }).click();
  const reason = page.getByLabel('What do you need to continue?');
  await reason.fill('First help request');
  await page.getByRole('button', { name: 'Send help request' }).click();
  await reason.fill('Later handover request');
  await expect(page.getByRole('dialog', { name: title }).getByText('Awaiting save confirmation')).toBeVisible();
  await page.evaluate(() => (window as unknown as { finishHelp: () => void }).finishHelp());
  await expect(reason).toHaveValue('Later handover request');
  expect((await saved(page)).workState!.blocker!.reason).toBe('First help request');
});

test('discarded help retry retains the draft and cannot announce acknowledgement', async ({ page }) => {
  await seed(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ commitPendingMutation: async () => ({ ok: false, error: 'Help not saved' }), retryPendingSave: async () => {
      useStore.setState(s => ({ tasks: s.tasks.map(task => ({ ...task, workState: {} })) })); return { ok: true };
    } });
  });
  await page.getByRole('button', { name: 'Request help or handover' }).click();
  await page.getByLabel('What do you need to continue?').fill('Keep this request');
  await page.getByRole('button', { name: 'Send help request' }).click();
  await page.getByRole('button', { name: 'Retry save' }).click();
  await expect(page.getByLabel('What do you need to continue?')).toHaveValue('Keep this request');
  await expect(page.getByRole('alert')).toBeVisible();
});

for (const status of ['Waiting Approval']) test(`linked tasks need evidence before ${status}`, async ({ page }) => {
  await seed(page, true);
  const sheet = page.getByRole('dialog', { name: title });
  await sheet.getByRole('combobox', { name: 'All task statuses' }).selectOption(status);
  await expect(sheet.getByRole('alert')).toContainText('Add an output link');
  expect((await saved(page)).status).toBe('Pending');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.getState().updateTaskAttachment('workflow-artwork', 'https://example.com/output');
  });
  await sheet.getByRole('combobox', { name: 'All task statuses' }).selectOption(status);
  await expect.poll(async () => (await saved(page)).status).toBe(status);
  if (status === 'Waiting Approval') {
    await expect(sheet.getByText('Sent for review', { exact: false }).first()).toBeVisible();
    expect((await saved(page)).workState!.reviewRequestedAt).toBeTruthy();
  }
});

test('help and unaccepted filters follow current task state', async ({ page }) => {
  await seed(page);
  await page.goto('/tasks?help=1');
  await expect(page.getByRole('button').filter({ hasText: title })).toHaveCount(0);
  await page.evaluate(async () => (await import('/src/store/index.ts')).useStore.getState().updateTaskWork('workflow-artwork', { kind: 'block', reason: 'Need help' }));
  await expect(page.getByRole('button').filter({ hasText: title })).toBeVisible();
  await page.goto('/tasks?unaccepted=1');
  await expect(page.getByRole('button').filter({ hasText: title })).toBeVisible();
  await page.evaluate(async () => (await import('/src/store/index.ts')).useStore.getState().updateTaskWork('workflow-artwork', { kind: 'accept' }));
  await expect(page.getByRole('button').filter({ hasText: title })).toHaveCount(0);
});

test('read inbox updates remain discoverable while linked work is open', async ({ page }) => {
  await seed(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState(s => ({ notifications: [{ id: 'workflow-notice', title: 'Assigned artwork', message: 'Please finish the artwork', targetUserId: s.currentUser!.id, route: { page: 'tasks', entityId: 'workflow-artwork' }, iconType: 'task', createdAt: new Date().toISOString(), isRead: false, readByUserIds: [] }] }));
  });
  await page.goto('/notifications');
  await page.getByRole('checkbox', { name: 'Open work only' }).check();
  await expect(page.getByText('Assigned artwork', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Mark read', exact: true }).click();
  await expect(page.getByText('Assigned artwork', { exact: true })).toBeVisible();
  expect((await saved(page)).status).toBe('Pending');
  await page.evaluate(async () => (await import('/src/store/index.ts')).useStore.getState().updateTaskStatus('workflow-artwork', 'Cancelled'));
  await expect(page.getByText('Assigned artwork', { exact: true })).toHaveCount(0);
});

test('mobile staff ownership/help controls remain accessible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page);
  await page.getByRole('button', { name: 'Request help or handover' }).click();
  await page.getByLabel('What do you need to continue?').fill('Please clarify the brief');
  expect((await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('Full edit recovery merges newer untouched fields and confirms overlapping changes', async ({ page }) => {
  await seed(page);
  await page.getByRole('button', { name: 'Full edit', exact: true }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Task Title', { exact: true }).fill('Recovered artwork title');
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter(key => key.includes('staff-full-edit')).length)).toBe(1);
  // Simulate a manager's independent edit while Staff has an unsent title.
  await page.evaluate(async () => (await import('/src/store/index.ts')).useStore.setState(s => ({ tasks: s.tasks.map(task => ({ ...task, notes: 'New manager instructions' })) })));
  await page.reload();
  await page.getByRole('button', { name: 'Full edit', exact: true }).click();
  await page.getByRole('button', { name: 'Restore draft' }).click();
  await expect(page.getByLabel('Task Title', { exact: true })).toHaveValue('Recovered artwork title');
  await expect(page.getByRole('textbox', { name: 'Internal Notes', exact: true })).toHaveValue('New manager instructions');
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await expect.poll(async () => (await saved(page)).title).toBe('Recovered artwork title');
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter(key => key.includes('staff-full-edit')).length)).toBe(0);
});

test('Full edit recovery requires a choice for overlapping manager changes', async ({ page }) => {
  await seed(page);
  await page.getByRole('button', { name: 'Full edit', exact: true }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Task Title', { exact: true }).fill('My recovered title');
  await page.evaluate(async () => (await import('/src/store/index.ts')).useStore.setState(s => ({ tasks: s.tasks.map(task => ({ ...task, title: 'Manager updated title' })) })));
  await page.reload();
  await page.getByRole('button', { name: 'Full edit', exact: true }).click();
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Restore draft' }).click();
  await expect(page.getByLabel('Task Title', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Restore draft' })).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Restore draft' }).click();
  await expect(page.getByLabel('Task Title', { exact: true })).toHaveValue('My recovered title');
});


test('Staff completion remains restricted even when linked output evidence exists', async ({ page }) => {
  await seed(page, true);
  const result = await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.getState().updateTaskAttachment('workflow-artwork', 'https://example.com/output');
    return useStore.getState().updateTaskStatus('workflow-artwork', 'Completed');
  });
  expect(result.ok).toBe(false);
  expect(result.error).toContain('Only a project manager can confirm completion');
  expect((await saved(page)).status).toBe('Pending');
  await expect(page.getByRole('combobox', { name: 'All task statuses' }).locator('option[value="Completed"]')).toHaveCount(0);
});
