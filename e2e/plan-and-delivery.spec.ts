import { expect, test } from '@playwright/test';

// Team feedback (9 Nov 2026): one "Plan & delivery" tab, one Activate action
// that also publishes a month that is already due, and internal special notes.

const seedDraftPlan = async (page: import('@playwright/test').Page, startDate: string) => {
  await page.goto('/login');
  // Let the app finish its startup load so seeded state is not overwritten.
  await page.waitForFunction(() => Boolean(document.querySelector('form input, main')));
  return page.evaluate(async start => {
    const { useStore } = await import('/src/store/index.ts');
    const state = useStore.getState();
    const boss = state.users.find(user => user.isSuperAdmin)!;
    localStorage.setItem(`aitask:release-notice:2026-08-service-operations:${boss.id}`, 'acknowledged');
    useStore.setState({
      currentUser: { ...boss, mustResetPassword: false },
      clients: [], clientPlans: [], serviceCycles: [], deliverables: [], tasks: [], addons: [],
      backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 },
    });
    const created = useStore.getState().createClientWithPlan({
      clientName: 'Notes Co', planName: 'Notes Plan', origin: 'custom',
      serviceItems: [{ id: 'posts', name: 'Social Posts', platforms: ['Instagram'], unit: 'post', quantity: 2, unitPriceMinor: 10000 }],
      startDate: start, billingDay: 1, discountType: 'none', discountValue: 0, taxRateBps: 0,
    });
    if (!created.ok) throw new Error(created.error);
    return created.clientId!;
  }, startDate);
};

