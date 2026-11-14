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
    localStorage.setItem(`aitask:release-notice:2026-11-start-wording:${hod.id}`, 'acknowledged');
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
    localStorage.setItem(`aitask:release-notice:2026-11-start-wording:${pm.id}`, 'acknowledged');
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

// Role audit and gap fixes (10 Nov 2026).

type Seed = { member: string; tasks?: Record<string, unknown>[]; plans?: Record<string, unknown>[]; onlyMember?: boolean };

/**
 * Signs a demo member in locally (no password) and replaces the work with
 * `tasks`, built on a copy of a demo task. Plans keep a demo plan's shape.
 */
const seedRole = async (page: Page, route: string, seed: Seed) => {
  await start(page);
  // Establish the demo session before navigating to a protected route.
  await page.evaluate(async name => {
    const { useStore } = await import("/src/store/index.ts");
    const state = useStore.getState();
    const member = state.users.find(user => user.name === name);
    if (!member) throw new Error(`Demo member not found: ${name}`);
    const { enablePasswordResetBypass } = await import("/src/lib/auth.ts");
    enablePasswordResetBypass(member.id);
    localStorage.setItem(`aitask:release-notice:2026-11-start-wording:${member.id}`, "acknowledged");
    localStorage.setItem("aitask:locale", "en");
    useStore.setState({ currentUser: { ...member, mustResetPassword: false } });
  }, seed.member);
  await page.goto(route);
  await page.waitForURL(url => url.pathname === route);
  await expect(page.locator("main h1")).toBeVisible();
  await page.getByRole("dialog", { name: "Welcome to AiTask" }).getByRole("button", { name: "Explore on my own" }).click({ timeout: 3000 }).catch(() => undefined);
  await page.evaluate(async input => {
    const { useStore } = await import('/src/store/index.ts');
    const state = useStore.getState();
    const member = { ...state.users.find(user => user.name === input.member)!, mustResetPassword: false };
    localStorage.setItem(`aitask:release-notice:2026-11-start-wording:${member.id}`, 'acknowledged');
    localStorage.setItem('aitask:locale', 'en');
    const base = {
      ...(state.tasks[0] as object), generatedFromDeliverable: false, workflowStepId: undefined, workflowStepKind: undefined, workflowDependenciesReady: undefined,
      internalReview: undefined, projectId: undefined, predecessorTaskIds: [], dependencies: [], deliverableId: undefined, serviceCycleId: undefined,
      visibility: 'internal', comments: [], approvalHistory: [], revisionCount: 0, isCompleted: false, clientId: undefined, clientName: 'UX Company',
      department: member.department, assignedTo: member.id, createdBy: member.id, dueDate: '2099-12-31', status: 'Pending',
    };
    const plan = state.clientPlans[0];
    useStore.setState({
      currentUser: member,
      users: input.onlyMember ? [member] : state.users,
      tasks: (input.tasks || []).map(task => ({ ...base, ...task, ...(task.assignedTo === '$me' ? { assignedTo: member.id } : {}) })) as never,
      clientPlans: (input.plans || []).map(item => ({ ...plan, ...item })) as never,
      projects: [], deliverables: [], serviceCycles: [], notifications: [],
      backend: { ...state.backend, mode: 'local', status: 'local', pendingMutations: 0, hasLocalChanges: false },
    });
  }, seed);
};

const dayKey = (offset: number) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

test('a Staff task waiting on a hidden earlier step cannot be started', async ({ page }) => {
  await seedRole(page, '/', { member: 'Staff Demo', tasks: [{ id: 'ux-wait', title: 'Edit after the shoot', predecessorTaskIds: ['not-visible'] }] });
  await expect(page.getByRole('heading', { name: 'Nothing can start yet' })).toBeVisible();
  await page.getByRole('link', { name: 'All work' }).first().click();
  const card = page.locator('article').filter({ hasText: 'Edit after the shoot' });
  await expect(card).toContainText('Waiting on: an earlier step you cannot see');
  await expect(page.getByRole('button', { name: 'Start work: Edit after the shoot' })).toHaveCount(0);
});

