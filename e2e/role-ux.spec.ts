import { expect, test, type Page } from '@playwright/test';

// Role UX enhancements (10 Nov 2026): HOD waiting badge and Assign to… from
// the list, and PM bulk approve.


const start = async (page: Page) => {
  await page.goto('/login');
  await page.waitForFunction(() => Boolean(document.querySelector('form input, main')));
};

test('an HOD sees what waits on them and assigns from the list', async ({ page }) => {
  await start(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
    const state = useStore.getState();
    const template = state.users.find(user => user.name === 'Staff Demo')!;
    const staff = { ...template, id: 'ux-staff', name: 'Designer Staff', department: 'Designer', departments: ['Designer'], mustResetPassword: false };
    const hod = { ...staff, id: 'ux-hod', name: 'Designer HOD', role: 'HOD', customRoleId: undefined, customRoleName: undefined };
    enablePasswordResetBypass(hod.id);
    localStorage.setItem(`aitask:release-notice:2026-11-everyday-saves:${hod.id}`, 'acknowledged');
    localStorage.setItem('aitask:locale', 'en');
    const task = {
      ...(state.tasks[0] as object), generatedFromDeliverable: false, workflowStepId: undefined, workflowStepKind: undefined, workflowDependenciesReady: undefined,
      internalReview: undefined, clientId: undefined, projectId: undefined, predecessorTaskIds: [], dependencies: [], deliverableId: undefined,
      serviceCycleId: undefined, visibility: 'internal', comments: [], approvalHistory: [], revisionCount: 0, isCompleted: false,
      id: 'ux-assign', title: 'Banner for the HOD to hand out', clientName: 'UX Company', department: 'Designer', status: 'Pending',
      assignedTo: hod.id, responsibleHodId: hod.id, assignmentState: 'pending_hod', assignedBy: hod.id, createdBy: hod.id,
    };
    useStore.setState({
      currentUser: hod, users: [staff, hod], rolePermissions: [], clients: [], projects: [], clientPlans: [], deliverables: [], serviceCycles: [], notifications: [],
      tasks: [task] as never,
      backend: { ...state.backend, mode: 'local', status: 'local', pendingMutations: 0, hasLocalChanges: false },
    });
  });
  await page.goto('/tasks');
  const welcome = page.getByRole('dialog', { name: 'Welcome to AiTask' });
  await welcome.getByRole('button', { name: 'Explore on my own' }).click({ timeout: 5000 }).catch(() => undefined);
  await expect(page.getByRole('link', { name: /1 to assign · 0 to review/ }).first()).toBeVisible();
  const picker = page.getByRole('combobox', { name: 'Assign to…: Banner for the HOD to hand out' });
  await expect(picker).toBeVisible();
  await picker.selectOption('ux-staff');
  await expect(picker).toHaveCount(0);
  const assignee = await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    return useStore.getState().tasks.find(item => item.id === 'ux-assign')?.assignedTo;
  });
  expect(assignee).toBe('ux-staff');
  await expect(page.getByRole('link', { name: /to assign/ })).toHaveCount(0);
});

test('a PM approves several submitted tasks at once', async ({ page }) => {
  await start(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const state = useStore.getState();
    const pm = state.users.find(user => user.role === 'Project Manager' && !user.isSuperAdmin)!;
    localStorage.setItem(`aitask:release-notice:2026-11-everyday-saves:${pm.id}`, 'acknowledged');
    useStore.setState({
      currentUser: { ...pm, mustResetPassword: false },
      backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 },
    });
  });
  await page.goto('/');
  await page.getByRole('dialog', { name: 'Welcome to AiTask' }).getByRole('button', { name: 'Explore on my own' }).click({ timeout: 5000 }).catch(() => undefined);
  // Seed after the page load, which reloads the workspace data.
  const titles = await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const state = useStore.getState();
    const pm = state.currentUser!;
    const project = state.projects.find(item => item.projectManagerIds?.includes(pm.id))!;
    const staff = state.users.find(user => user.role === 'Staff' && user.status !== 'Inactive')!;
    const template = state.tasks.find(task => task.projectId === project.id) || state.tasks.find(task => task.clientName);
    if (!template) throw new Error('no task to copy');
    const submitted = [0, 1].map(index => ({
      ...template, projectId: project.id, projectName: project.projectName, clientId: project.clientId, clientName: project.clientName || template.clientName, id: `ux-review-${index}`, title: `Submitted artwork ${index + 1}`, status: 'Waiting Approval' as const, isCompleted: false,
      assignedTo: staff.id, createdBy: pm.id, predecessorTaskIds: [], dependencies: [], workflowStepId: undefined, workflowStepKind: undefined, generatedFromDeliverable: false,
      deliverableId: undefined, approvalMode: 'pm' as const, reviewAccess: undefined, workState: { reviewRequestedBy: staff.id, reviewRequestedAt: '2026-11-09T00:00:00Z' },
    }));
    // The second is a client-approval step: approving it shows it to the client (gap audit).
    submitted[1] = { ...submitted[1], workflowStepKind: 'client_approval' as const };
    useStore.setState({ tasks: [...state.tasks.filter(task => task.status !== 'Waiting Approval'), ...submitted] });
    return submitted.map(task => task.title);
  });
  const panel = page.locator('section', { has: page.getByRole('heading', { name: 'Approve several at once' }) }).last();
  await expect(panel).toBeVisible();
  for (const title of titles) await panel.getByRole('checkbox', { name: `Select: ${title}` }).check();
  await expect(panel.getByRole('listitem').filter({ hasText: titles[1] })).toContainText('Sends to client');
  await expect(panel.getByRole('listitem').filter({ hasText: titles[0] })).not.toContainText('Sends to client');
  await panel.getByRole('button', { name: 'Approve selected (2)' }).click();
  const confirm = page.getByRole('dialog', { name: 'Approve 2 tasks?' });
  await expect(confirm).toContainText('1 of these will be sent to the client.');
  await confirm.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '2 of 2 approved.' })).toBeVisible();
  const statuses = await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    return useStore.getState().tasks.filter(task => task.id.startsWith('ux-review-')).map(task => task.status);
  });
  expect(statuses).toEqual(['Approved', 'Approved']);
});