const monthStart = (offsetMonths = 0) => {
  const today = new Date();
  const date = new Date(today.getFullYear(), today.getMonth() + offsetMonths, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
};

test('a plan that starts this month is activated and published in one confirmed step', async ({ page }) => {
  const clientId = await seedDraftPlan(page, monthStart());
  await page.goto(`/clients/${clientId}?tab=plan`);
  await expect(page.getByRole('tab', { name: 'Plan & delivery', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tablist', { name: 'Client workspace' }).getByRole('tab')).toHaveCount(2);

  await page.getByRole('button', { name: 'Activate & publish this month' }).click();
  const dialog = page.getByRole('dialog', { name: 'Activate & publish this month' });
  await expect(dialog.getByText('Social Posts', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Activate & publish', exact: true }).click();
  await expect(dialog).toHaveCount(0);

  const state = await page.evaluate(async id => {
    const { useStore } = await import('/src/store/index.ts');
    const store = useStore.getState();
    return { plans: store.clientPlans.filter(plan => plan.clientId === id).map(plan => plan.status), cycles: store.serviceCycles.filter(cycle => cycle.clientId === id).map(cycle => cycle.status) };
  }, clientId);
  expect(state.plans).toEqual(['Active']);
  expect(state.cycles).toEqual(['Published']);
  await expect(page.getByRole('button', { name: /Activate/ })).toHaveCount(0);
});

test('a plan that starts next month is only activated; its month is published later', async ({ page }) => {
  const clientId = await seedDraftPlan(page, monthStart(1));
  await page.goto(`/clients/${clientId}`);
  await expect(page.getByRole('button', { name: 'Activate & publish this month' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Activate plan', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Activate plan' });
  await dialog.getByRole('button', { name: 'Activate plan', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const cycles = await page.evaluate(async id => {
    const { useStore } = await import('/src/store/index.ts');
    return useStore.getState().serviceCycles.filter(cycle => cycle.clientId === id).map(cycle => cycle.status);
  }, clientId);
  expect(cycles).toEqual(['Draft']);
});

test('special notes are saved on the client and the extra-requests block is gone', async ({ page }) => {
  const clientId = await seedDraftPlan(page, monthStart());
  await page.goto(`/clients/${clientId}`);
  const notes = page.getByRole('region', { name: 'Special notes' });
  await expect(notes.getByText('No special notes yet.')).toBeVisible();
  await notes.getByRole('button', { name: 'Add notes' }).click();
  await notes.getByLabel('Special notes').fill('Prefers WhatsApp. No posting on Fridays.');
  await notes.getByRole('button', { name: 'Save notes' }).click();
  await expect(notes.getByText('Prefers WhatsApp. No posting on Fridays.')).toBeVisible();
  const saved = await page.evaluate(async id => (await import('/src/store/index.ts')).useStore.getState().clients.find(client => client.id === id)?.notes, clientId);
  expect(saved).toBe('Prefers WhatsApp. No posting on Fridays.');
  await expect(page.getByText('Extra requests this month')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Log extra request' })).toHaveCount(0);
});

// Team feedback F2: project tasks count toward this month's deliverables.
const seedPublishedMonth = async (page: import('@playwright/test').Page) => {
  const clientId = await seedDraftPlan(page, monthStart());
  await page.evaluate(async id => {
    const { useStore } = await import('/src/store/index.ts');
    const store = useStore.getState();
    const plan = store.clientPlans.find(item => item.clientId === id)!;
    const activated = store.activateClientPlan(plan.id);
    if (!activated.ok) throw new Error(activated.error);
    const published = useStore.getState().setServiceCycleStatus(activated.cycleId!, 'Published');
    if (!published.ok) throw new Error(published.error);
  }, clientId);
  return clientId;
};

// Added on the loaded page: seeding a project before a reload is not restored by this local setup.
const addProject = (page: import('@playwright/test').Page, clientId: string) => page.evaluate(async id => {
  const { useStore } = await import('/src/store/index.ts');
  const boss = useStore.getState().currentUser!;
  useStore.setState({
    projects: [{ id: 'notes-project', clientId: id, clientName: 'Notes Co', projectName: 'Notes Campaign', services: ['Design'], startDate: '2026-01-01', deadline: '', projectManagerIds: [], hodMemberIds: [], staffMemberIds: [], createdBy: boss.id, status: 'Active', defaultApprovalMode: 'pm', milestones: [] }],
  });
}, clientId);

test('a task added from a project counts toward the matching deliverable this month', async ({ page }) => {
  const clientId = await seedPublishedMonth(page);
  await page.goto(`/clients/${clientId}`);
  await expect(page.getByRole('tab', { name: 'Plan & delivery', exact: true })).toBeVisible();
  await addProject(page, clientId);
  await page.evaluate(async id => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.getState().openCreateTaskForProject({ projectId: 'notes-project', clientId: id, clientName: 'Notes Co' });
  }, clientId);
  const dialog = page.getByRole('dialog', { name: /^Create task$/i });
  const countsToward = dialog.getByLabel(/Counts toward/);
  await expect(countsToward).toHaveValue('none');
  await dialog.getByLabel('Task Title').fill('Instagram posts for the launch');
  await expect(countsToward.locator('option:checked')).toHaveText('Social Posts 1');
  await dialog.getByLabel('Assign to Position/Department').selectOption('Designer');
  await dialog.getByRole('button', { name: 'Create & open task', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const linked = await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const state = useStore.getState();
    const task = state.tasks.find(item => item.title === 'Instagram posts for the launch')!;
    return { deliverable: state.deliverables.find(item => item.id === task.deliverableId)?.title, cycle: state.serviceCycles.find(item => item.id === task.serviceCycleId)?.status };
  });
  expect(linked).toEqual({ deliverable: 'Social Posts 1', cycle: 'Published' });
});

test('an unlinked task can be linked to a deliverable from the month block', async ({ page }) => {
  const clientId = await seedPublishedMonth(page);
  await page.goto(`/clients/${clientId}`);
  await expect(page.getByRole('tab', { name: 'Plan & delivery', exact: true })).toBeVisible();
  await addProject(page, clientId);
  await page.evaluate(async id => {
    const { useStore } = await import('/src/store/index.ts');
    const state = useStore.getState();
    const boss = state.currentUser!;
    const template = { status: 'Pending', title: 'Loose design task', description: '', clientId: id, clientName: 'Notes Co', projectId: 'notes-project', projectName: 'Notes Campaign', department: 'Designer' as const, serviceType: 'Design', priority: 'Medium' as const, startDate: '2026-11-01', dueDate: '', visibility: 'internal' as const, assignedTo: '', createdBy: boss.id, approvalMode: 'pm' as const, customerDetails: '', notes: '', facebookPage: '', website: '', attachmentLink: '', attachmentName: '', milestoneId: undefined };
    const taskId = state.addTask(template as Parameters<typeof state.addTask>[0]);
    if (!taskId) throw new Error('task not created');
  }, clientId);
  const picker = page.getByRole('combobox', { name: 'Link a task: Social Posts 2' });
  await expect(picker).toBeVisible();
  await picker.selectOption({ label: 'Loose design task' });
  await expect(page.getByRole('combobox', { name: 'Link a task: Social Posts 2' })).toHaveCount(0);
  const linkedTitle = await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const state = useStore.getState();
    const task = state.tasks.find(item => item.title === 'Loose design task')!;
    return state.deliverables.find(item => item.id === task.deliverableId)?.title;
  });
  expect(linkedTitle).toBe('Social Posts 2');
});
