import { expect, test } from '@playwright/test';

// Click reduction (10 Nov 2026): act from the list, bulk month decisions,
// one-click suggested links and remembered Create task choices.

const monthStart = (offsetMonths = 0) => {
  const today = new Date();
  const date = new Date(today.getFullYear(), today.getMonth() + offsetMonths, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
};

const seedPublishedMonth = async (page: import('@playwright/test').Page) => {
  await page.goto('/login');
  await page.waitForFunction(() => Boolean(document.querySelector('form input, main')));
  return page.evaluate(async start => {
    const { useStore } = await import('/src/store/index.ts');
    const state = useStore.getState();
    const boss = state.users.find(user => user.isSuperAdmin)!;
    localStorage.setItem(`aitask:release-notice:2026-11-everyday-saves:${boss.id}`, 'acknowledged');
    useStore.setState({
      currentUser: { ...boss, mustResetPassword: false },
      clients: [], clientPlans: [], serviceCycles: [], deliverables: [], tasks: [], addons: [],
      backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 },
    });
    const created = useStore.getState().createClientWithPlan({
      clientName: 'Clicks Co', planName: 'Clicks Plan', origin: 'custom',
      serviceItems: [{ id: 'posts', name: 'Social Posts', platforms: ['Instagram'], unit: 'post', quantity: 2, unitPriceMinor: 10000 }],
      startDate: start, billingDay: 1, discountType: 'none', discountValue: 0, taxRateBps: 0,
    });
    if (!created.ok) throw new Error(created.error);
    const plan = useStore.getState().clientPlans.find(item => item.clientId === created.clientId)!;
    const activated = useStore.getState().activateClientPlan(plan.id);
    if (!activated.ok) throw new Error(activated.error);
    const published = useStore.getState().setServiceCycleStatus(activated.cycleId!, 'Published');
    if (!published.ok) throw new Error(published.error);
    return created.clientId!;
  }, monthStart());
};

const addProject = (page: import('@playwright/test').Page, clientId: string) => page.evaluate(async id => {
  const { useStore } = await import('/src/store/index.ts');
  const boss = useStore.getState().currentUser!;
  useStore.setState({
    projects: [{ id: 'clicks-project', clientId: id, clientName: 'Clicks Co', projectName: 'Clicks Campaign', services: ['Design'], startDate: '2026-01-01', deadline: '', projectManagerIds: [], hodMemberIds: [], staffMemberIds: [], createdBy: boss.id, status: 'Active', defaultApprovalMode: 'pm', milestones: [] }],
  });
}, clientId);

test('a likely task is linked to a deliverable in one click', async ({ page }) => {
  const clientId = await seedPublishedMonth(page);
  await page.goto(`/clients/${clientId}`);
  await expect(page.getByRole('tab', { name: 'Plan & delivery', exact: true })).toBeVisible();
  await addProject(page, clientId);
  await page.evaluate(async id => {
    const { useStore } = await import('/src/store/index.ts');
    const state = useStore.getState();
    const cycle = state.serviceCycles.find(item => item.clientId === id)!;
    const base = { status: 'Pending', description: '', clientId: id, clientName: 'Clicks Co', projectId: 'clicks-project', projectName: 'Clicks Campaign', department: 'Designer' as const, serviceType: 'Design', priority: 'Medium' as const, startDate: cycle.periodStart, visibility: 'internal' as const, assignedTo: '', createdBy: state.currentUser!.id, approvalMode: 'pm' as const, customerDetails: '', notes: '', facebookPage: '', website: '', attachmentLink: '', attachmentName: '', milestoneId: undefined };
    for (const extra of [{ title: 'Social carousel for launch', dueDate: cycle.periodEnd }, { title: 'Logo refresh', dueDate: '' }]) {
      const taskId = state.addTask({ ...base, ...extra } as Parameters<typeof state.addTask>[0]);
      if (!taskId) throw new Error('task not created');
    }
  }, clientId);
  const suggestion = page.getByRole('button', { name: 'Link suggested task: Social carousel for launch → Social Posts 2' });
  await expect(suggestion).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Link a task: Social Posts 2' }).locator('option').nth(1)).toHaveText(/^Social carousel for launch/);
  await suggestion.click();
  await expect(suggestion).toHaveCount(0);
  const linkedTitle = await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const state = useStore.getState();
    const task = state.tasks.find(item => item.title === 'Social carousel for launch')!;
    return state.deliverables.find(item => item.id === task.deliverableId)?.title;
  });
  expect(linkedTitle).toBe('Social Posts 2');
});

