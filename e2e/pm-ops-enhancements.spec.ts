import { expect, test, type Page } from '@playwright/test';

const isoDaysFromToday = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const startApp = async (page: Page) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/login');
  // Let the app finish its startup load so seeded state is not overwritten.
  await page.waitForFunction(() => Boolean(document.querySelector('form input, main')));
};

const signInAs = async (page: Page, who: 'boss' | 'pm') => page.evaluate(async role => {
  localStorage.setItem('aitask:locale', 'en');
  const { useStore } = await import('/src/store/index.ts');
  const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
  const state = useStore.getState();
  const user = role === 'boss'
    ? state.users.find(item => item.isSuperAdmin)!
    : state.users.find(item => item.role === 'Project Manager' && !item.isSuperAdmin)!;
  enablePasswordResetBypass(user.id);
  localStorage.setItem(`aitask:release-notice:2026-11-everyday-saves:${user.id}`, 'acknowledged');
  useStore.setState({ currentUser: { ...user, mustResetPassword: false }, backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 } });
  return user.id;
}, who);

const savedTask = (page: Page, id: string) => page.evaluate(async taskId => (await import('/src/store/index.ts')).useStore.getState().tasks.find(task => task.id === taskId), id);

test('PM re-dates long-overdue work and assigns unowned work from the dashboard', async ({ page }) => {
  await startApp(page);
  const pmId = await signInAs(page, 'pm');
  const overdueDue = isoDaysFromToday(-10);
  await page.evaluate(async ({ pmId, overdueDue }) => {
    const { useStore } = await import('/src/store/index.ts');
    const state = useStore.getState();
    const staff = state.users.find(user => user.role === 'Staff' && (user.departments || []).includes('Designer'))!;
    const base = { ...state.tasks[0], clientId: undefined, clientName: 'Ops Co', projectId: 'ops-project', projectName: 'Ops project', department: 'Designer',
      createdBy: pmId, assignedBy: pmId, status: 'Pending', isCompleted: false, revisionCount: 0, comments: [], approvalHistory: [], workHistory: [], workState: {},
      deliverableId: undefined, serviceCycleId: undefined, generatedFromDeliverable: false, workflowStepId: undefined, startDate: '2026-01-01' };
    useStore.setState({
      projects: [{ id: 'ops-project', clientName: 'Ops Co', projectName: 'Ops project', createdBy: pmId, projectManagerIds: [pmId], services: ['Design'], startDate: '2026-01-01', deadline: '' }],
      tasks: [
        { ...base, id: 'ops-overdue', title: 'Ops overdue artwork', assignedTo: staff.id, dueDate: overdueDue },
        { ...base, id: 'ops-unowned', title: 'Ops unowned artwork', assignedTo: '', assignmentState: undefined, responsibleHodId: undefined, dueDate: '' },
      ],
    });
  }, { pmId, overdueDue });
  await page.goto('/');

  const day = page.getByRole('region', { name: 'My day' });
  await expect(day.getByRole('heading', { name: 'Awaiting your review' })).toBeVisible();
  await expect(day.getByRole('heading', { name: 'Ready to finalize' })).toBeVisible();
  await expect(day.getByRole('heading', { name: 'Overdue', exact: true })).toBeVisible();
  await expect(day.getByRole('heading', { name: 'Due today', exact: true })).toBeVisible();
  await expect(day.getByRole('heading', { name: 'Months to publish' })).toBeVisible();
  await expect(day.getByRole('heading', { name: 'Unlinked work this month' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Stuck work' })).toBeVisible();
  const newDue = isoDaysFromToday(5);
  await page.getByLabel('New due date for Ops overdue artwork').fill(newDue);
  await page.getByRole('button', { name: 'Re-date', exact: true }).click();
  await expect.poll(async () => (await savedTask(page, 'ops-overdue'))?.dueDate).toBe(newDue);
  await expect(page.getByLabel('New due date for Ops overdue artwork')).toHaveCount(0);

  const assign = page.getByLabel('Assign Ops unowned artwork');
  const firstPerson = await assign.locator('option').nth(1).getAttribute('value');
  expect(firstPerson).toBeTruthy();
  await assign.selectOption(firstPerson!);
  await page.getByRole('button', { name: 'Assign', exact: true }).last().click();
  await expect.poll(async () => (await savedTask(page, 'ops-unowned'))?.assignedTo).toBe(firstPerson);
});

test('Boss Koo assigns a Project Manager to a project that has none, and new projects require one', async ({ page }) => {
  await startApp(page);
  await signInAs(page, 'boss');
  const pm = await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const state = useStore.getState();
    const boss = state.users.find(user => user.isSuperAdmin)!;
    const manager = state.users.find(user => user.role === 'Project Manager' && !user.isSuperAdmin)!;
    const client = useStore.getState().createClientProfile({ clientName: 'Owner Co' });
    const base = { clientId: client.id, clientName: 'Owner Co', services: ['Design'], startDate: '2026-01-01', deadline: '' };
    useStore.setState({ projects: [
      { ...base, id: 'unowned-project', projectName: 'Unowned project', createdBy: boss.id },
      { ...base, id: 'owned-project', projectName: 'Owned project', createdBy: boss.id, projectManagerIds: [manager.id] },
    ] });
    return { id: manager.id, name: manager.name };
  });
  await page.goto('/');

  const panel = page.getByRole('heading', { name: 'Projects without a Project Manager' });
  await expect(panel).toBeVisible();
  await expect(page.getByLabel('Project Manager for Owned project')).toHaveCount(0);
  await page.getByLabel('Project Manager for Unowned project').selectOption(pm.id);
  await page.getByRole('button', { name: 'Assign', exact: true }).click();
  await expect.poll(() => page.evaluate(async () => (await import('/src/store/index.ts')).useStore.getState().projects.find(project => project.id === 'unowned-project')?.projectManagerIds)).toEqual([pm.id]);
  await expect(panel).toHaveCount(0);

  const clientId = await page.evaluate(async () => (await import('/src/store/index.ts')).useStore.getState().createClientProfile({ clientName: 'Needs PM Co' }).id!);
  await page.goto('/projects');
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Create project' });
  await dialog.getByLabel('Company name *').selectOption(clientId);
  await dialog.getByLabel('Project name *').fill('Needs a PM');
  await dialog.getByRole('button', { name: 'Design', exact: true }).click();
  await dialog.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(dialog.getByText('Choose at least one Project Manager for this project.')).toBeVisible();
});

test('a month of service work: bulk task chains, a one-off add-on, and plan pace', async ({ page }) => {
  test.setTimeout(120_000);
  await startApp(page);
  await signInAs(page, 'boss');
  const monthStart = (() => { const today = new Date(); return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`; })();
  const clientId = await page.evaluate(async monthStart => {
    const { useStore } = await import('/src/store/index.ts');
    const { SHORT_VIDEO_WORKFLOW_TEMPLATE, snapshotWorkflow } = await import('/src/lib/serviceManagement.ts');
    useStore.setState({ clients: [], clientPlans: [], serviceCycles: [], deliverables: [], cycleComments: [], addons: [], tasks: [], servicePricingSnapshots: [],
      serviceWorkflowTemplates: [structuredClone(SHORT_VIDEO_WORKFLOW_TEMPLATE)] });
    const created = useStore.getState().createClientWithPlan({
      clientName: 'Monthly Co', planName: 'Monthly Co Growth', origin: 'custom',
      serviceItems: [{ id: 'video', name: 'Short Video', platforms: ['TikTok'], unit: 'video', quantity: 3, unitPriceMinor: 25000, workflow: snapshotWorkflow(SHORT_VIDEO_WORKFLOW_TEMPLATE) }],
      startDate: monthStart, billingDay: 1, contractEndDate: '2027-12-31', discountType: 'none', discountValue: 0, taxRateBps: 0,
    });
    const activation = useStore.getState().activateClientPlan(created.planId!);
    if (!activation.ok) throw new Error(activation.error || 'activation failed');
    return created.clientId!;
  }, monthStart);

  await page.goto(`/clients/${encodeURIComponent(clientId)}?tab=cycles`);
  const generateAll = page.getByRole('button', { name: 'Generate all task chains' });
  await expect(generateAll).toBeVisible();
  await generateAll.click();
  await expect(generateAll).toHaveCount(0);
  const chains = await page.evaluate(async id => {
    const state = (await import('/src/store/index.ts')).useStore.getState();
    return state.deliverables.filter(item => item.clientId === id).map(item => state.tasks.filter(task => task.deliverableId === item.id).length);
  }, clientId);
  expect(chains.length).toBe(3);
  expect(chains.every(count => count > 0)).toBe(true);

  // Old ?tab=addons links land on the merged Plan & delivery tab. The
  // "Extra requests this month" block is gone (team feedback B1); extra work
  // is added as a one-off add-on for the month.
  await page.goto(`/clients/${encodeURIComponent(clientId)}?tab=addons`);
  await expect(page.getByRole('tab', { name: 'Plan & delivery', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('region', { name: 'Extra requests this month' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Log extra request' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Add service add-on' }).click();
  await page.getByLabel('Add-on name').fill('Extra story post');
  const cycleSelect = page.getByLabel('Service cycle');
  await cycleSelect.selectOption({ index: 1 });
  await page.locator('button[type="submit"][form="add-addon-form"]').click();
  await expect.poll(() => page.evaluate(async id => (await import('/src/store/index.ts')).useStore.getState().addons.find(item => item.clientId === id)?.name, clientId)).toBe('Extra story post');
  const addon = await page.evaluate(async id => (await import('/src/store/index.ts')).useStore.getState().addons.find(item => item.clientId === id), clientId);
  expect(addon).toMatchObject({ name: 'Extra story post', billingMode: 'one_off', unitPriceMinor: 0 });
});

test('Boss Koo marks a past deliverable delivered from the attention list, publishing its month', async ({ page }) => {
  test.setTimeout(120_000);
  await startApp(page);
  await signInAs(page, 'boss');
  const ids = await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ clients: [], clientPlans: [], serviceCycles: [], deliverables: [], addons: [], tasks: [], servicePricingSnapshots: [] });
    const created = useStore.getState().createClientWithPlan({
      clientName: 'Past Month Co', planName: 'Past plan', origin: 'custom',
      serviceItems: [{ id: 'fee', name: 'Management fee', platforms: [], unit: 'month', quantity: 1, unitPriceMinor: 0 }],
      startDate: '2026-08-01', billingDay: 1, discountType: 'none', discountValue: 0, taxRateBps: 0,
    });
    const activated = useStore.getState().activateClientPlan(created.planId!);
    if (!activated.ok) throw new Error(activated.error || 'activation failed');
    // Only published months that ended are flagged; publish the first one.
    const published = useStore.getState().setServiceCycleStatus(activated.cycleId!, 'Published');
    if (!published.ok) throw new Error(published.error || 'publish failed');
    const deliverable = useStore.getState().deliverables.find(item => item.cycleId === activated.cycleId)!;
    const cycle = useStore.getState().serviceCycles.find(item => item.id === activated.cycleId)!;
    const [y, m, d] = cycle.periodEnd.split('-').map(Number);
    const periodEnd = `${d} ${new Date(y, m - 1, d).toLocaleString('en-GB', { month: 'short' })} ${y}`;
    return { cycleId: activated.cycleId!, deliverableId: deliverable.id, title: deliverable.title, periodEnd };
  });
  await page.goto('/');
  // Each past month has its own button; its label names the month's end date.
  const button = page.getByRole('button', { name: new RegExp(`^Mark ${ids.title} \\(${ids.periodEnd}\\) delivered$`) });
  await expect(button).toBeVisible();
  await button.click();
  await expect.poll(() => page.evaluate(async ({ cycleId, deliverableId }) => {
    const state = (await import('/src/store/index.ts')).useStore.getState();
    return [state.serviceCycles.find(item => item.id === cycleId)?.status, state.deliverables.find(item => item.id === deliverableId)?.status];
  }, ids)).toEqual([expect.stringMatching(/Published|Completed/), 'Delivered']);
  await expect(button).toHaveCount(0);
});

test('Boss portfolio shows company health even without an active plan', async ({ page }) => {
  await startApp(page);
  await signInAs(page, 'boss');
  await page.goto('/');
  await page.getByRole('tab', { name: 'Portfolio', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Weekly company health' })).toBeVisible();
  await expect(page.getByText('Monthly contract value at risk')).toBeVisible();
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const state = useStore.getState();
    const client = state.createClientProfile({ clientName: 'Health test company' });
    useStore.setState({ projects: [...useStore.getState().projects, {
      id: 'health-project', clientId: client.id, clientName: 'Health test company', projectName: 'Health project',
      services: ['Design'], startDate: '2026-01-01', deadline: '', status: 'Active', hodMemberIds: [],
    }] });
  });
  const health = page.getByRole('region', { name: 'Weekly company health' });
  await expect(health.getByRole('listitem').filter({ hasText: 'Health test company' })).toContainText('Projects without HOD: 1');
});
