import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { waitForWorkspaceBoot } from './fixtures/workspaceBoot';

const signIn = async (page: Page, username: string) => {
  await page.goto('/login');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/login');
  await waitForWorkspaceBoot(page);
  await page.getByRole('button', { name: `Use ${username}` }).click();
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Access Dashboard' }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/login'));
  const continueButton = page.getByRole('button', { name: 'Continue for now' });
  await continueButton.waitFor({ state: 'visible', timeout: 3_000 }).then(() => continueButton.click()).catch(() => undefined);
  const releaseNotice = page.getByRole('button', { name: 'Continue to AiTask' });
  await releaseNotice.waitFor({ state: 'visible', timeout: 3_000 }).then(() => releaseNotice.click()).catch(() => undefined);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('main')).toBeVisible();
};

const seedWorkspace = async (page: Page) => page.evaluate(async () => {
  const { useStore } = await import('/src/app/store/workspaceStore.ts');
  const state = useStore.getState();
  const pm = state.users.find(user => user.name === 'Project Manager Demo')!;
  const hod = state.users.find(user => user.name === 'HOD Demo')!;
  const staff = state.users.find(user => user.name === 'Staff Demo')!;
  const client = state.clients.find(item => item.clientName === 'UrbanEats') || state.clients[0];
  if (!pm || !hod || !staff || !client) throw new Error('Required local project workspace fixtures are unavailable');
  const stamp = '2026-10-25T12:00:00.000Z';
  const project = {
    id: 'pw-stage-active', clientId: client.id, clientName: client.clientName, projectName: 'Workspace delivery fixture',
    services: ['Design'], startDate: '2026-10-01', deadline: '2026-11-30', status: 'Active', createdBy: pm.id,
    projectManagerIds: [pm.id], hodMemberIds: [hod.id], staffMemberIds: [staff.id],
    milestones: [{ id: 'pw-milestone-review', name: 'Creative review', targetDate: '2026-10-30', status: 'In Progress', createdAt: stamp, updatedAt: stamp }],
  };
  const common = {
    clientId: client.id, clientName: client.clientName, projectId: project.id, projectName: project.projectName,
    serviceType: 'Design', description: 'Project workspace QA task', department: 'Designer', createdBy: pm.id,
    startDate: '2026-10-20', priority: 'Medium', completionPercentage: 0, revisionCount: 0,
    clientApprovalStatus: 'Pending', isRecurring: false, comments: [], approvalHistory: [], updatedAt: stamp,
  };
  const tasks = [
    { ...common, id: 'pw-task-done', title: 'Completed brochure', assignedTo: staff.id, status: 'Completed', isCompleted: true, completionPercentage: 100, completedAt: stamp, dueDate: '2026-10-22' },
    { ...common, id: 'pw-task-overdue', title: 'Overdue brand guide', assignedTo: staff.id, status: 'In Progress', isCompleted: false, dueDate: '2026-10-23' },
    { ...common, id: 'pw-task-review', title: 'Review landing page', assignedTo: hod.id, status: 'Waiting Approval', isCompleted: false, dueDate: '2026-10-29', milestoneId: 'pw-milestone-review' },
    { ...common, id: 'pw-task-revision', title: 'Revision banner set', assignedTo: staff.id, status: 'Revision', isCompleted: false, dueDate: '' },
    { ...common, id: 'pw-task-upcoming', title: 'Upcoming social tiles', assignedTo: staff.id, status: 'Pending', isCompleted: false, dueDate: '2026-10-28' },
  ];
  const plan = {
    id: 'pw-plan', clientId: client.id, clientName: client.clientName, name: 'Workspace design retainer', origin: 'standard', revision: 1,
    status: 'Active', currency: 'MYR', serviceItems: [], discountType: 'none', discountValue: 0, taxRateBps: 0,
    startDate: '2026-10-01', billingDay: 1, createdBy: pm.id, createdAt: stamp, updatedAt: stamp,
  };
  const cycle = {
    id: 'pw-cycle', clientId: client.id, clientName: client.clientName, planId: plan.id, planRevision: 1,
    periodStart: '2026-10-01', periodEnd: '2026-10-31', status: 'Published', currency: 'MYR', serviceItems: [],
    addonSnapshots: [], discountType: 'none', discountValue: 0, taxRateBps: 0, publishedAt: stamp, createdAt: stamp, updatedAt: stamp,
  };
  const deliverable = {
    id: 'pw-deliverable', clientId: client.id, clientName: client.clientName, planId: plan.id, cycleId: cycle.id,
    serviceItemId: 'service-design', sequence: 1, title: 'Social design set', status: 'Delivered', taskIds: ['pw-task-done'], attachments: [], createdAt: stamp, updatedAt: stamp,
  };
  useStore.setState({
    projects: [...state.projects.filter(item => item.id !== project.id), project],
    tasks: [...state.tasks.filter(item => !item.id.startsWith('pw-task-')), ...tasks],
    clientPlans: [...state.clientPlans.filter(item => item.id !== plan.id), plan],
    serviceCycles: [...state.serviceCycles.filter(item => item.id !== cycle.id), cycle],
    deliverables: [...state.deliverables.filter(item => item.id !== deliverable.id), deliverable],
  });
  return { projectId: project.id, projectName: project.projectName, clientName: client.clientName, overdueTaskName: 'Overdue brand guide', pmId: pm.id, hodId: hod.id, staffId: staff.id };
});