test('an HOD with no Staff to hand out to is told so on the card', async ({ page }) => {
  await seedRole(page, '/tasks', {
    member: 'HOD Demo', onlyMember: true,
    tasks: [{ id: 'ux-handout', title: 'Poster nobody can take', assignedTo: '$me', assignmentState: 'pending_hod' }],
  });
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const me = useStore.getState().currentUser!.id;
    useStore.setState({ tasks: useStore.getState().tasks.map(task => ({ ...task, responsibleHodId: me, assignedBy: me })) });
  });
  await expect(page.locator('article').filter({ hasText: 'Poster nobody can take' })).toContainText('No Staff to assign');
});

test('a PM sees Send to client on a client-approval step', async ({ page }) => {
  await seedRole(page, '/tasks', {
    member: 'Project Manager Demo',
    tasks: [{ id: 'ux-client-step', title: 'Client Approval for the launch video', status: 'Waiting Approval', workflowStepKind: 'client_approval', approvalMode: 'pm', assignedTo: 'other-staff' }],
  });
  await expect(page.getByRole('button', { name: 'Send to client: Client Approval for the launch video' })).toBeVisible();
});

test('Account staff see plans ending soon on their home', async ({ page }) => {
  await seedRole(page, '/', {
    member: 'Account Demo',
    tasks: [{ id: 'ux-invoice', title: 'Send the November invoice', clientId: 'ux-co', clientName: 'Renewal Co' }],
    plans: [
      { id: 'ux-plan-soon', clientId: 'ux-co', clientName: 'Renewal Co', name: 'Growth Plan', status: 'Active', contractEndDate: dayKey(1) },
    ],
  });
  const renewals = page.getByRole('region', { name: 'Upcoming renewals' });
  await expect(renewals).toContainText('Renewal Co');
  await expect(renewals).toContainText('Ends tomorrow');
});

test('a task save note shows Saving, then Not saved after a failed save', async ({ page }) => {
  await seedRole(page, '/tasks', { member: 'Staff Demo', tasks: [{ id: 'ux-save', title: 'Caption draft', status: 'In Progress' }] });
  const card = page.locator('article').filter({ hasText: 'Caption draft' });
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const { markTasksChanged } = await import('/src/lib/taskSaveMarks.ts');
    const backend = useStore.getState().backend;
    markTasksChanged(['ux-save'], backend.lastSavedAt);
    useStore.setState({ backend: { ...backend, hasLocalChanges: true, pendingMutations: 1, status: 'saving' } });
  });
  await expect(card.locator('[data-task-save-note]')).toHaveText('Saving…');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const { markTaskSavesFailed } = await import('/src/lib/taskSaveMarks.ts');
    const backend = useStore.getState().backend;
    markTaskSavesFailed(backend.lastSavedAt, true);
    useStore.setState({ backend: { ...backend, hasLocalChanges: false, pendingMutations: 0, status: 'local' } });
  });
  await expect(card.locator('[data-task-save-note]')).toHaveText('Not saved');
});

test('HOD sees other departments’ staff totals without task links', async ({ page }) => {
  await seedRole(page, '/', { member: 'HOD Demo', tasks: [] });
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const state = useStore.getState();
    const staff = state.users.find(user => user.role === 'Staff')!;
    const other = { ...staff, id: 'workload-other-staff', name: 'Other department staff', department: 'Video Editor' as const, departments: ['Video Editor' as const] };
    const base = state.tasks[0] || { status: 'Pending', isCompleted: false };
    useStore.setState({ users: [...state.users, other], tasks: [{ ...base, id: 'workload-private', title: 'Private other department task', assignedTo: other.id, department: 'Video Editor', dueDate: '2000-01-01', status: 'Pending', isCompleted: false } as never] });
  });
  const summary = page.getByRole('region', { name: 'Staff workload across departments' });
  const other = summary.locator('article').filter({ hasText: 'Other department staff' });
  await expect(other).toContainText('Active tasks');
  await expect(other.locator('dd')).toHaveText(['1', '1', '0']);
  await expect(other.getByRole('link')).toHaveCount(0);
  await expect(summary).not.toContainText('Private other department task');
});