test('several ended months are cancelled together from the dashboard', async ({ page }) => {
  await seedPublishedMonth(page);
  await page.goto('/');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const state = useStore.getState();
    const current = state.serviceCycles[0];
    const key = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const start = new Date(`${current.periodStart}T00:00:00`);
    const month = (offset: number, id: string) => ({ ...current, id, status: 'Draft' as const, publishedAt: undefined, periodStart: key(new Date(start.getFullYear(), start.getMonth() - offset, 1)), periodEnd: key(new Date(start.getFullYear(), start.getMonth() - offset + 1, 0)) });
    useStore.setState({ serviceCycles: [...state.serviceCycles, month(2, 'old-a'), month(1, 'old-b')] });
  });
  await page.getByRole('tab', { name: 'Portfolio', exact: true }).click();
  const panel = page.locator('section', { has: page.getByRole('heading', { name: 'Months to tidy up' }) }).last();
  await expect(panel.getByText('Never published', { exact: true })).toHaveCount(2);
  for (const box of await panel.getByRole('checkbox', { name: /^Select: Clicks Co · / }).all()) await box.check();
  await panel.getByRole('button', { name: 'Cancel month (2)' }).click();
  const dialog = page.getByRole('dialog', { name: 'Cancel 2 months?' });
  await dialog.getByRole('button', { name: 'Cancel months' }).click();
  await expect(page.getByRole('status').filter({ hasText: '2 months saved.' })).toBeVisible();
  const statuses = await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    return useStore.getState().serviceCycles.filter(cycle => cycle.id.startsWith('old-')).map(cycle => cycle.status);
  });
  expect(statuses).toEqual(['Cancelled', 'Cancelled']);
});

test('Staff start their work from the list without opening the task', async ({ page }) => {
  await page.goto('/login');
  await page.waitForFunction(() => Boolean(document.querySelector('form input, main')));
  const title = await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const state = useStore.getState();
    const staff = state.users.find(user => user.role === 'Staff' && user.status !== 'Inactive')!;
    localStorage.setItem(`aitask:release-notice:2026-11-everyday-saves:${staff.id}`, 'acknowledged');
    const task = state.tasks.find(item => item.assignedTo === staff.id && ['Pending', 'Revision'].includes(item.status) && !item.dependencies?.length)
      || state.tasks.find(item => item.assignedTo === staff.id && item.status === 'In Progress');
    if (!task) throw new Error('no staff task');
    const ready = { ...task, status: 'Pending' as const, isCompleted: false, dependencies: [], predecessorTaskIds: [], revisionCount: 0, title: 'List quick start task' };
    useStore.setState({
      currentUser: { ...staff, mustResetPassword: false },
      tasks: state.tasks.map(item => item.id === task.id ? ready : item),
      backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 },
    });
    return ready.title;
  });
  await page.goto('/tasks');
  const start = page.getByRole('button', { name: `Start work: ${title}` });
  await expect(start).toBeVisible();
  await start.click();
  await expect(start).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const status = await page.evaluate(async taskTitle => {
    const { useStore } = await import('/src/store/index.ts');
    return useStore.getState().tasks.find(item => item.title === taskTitle)?.status;
  }, title);
  expect(status).toBe('In Progress');
});

test('Create task remembers the department and defaults month work to month end', async ({ page }) => {
  const clientId = await seedPublishedMonth(page);
  await page.goto(`/clients/${clientId}`);
  await expect(page.getByRole('tab', { name: 'Plan & delivery', exact: true })).toBeVisible();
  await addProject(page, clientId);
  const open = () => page.evaluate(async id => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.getState().openCreateTaskForProject({ projectId: 'clicks-project', clientId: id, clientName: 'Clicks Co' });
  }, clientId);
  const periodEnd = await page.evaluate(async id => {
    const { useStore } = await import('/src/store/index.ts');
    return useStore.getState().serviceCycles.find(item => item.clientId === id)!.periodEnd;
  }, clientId);

  await open();
  const dialog = page.getByRole('dialog', { name: /^Create task$/i });
  const department = dialog.getByLabel('Assign to Position/Department');
  await dialog.getByLabel('Task Title').fill('Social posts for the launch');
  await expect(dialog.getByLabel('Due Date')).toHaveValue(periodEnd);
  await department.selectOption('Designer');
  await dialog.getByRole('button', { name: 'Create & open task', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.keyboard.press('Escape');

  await open();
  const reopened = page.getByRole('dialog', { name: /^Create task$/i });
  await expect(reopened.getByLabel('Assign to Position/Department')).toHaveValue('Designer');
  // The reused choice is visible and can be cleared (role UX).
  await expect(reopened.getByText('Last used: Designer')).toBeVisible();
  await reopened.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(reopened.getByLabel('Assign to Position/Department')).not.toHaveValue('Designer');
  await expect(reopened.getByText(/Last used:/)).toHaveCount(0);
  const stored = await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    return localStorage.getItem(`aitask:create-task-last:${useStore.getState().currentUser!.id}`);
  });
  expect(stored).toBeNull();
});