test.describe('Stage 1 accessibility and Stage 2 project workspace', () => {
  test('PM quick and scheduled task creation preserve required fields and restricted visibility', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-10-25T12:00:00.000Z') });
    await signIn(page, 'Project Manager Demo');
    const fixture = await seedWorkspace(page);
    await page.goto('/tasks');

    const createTask = async (title: string) => {
      await page.getByRole('button', { name: 'New task', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Create task', exact: true });
      await dialog.getByLabel('Task Title').fill(title);
      await dialog.getByLabel('Company for this task').selectOption({ label: fixture.clientName });
      await dialog.getByLabel('Assign to Position/Department').selectOption('Designer');
      await dialog.getByLabel('Responsible HOD').selectOption(fixture.hodId);
      return dialog;
    };

    const quickDialog = await createTask('Stage 1 quick task');
    await expect(quickDialog.getByLabel('Start Date')).toHaveValue('2026-10-25');
    await expect(quickDialog.getByLabel('Due Date')).toHaveValue('');
    await quickDialog.getByRole('button', { name: 'Create & open task', exact: true }).click();
    await expect(quickDialog).toHaveCount(0);
    const quickTask = await page.evaluate(async () => (await import('/src/app/store/workspaceStore.ts')).useStore.getState().tasks.find(task => task.title === 'Stage 1 quick task'));
    expect(quickTask).toMatchObject({ clientName: fixture.clientName, department: 'Designer', assignedTo: fixture.hodId, startDate: '2026-10-25', dueDate: '', visibility: 'internal' });

    await page.goto('/tasks');
    const scheduledDialog = await createTask('Stage 1 scheduled internal task');
    await scheduledDialog.getByLabel('Start Date').fill('2026-11-02');
    await scheduledDialog.getByLabel('Due Date').fill('2026-11-16');
    await scheduledDialog.getByLabel('Client visibility').selectOption('internal');
    await scheduledDialog.getByRole('button', { name: 'Create & open task', exact: true }).click();
    await expect(scheduledDialog).toHaveCount(0);
    const scheduledTask = await page.evaluate(async () => (await import('/src/app/store/workspaceStore.ts')).useStore.getState().tasks.find(task => task.title === 'Stage 1 scheduled internal task'));
    expect(scheduledTask).toMatchObject({ clientName: fixture.clientName, department: 'Designer', assignedTo: fixture.hodId, startDate: '2026-11-02', dueDate: '2026-11-16', visibility: 'internal' });
  });

  test('PM can create an accountable no-HOD task and assign Staff later', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-10-25T12:00:00.000Z') });
    await signIn(page, 'Project Manager Demo');
    const fixture = await seedWorkspace(page);
    const noHodProjectId = await page.evaluate(async fixture => {
      const { useStore } = await import('/src/app/store/workspaceStore.ts');
      const state = useStore.getState();
      const project = state.projects.find(item => item.id === fixture.projectId)!;
      const noHodProject = { ...project, id: 'pw-stage-no-hod', projectName: 'No HOD assignment fixture', hodMemberIds: [] };
      useStore.setState({ projects: [...state.projects, noHodProject] });
      return noHodProject.id;
    }, fixture);

    await page.goto('/tasks');
    await page.getByRole('button', { name: 'New task', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Create task', exact: true });
    await dialog.getByLabel(/^Project/).selectOption(noHodProjectId);
    await dialog.getByLabel('Task Title').fill('Unassigned PM accountability task');
    await dialog.getByLabel('Assign to Position/Department').selectOption('Designer');
    await expect(dialog.getByLabel('Assignee')).toHaveValue('');
    await expect(dialog.getByText('You remain accountable for this task and can assign an eligible Staff member later.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Create & open task', exact: true }).click();
    await expect(dialog).toHaveCount(0);

    const task = await page.evaluate(async () => (await import('/src/app/store/workspaceStore.ts')).useStore.getState().tasks.find(item => item.title === 'Unassigned PM accountability task'));
    expect(task).toMatchObject({
      projectId: noHodProjectId,
      assignedTo: '',
      createdBy: fixture.pmId,
      assignedBy: fixture.pmId,
      assignmentState: 'needs_hod',
      visibility: 'internal',
    });
    expect(task?.responsibleHodId).toBeUndefined();

    await page.goto('/');
    const queueHeading = page.getByRole('heading', { name: 'Unassigned tasks', exact: true });
    await expect(queueHeading).toBeVisible();
    await expect(queueHeading.locator('xpath=ancestor::section[1]').getByRole('link', { name: 'Unassigned PM accountability task', exact: true })).toBeVisible();
  });

  test('HOD can create project department work assigned to an eligible Staff member', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-10-25T12:00:00.000Z') });
    await signIn(page, 'HOD Demo');
    const fixture = await seedWorkspace(page);
    const curatedProjectId = await page.evaluate(async fixture => {
      const { useStore } = await import('/src/app/store/workspaceStore.ts');
      const state = useStore.getState();
      const boss = state.users.find(user => user.isSuperAdmin)!;
      const project = state.projects.find(item => item.id === fixture.projectId)!;
      const curated = { ...project, id: 'pw-stage-hod-curated', projectName: 'HOD department fixture', createdBy: boss.id };
      useStore.setState({ projects: [...state.projects, curated] });
      return curated.id;
    }, fixture);
    await page.goto('/tasks');
    await page.getByRole('button', { name: 'Create task', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Create task', exact: true });
    await dialog.getByLabel(/^Project/).selectOption(curatedProjectId);
    await dialog.getByLabel('Task Title').fill('Stage 1 HOD department task');
    await dialog.getByLabel('Assign to Position/Department').selectOption('Designer');
    await dialog.getByLabel('Assignee').selectOption(fixture.staffId);
    await dialog.getByRole('button', { name: 'Create & open task', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const task = await page.evaluate(async () => (await import('/src/app/store/workspaceStore.ts')).useStore.getState().tasks.find(item => item.title === 'Stage 1 HOD department task'));
    expect(task).toMatchObject({ projectId: curatedProjectId, clientName: fixture.clientName, department: 'Designer', assignedTo: fixture.staffId, visibility: 'internal' });
  });

  test('Client report keeps the timing table keyboard reachable without a duplicate region landmark', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-10-25T12:00:00.000Z') });
    await signIn(page, 'UrbanEats Client Demo');
    const clientFixture = await page.evaluate(async () => {
      const { useStore } = await import('/src/app/store/workspaceStore.ts');
      const state = useStore.getState();
      const client = state.users.find(user => user.name === 'UrbanEats Client Demo')!;
      const profile = state.clients.find(item => item.clientName === client.companyName)!;
      const privateProject = { ...state.projects[0], id: 'client-private-project', projectName: 'Internal project private fixture', clientId: profile.id, clientName: client.companyName! };
      const base = state.tasks[0];
      const task = {
        ...base, id: 'client-report-due-qa', title: 'Client report due task', clientName: client.companyName!, projectId: undefined,
        clientId: undefined, visibility: 'client-visible', status: 'In Progress', isCompleted: false, completedAt: undefined,
        startDate: '2026-10-23', dueDate: '2026-10-24', assignedTo: 'u-pm', updatedAt: '2026-10-25T12:00:00.000Z',
      };
      useStore.setState({ currentUser: { ...client, mustResetPassword: false }, tasks: [task], projects: [privateProject] });
      return { projectId: privateProject.id };
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/reports');
    const timingSection = page.getByRole('region', { name: 'Agency completion and your approval' });
    const tableGroup = page.locator('[role="group"][aria-label="Client delivery timing table"]');
    await expect(timingSection).toBeVisible();
    await expect(tableGroup).toBeVisible();
    await expect(tableGroup.getByRole('row', { name: /Client report due task/ })).toBeVisible();
    expect(await page.getByRole('region', { name: 'Agency completion and your approval' }).count()).toBe(1);
    expect(await tableGroup.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
    await tableGroup.focus();
    await expect(tableGroup).toBeFocused();
    await page.keyboard.press('ArrowRight');
    expect(await tableGroup.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
    const axe = await new AxeBuilder({ page }).include('main').analyze();
    expect(axe.violations, axe.violations.map(item => item.id).join(', ')).toEqual([]);
    await page.screenshot({ path: 'audit-evidence/2026-10-25/client-report-after.png', fullPage: true });
    await page.goto(`/projects/${clientFixture.projectId}`);
    await expect(page.getByRole('heading', { name: 'Project overview' })).toHaveCount(0);
    await expect(page.getByText('Internal project private fixture')).toHaveCount(0);
  });

  test('Project Manager gets scoped summary, attention, tasks, milestones, services, and reports', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-10-25T12:00:00.000Z') });
    await signIn(page, 'Project Manager Demo');
    const fixture = await seedWorkspace(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    const navigationStartedAt = performance.now();
    await page.goto(`/projects/${fixture.projectId}`);
    await expect(page.getByRole('heading', { name: fixture.projectName })).toBeVisible();
    console.info(`[project workspace] local seeded-data render ready in ${Math.round(performance.now() - navigationStartedAt)}ms`);
    await expect(page.getByRole('heading', { name: 'Project overview' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Attention required' }).getByRole('link', { name: 'Overdue brand guide' })).toBeVisible();
    await expect(page.getByText('Workspace design retainer')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Project team' })).toBeVisible();
    await expect(page.locator('section[aria-labelledby="project-team-title"]').getByText('Staff Demo', { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Milestones' }).getByText('Creative review')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open report' })).toHaveAttribute('href', `/reports?projectId=${fixture.projectId}`);
    await expect(page.getByRole('region', { name: 'Project overview' }).getByText('20%', { exact: true }).first()).toBeVisible();
    const axe = await new AxeBuilder({ page }).include('main').analyze();
    expect(axe.violations, axe.violations.map(item => item.id).join(', ')).toEqual([]);
    await page.screenshot({ path: 'audit-evidence/2026-10-25/project-workspace-desktop.png', fullPage: true });

    const search = page.getByRole('textbox', { name: 'Search project tasks' });
    await search.fill('overdue brand');
    const taskSection = page.getByRole('region', { name: 'Project tasks' });
    await expect(taskSection.getByRole('link', { name: 'Overdue brand guide', exact: true })).toBeVisible();
    await expect(taskSection.getByRole('link', { name: 'Completed brochure', exact: true })).toHaveCount(0);
    await search.clear();
    for (const viewport of [
      { width: 320, height: 700 },
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
      { width: 1440, height: 1000 },
    ]) {
      await page.setViewportSize(viewport);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), {
        message: `Project workspace should not overflow at ${viewport.width}px`,
      }).toBe(true);
      await expect.poll(() => page.locator('main').evaluate(main => main.scrollWidth <= main.clientWidth + 1), {
        message: `Project workspace main content should not overflow at ${viewport.width}px`,
      }).toBe(true);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'audit-evidence/2026-10-25/project-workspace-mobile.png', fullPage: true });
    await page.reload();
    await expect(page.getByRole('heading', { name: fixture.projectName })).toBeVisible();
    await page.getByRole('button', { name: '切换为中文' }).click();
    await expect(page.getByRole('heading', { name: '项目概览' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '项目团队' })).toBeVisible();
  });

  test('HOD only sees assigned project work and cannot open an unrelated project', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-10-25T12:00:00.000Z') });
    await signIn(page, 'HOD Demo');
    const fixture = await seedWorkspace(page);
    await page.evaluate(async () => {
      const { useStore } = await import('/src/app/store/workspaceStore.ts');
      const state = useStore.getState();
      const pm = state.users.find(user => user.name === 'Project Manager Demo')!;
      const client = state.clients.find(item => item.clientName === 'UrbanEats') || state.clients[0];
      const privateProject = {
        id: 'pw-stage-private', clientId: client.id, clientName: client.clientName, projectName: 'Private project fixture',
        services: [], startDate: '2026-10-01', deadline: '2026-11-30', status: 'Active', createdBy: pm.id,
        projectManagerIds: [pm.id], hodMemberIds: ['other-hod'], staffMemberIds: [],
      };
      const privateTask = { ...state.tasks[0], id: 'pw-private-task', title: 'Private project task', clientId: client.id, clientName: client.clientName,
        projectId: privateProject.id, projectName: privateProject.projectName, assignedTo: 'other-staff', createdBy: pm.id, status: 'Pending', dueDate: '' };
      useStore.setState({ projects: [...state.projects, privateProject], tasks: [...state.tasks, privateTask] });
    });
    await page.goto(`/projects/${fixture.projectId}`);
    await expect(page.getByRole('heading', { name: fixture.projectName })).toBeVisible();
    await expect(page.getByText('Private project task')).toHaveCount(0);
    await page.goto('/projects/pw-stage-private');
    await expect(page.getByRole('heading', { name: 'Project not available' })).toBeVisible();
    await expect(page.getByText('Private project fixture')).toHaveCount(0);

  });

  test('Staff sees only tasks and team context allowed by assignment scope', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-10-25T12:00:00.000Z') });
    await signIn(page, 'Staff Demo');
    const fixture = await seedWorkspace(page);
    await page.goto(`/projects/${fixture.projectId}`);
    await expect(page.getByRole('heading', { name: fixture.projectName })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Project tasks' }).getByRole('link', { name: 'Review landing page', exact: true })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Project tasks' }).getByRole('link', { name: 'Overdue brand guide', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Manage project' })).toHaveCount(0);
  });

  test('project report query filters to visible linked tasks and preserves direct access', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-10-25T12:00:00.000Z') });
    await signIn(page, 'Project Manager Demo');
    const fixture = await seedWorkspace(page);
    await page.evaluate(async () => {
      const { useStore } = await import('/src/app/store/workspaceStore.ts');
      const state = useStore.getState();
      const client = state.clients.find(item => item.clientName === 'UrbanEats') || state.clients[0];
      const unrelatedTask = {
        ...state.tasks[0], id: 'pw-task-unrelated', title: 'Unrelated project overdue task',
        clientId: client.id, clientName: client.clientName, projectId: 'pw-other-project', projectName: 'Another project',
        status: 'In Progress', isCompleted: false, completedAt: undefined, dueDate: '2026-10-24',
      };
      useStore.setState({ tasks: [...state.tasks, unrelatedTask] });
    });
    await page.goto(`/reports?projectId=${fixture.projectId}`);
    await expect(page.getByText('This report is filtered to one project', { exact: false })).toBeVisible();
    await expect(page.getByText('Scope: Project', { exact: true })).toBeVisible();
    const overdueCard = page.locator('.app-metric-card').filter({ has: page.getByText('Overdue', { exact: true }) });
    await expect(overdueCard).toHaveCount(1);
    await expect(overdueCard).toContainText('1');
    await page.getByText('View weekly data table', { exact: true }).click();
    await expect(page.getByRole('table', { name: 'Weekly due-work data' })).toBeVisible();
    await expect(page.getByText('No monthly activity in this period.')).toHaveCount(0);
    await page.goto(`/projects/${fixture.projectId}`);
    await page.getByRole('link', { name: 'Open report' }).click();
    await expect(page).toHaveURL(new RegExp(`/reports\\?projectId=${fixture.projectId}$`));
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/projects/${fixture.projectId}$`));
    await page.goForward();
    await expect(page).toHaveURL(new RegExp(`/reports\\?projectId=${fixture.projectId}$`));
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Four-Week Performance Report' })).toBeVisible();
  });

  test('empty and completed projects show accurate empty states without invented progress', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-10-25T12:00:00.000Z') });
    await signIn(page, 'Project Manager Demo');
    const fixture = await seedWorkspace(page);
    await page.evaluate(async projectId => {
      const { useStore } = await import('/src/app/store/workspaceStore.ts');
      const state = useStore.getState();
      useStore.setState({
        projects: state.projects.map(project => project.id === projectId
          ? { ...project, projectName: 'Completed empty fixture', status: 'Completed', completedAt: '2026-10-24T12:00:00.000Z', milestones: [] }
          : project),
        tasks: state.tasks.filter(task => task.projectId !== projectId),
      });
    }, fixture.projectId);
    await page.goto(`/projects/${fixture.projectId}`);
    await expect(page.getByRole('heading', { name: 'Completed empty fixture' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Project overview' }).getByText('0', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('No tasks linked yet')).toBeVisible();
    await expect(page.getByText('No milestones added')).toBeVisible();
    await expect(page.getByText('No work needs attention')).toBeVisible();
    await page.goto('/projects/does-not-exist');
    await expect(page.getByRole('heading', { name: 'Project not available' })).toBeVisible();
    await expect(page.getByText('Completed empty fixture')).toHaveCount(0);
  });
});
