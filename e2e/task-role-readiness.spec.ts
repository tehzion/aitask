import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { waitForWorkspaceHydration } from './helpers/workspaceHydration';

const openAs = async (page: Page, actorId: string) => {
  await page.evaluate(async id => {
    const { useStore } = await import('/src/app/store/workspaceStore.ts');
    useStore.setState({ currentUser: useStore.getState().users.find(user => user.id === id)! });
  }, actorId);
  await page.goto('/tasks?taskId=stage-task');
  await waitForWorkspaceHydration(page);
  await expect(page.getByRole('dialog', { name: actorId === 'stage-client' ? 'Delivery details' : 'Stage artwork', exact: true })).toBeVisible();
};

const seedStageWorkspace = async () => {
  const { useStore } = await import('/src/app/store/workspaceStore.ts');
  const { enablePasswordResetBypass } = await import('/src/modules/authentication/domain/auth.ts');
  const state = useStore.getState();
  const base = state.users.find(user => user.name === 'Staff Demo')!;
  const member = (id: string, role: 'Staff' | 'HOD' | 'Project Manager' | 'Client') => ({ ...base, id, name: id, role, departments: role === 'Client' ? ['Client'] : ['Designer'], department: role === 'Client' ? 'Client' : 'Designer', companyName: role === 'Client' ? 'Stage Company' : undefined, customRoleId: undefined, customRoleName: undefined, permissions: undefined, isSuperAdmin: false, mustResetPassword: false });
  const users = [member('stage-pm', 'Project Manager'), member('stage-hod', 'HOD'), member('stage-staff', 'Staff'), member('stage-client', 'Client')];
  for (const user of users) { enablePasswordResetBypass(user.id); localStorage.setItem(`aitask:release-notice:2026-10-project-workflows:${user.id}`, 'acknowledged'); }
  localStorage.setItem('aitask:locale', 'en');
  useStore.setState({ currentUser: users[0], users, rolePermissions: [], projects: [], clientPlans: [], deliverables: [], serviceCycles: [], notifications: [], clients: [{ id: 'stage-company', clientName: 'Stage Company', createdBy: 'stage-pm', createdAt: '2026-10-01', updatedAt: '2026-10-01' }], tasks: [{ ...state.tasks[0], generatedFromDeliverable: false, workflowStepId: undefined, workflowStepKind: undefined, workflowDependenciesReady: undefined, internalReview: undefined, id: 'stage-task', title: 'Stage artwork', clientId: 'stage-company', clientName: 'Stage Company', projectId: undefined, deliverableId: undefined, serviceCycleId: undefined, department: 'Designer', assignedTo: '', assignedBy: 'stage-pm', createdBy: 'stage-pm', status: 'Pending', isCompleted: false, completionPercentage: 0, revisionCount: 0, clientApprovalStatus: 'Pending', visibility: 'client-visible', predecessorTaskIds: [], workState: {}, workHistory: [], comments: [], approvalHistory: [] }], backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 } });
  if (!useStore.getState().updateTaskAssignee('stage-task', 'stage-hod').ok) throw new Error('PM assignment failed');
};

const seed = async (page: Page) => {
  await page.goto('/login');
  await waitForWorkspaceHydration(page);
  await page.evaluate(seedStageWorkspace);
  await page.goto('/tasks');
  await waitForWorkspaceHydration(page);
  await page.evaluate(seedStageWorkspace);
};

test('legacy HOD can delegate and approve through the full editor without completing for the PM', async ({ page }) => {
  await seed(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/app/store/workspaceStore.ts');
    useStore.setState({ users: useStore.getState().users.map(user => user.id === 'stage-hod' ? { ...user, role: 'Staff' as const, customRoleId: 'builtin-hod' } : user) });
  });
  await openAs(page, 'stage-hod');
  await page.getByRole('button', { name: 'Full edit', exact: true }).click();
  await page.getByRole('combobox', { name: 'Choose a team member', exact: true }).selectOption('stage-staff');
  await page.getByRole('button', { name: 'Assign Task', exact: true }).click();
  await expect(page.getByRole('progressbar', { name: 'Task progress', exact: true }).first()).toHaveAttribute('aria-valuenow', '20');
  await openAs(page, 'stage-staff');
  await page.getByRole('button', { name: 'Start work', exact: true }).click();
  await page.getByRole('button', { name: 'Send for review', exact: true }).click();
  await openAs(page, 'stage-hod');
  await page.getByRole('button', { name: 'Full edit', exact: true }).click();
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByRole('progressbar', { name: 'Task progress', exact: true }).first()).toHaveAttribute('aria-valuenow', '80');
  await expect(page.getByRole('button', { name: 'Confirm completion', exact: true })).toHaveCount(0);
});

test('customer revision returns to Staff and requires another HOD approval before PM completion', async ({ page }) => {
  test.setTimeout(60_000);
  await seed(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/app/store/workspaceStore.ts');
    useStore.setState({ tasks: useStore.getState().tasks.map(task => ({ ...task, status: 'Approved', assignedTo: 'stage-staff', completionPercentage: 80 })) });
  });
  await openAs(page, 'stage-client');
  await page.getByPlaceholder('Add context for the team…').fill('Use the new artwork');
  await page.getByRole('button', { name: 'Request changes', exact: true }).click();
  await expect(page.getByRole('progressbar', { name: 'Delivery progress', exact: true })).toHaveAttribute('aria-valuenow', '50');
  await openAs(page, 'stage-pm');
  await expect(page.getByRole('button', { name: 'Confirm completion', exact: true })).toHaveCount(0);
  await openAs(page, 'stage-staff');
  await page.getByRole('button', { name: 'Accept assignment', exact: true }).click();
  await page.getByRole('button', { name: 'Resubmit for review', exact: true }).click();
  await openAs(page, 'stage-hod');
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await openAs(page, 'stage-client');
  await page.getByRole('button', { name: 'Approve delivery', exact: true }).click();
  await openAs(page, 'stage-pm');
  await page.getByRole('button', { name: 'Confirm completion', exact: true }).click();
  await expect(page.getByRole('progressbar', { name: 'Task progress', exact: true })).toHaveAttribute('aria-valuenow', '100');
});

test('a missing department HOD shows an actionable error and does not claim a successful submission', async ({ page }) => {
  await seed(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/app/store/workspaceStore.ts');
    useStore.setState({ users: useStore.getState().users.filter(user => user.id !== 'stage-hod'), tasks: useStore.getState().tasks.map(task => ({ ...task, assignedTo: 'stage-staff', status: 'In Progress', completionPercentage: 30 })) });
  });
  await openAs(page, 'stage-staff');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/app/store/workspaceStore.ts');
    const { getDepartmentReviewers } = await import('/src/shared/authorization/taskWorkflowAccess.ts');
    const state = useStore.getState();
    const reviewers = new Set(getDepartmentReviewers(state.users, state.tasks[0], state.rolePermissions).map(user => user.id));
    useStore.setState({ users: state.users.filter(user => !reviewers.has(user.id) && user.role !== 'Project Manager'), backend: { ...state.backend, mode: 'local', status: 'local' } });
  });
  await page.getByRole('button', { name: 'Send for review', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('No reviewer is configured for this task.');
  await expect(page.getByRole('progressbar', { name: 'Task progress', exact: true })).toHaveAttribute('aria-valuenow', '30');
});


test('responsible PM receives Designer review without a Designer HOD and approves before finalizing', async ({ page }) => {
  await seed(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/app/store/workspaceStore.ts');
    const state = useStore.getState();
    useStore.setState({ users: state.users.filter(user => user.id !== 'stage-hod'), tasks: state.tasks.map(task => ({ ...task, assignedTo: 'stage-staff', status: 'In Progress', completionPercentage: 30 })) });
  });
  await openAs(page, 'stage-staff');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/app/store/workspaceStore.ts');
    const { getDepartmentReviewers } = await import('/src/shared/authorization/taskWorkflowAccess.ts');
    const state = useStore.getState();
    // Reloading a local demo restores its seed HOD; remove that demo reviewer
    // as well so this fixture represents the production Designer configuration.
    const hods = new Set(getDepartmentReviewers(state.users, state.tasks[0], state.rolePermissions).filter(user => user.role !== 'Project Manager').map(user => user.id));
    useStore.setState({ users: state.users.filter(user => !hods.has(user.id)) });
  });
  await page.getByRole('button', { name: 'Send for review', exact: true }).click();
  await expect(page.getByRole('progressbar', { name: 'Task progress', exact: true })).toHaveAttribute('aria-valuenow', '60');
  expect(await page.evaluate(async () => {
    const { useStore } = await import('/src/app/store/workspaceStore.ts');
    return useStore.getState().notifications.some(n => n.targetUserId === 'stage-pm' && n.title === 'Task Ready for Approval');
  })).toBe(true);
  await openAs(page, 'stage-pm');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/app/store/workspaceStore.ts');
    const { getDepartmentReviewers } = await import('/src/shared/authorization/taskWorkflowAccess.ts');
    const state = useStore.getState();
    // Reloading a local demo restores its seed HOD; remove that demo reviewer
    // as well so this fixture represents the production Designer configuration.
    const hods = new Set(getDepartmentReviewers(state.users, state.tasks[0], state.rolePermissions).filter(user => user.role !== 'Project Manager').map(user => user.id));
    useStore.setState({ users: state.users.filter(user => !hods.has(user.id)) });
  });
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByRole('progressbar', { name: 'Task progress', exact: true }).first()).toHaveAttribute('aria-valuenow', '80');
  await page.getByRole('button', { name: 'Confirm completion', exact: true }).click();
  await expect(page.getByRole('progressbar', { name: 'Task progress', exact: true })).toHaveAttribute('aria-valuenow', '100');
});

test('PM can create direct Staff work when the project has no eligible HOD', async ({ page }) => {
  await page.goto('/login');
  await waitForWorkspaceHydration(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/app/store/workspaceStore.ts');
    const { enablePasswordResetBypass } = await import('/src/modules/authentication/domain/auth.ts');
    const state = useStore.getState();
    const base = state.users.find(user => user.name === 'Staff Demo')!;
    const makeMember = (id: string, role: 'Project Manager' | 'HOD' | 'Staff') => ({
      ...base,
      id,
      name: id,
      role,
      departments: [role === 'Project Manager' ? 'Management' : 'Designer'],
      department: role === 'Project Manager' ? 'Management' : 'Designer',
      customRoleId: undefined,
      customRoleName: undefined,
      permissions: undefined,
      isSuperAdmin: false,
      hasLogin: true,
      mustResetPassword: false,
    });
    const pm = makeMember('fallback-pm', 'Project Manager');
    const outOfProjectHod = makeMember('fallback-unassigned-hod', 'HOD');
    const staff = makeMember('fallback-staff', 'Staff');
    enablePasswordResetBypass(pm.id);
    localStorage.setItem(`aitask:release-notice:2026-10-project-workflows:${pm.id}`, 'acknowledged');
    localStorage.setItem('aitask:locale', 'en');
    useStore.setState({
      currentUser: pm,
      users: [pm, outOfProjectHod, staff],
      rolePermissions: [],
      clients: [{ id: 'fallback-company', clientName: 'Fallback Co', createdBy: pm.id, createdAt: '2026-10-01', updatedAt: '2026-10-01' }],
      projects: [{
        id: 'fallback-project',
        clientId: 'fallback-company',
        clientName: 'Fallback Co',
        projectName: 'Fallback Project',
        createdBy: pm.id,
        projectManagerIds: [pm.id],
        hodMemberIds: [],
        staffMemberIds: [staff.id],
        services: ['Design'],
        startDate: '2026-10-01',
        deadline: '2026-12-31',
      }],
      tasks: [],
      notifications: [],
      backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 },
    });
  });
  await page.goto('/tasks');
  await waitForWorkspaceHydration(page);
  await page.getByRole('button', { name: 'New task', exact: true }).click();
  const createDialog = page.getByRole('dialog', { name: 'Create task', exact: true });
  await createDialog.getByLabel(/Project/).selectOption('fallback-project');
  await createDialog.getByLabel(/Assign to Position\/Department/).selectOption('Designer');
  await expect(createDialog.getByLabel('Assignee').locator('option[value="fallback-staff"]')).toHaveCount(1);
  await createDialog.getByLabel('Assignee').selectOption('fallback-staff');
  await createDialog.getByLabel('Task Title').fill('Direct fallback artwork');
  await createDialog.getByRole('button', { name: 'Create & open task', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Direct fallback artwork', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(async () => {
    const { useStore } = await import('/src/app/store/workspaceStore.ts');
    const task = useStore.getState().tasks.find(item => item.title === 'Direct fallback artwork');
    return { assignedTo: task?.assignedTo, assignmentState: task?.assignmentState, responsibleHodId: task?.responsibleHodId };
  })).toEqual({ assignedTo: 'fallback-staff', assignmentState: undefined, responsibleHodId: undefined });
});

for (const status of ['Waiting Approval', 'Approved', 'Completed']) {
  test(`Staff cannot delete ${status} work while the portfolio PM retains management`, async ({ page }) => {
    await seed(page);
    await page.evaluate(async status => {
      const { useStore } = await import('/src/app/store/workspaceStore.ts');
      useStore.setState({ tasks: useStore.getState().tasks.map(task => ({ ...task, assignedTo: 'stage-staff', status, isCompleted: status === 'Completed' })) });
    }, status);
    await openAs(page, 'stage-staff');
    await page.getByRole('button', { name: 'Full edit', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Stage artwork', exact: true }).getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
    await openAs(page, 'stage-pm');
    await page.getByRole('button', { name: 'Full edit', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Stage artwork', exact: true }).getByRole('button', { name: 'Delete', exact: true })).toBeVisible();
  });
}

for (const mobile of [false, true]) {
  test(`${mobile ? 'mobile' : 'desktop'} department reviewer sees file-only evidence without service management`, async ({ page }, testInfo) => {
    await page.setViewportSize(mobile ? { width: 375, height: 844 } : { width: 1280, height: 900 });
    await seed(page);
    await page.evaluate(async () => {
      const { useStore } = await import('/src/app/store/workspaceStore.ts');
      useStore.setState({ tasks: useStore.getState().tasks.map(task => ({ ...task, assignedTo: 'stage-staff', deliverableId: 'evidence-output', serviceCycleId: 'evidence-cycle', attachmentLink: undefined, status: 'Waiting Approval', completionPercentage: 60 })) });
    });
    await openAs(page, 'stage-hod');
    await page.evaluate(async () => {
      const { useStore } = await import('/src/app/store/workspaceStore.ts');
      const attachment = { id: 'output-file', bucket: 'client-service-files', path: 'aitask-main/stage-company/evidence-cycle/output.pdf', fileName: 'Artwork-final-output.pdf', mimeType: 'application/pdf', sizeBytes: 32, uploadedBy: 'stage-staff', uploadedAt: '2026-10-14T00:00:00.000Z' };
      useStore.setState({ deliverables: [], tasks: useStore.getState().tasks.map(task => ({ ...task, reviewAccess: { actorId: 'stage-hod', canApprove: true }, reviewEvidence: { actorId: 'stage-hod', attachments: [attachment] } })) });
    });
    const files = page.getByRole('region', { name: 'Output files', exact: true });
    const download = files.getByRole('button', { name: 'Artwork-final-output.pdf Download', exact: true });
    await expect(download).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeEnabled();
    const box = await files.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(mobile ? 375 : 1280);
    // Local mode has no private Storage backend. The role control surfaces a
    // clear failure; the same file's successful Auth/Storage path is tested by
    // the disposable database release gate.
    await download.click();
    await expect(files.getByRole('alert')).toHaveText('The file could not be downloaded.');
    await expect(download).toBeEnabled();
    for (const dark of [false, true]) {
      await page.evaluate(dark => document.documentElement.classList.toggle('dark', dark), dark);
      const result = await new AxeBuilder({ page }).include('section[aria-label="Output files"]').analyze();
      expect(result.violations, `${dark ? 'dark' : 'light'} evidence controls`).toEqual([]);
    }
    if (mobile) {
      await page.setViewportSize({ width: 844, height: 375 });
      await download.scrollIntoViewIfNeeded();
      const landscape = await download.boundingBox();
      expect(landscape!.x).toBeGreaterThanOrEqual(0);
      expect(landscape!.x + landscape!.width).toBeLessThanOrEqual(844);
      await page.setViewportSize({ width: 375, height: 844 });
    }
    if (mobile) await page.screenshot({ path: testInfo.outputPath('hod-evidence-mobile.png') });
    await page.getByRole('button', { name: 'Full edit', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Output files', exact: true })).toBeVisible();
  });
}

test('a cancelled evidence download recovers after session reset and cannot start for another account', async ({ page }) => {
  await seed(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/app/store/workspaceStore.ts');
    useStore.setState({ tasks: useStore.getState().tasks.map(task => ({ ...task, assignedTo: 'stage-staff', deliverableId: 'evidence-output', serviceCycleId: 'evidence-cycle', attachmentLink: undefined, status: 'Waiting Approval' })) });
  });
  await openAs(page, 'stage-hod');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/app/store/workspaceStore.ts');
    const attachment = { id: 'demo-service-file-urban-brief', bucket: 'local-service-demo', path: 'urban-eats/monthly-content-brief.txt', fileName: 'UrbanEats-monthly-content-brief.txt', mimeType: 'text/plain', sizeBytes: 303, uploadedBy: 'stage-staff', uploadedAt: '2026-10-14T00:00:00.000Z' };
    useStore.setState({ deliverables: [], tasks: useStore.getState().tasks.map(task => ({ ...task, reviewAccess: { actorId: 'stage-hod', canApprove: true }, reviewEvidence: { actorId: 'stage-hod', attachments: [attachment] } })) });
  });
  const files = page.getByRole('region', { name: 'Output files', exact: true });
  const button = files.getByRole('button', { name: 'UrbanEats-monthly-content-brief.txt Download', exact: true });
  const downloads: string[] = [];
  page.on('download', download => downloads.push(download.suggestedFilename()));

  // Invalidate synchronously after the click starts. The download handler is
  // suspended at its dynamic import, so this deterministically exercises the
  // session guard without relying on a request for an already-cached module.
  await page.evaluate(async () => {
    const { invalidateWorkspaceSession } = await import('/src/infrastructure/persistence/workspaceSession.ts');
    const button = document.querySelector<HTMLElement>('section[aria-label="Output files"] button');
    if (!button) throw new Error('Output download button was not rendered');
    button.click();
    invalidateWorkspaceSession();
  });
  await expect(files.getByRole('status')).toHaveCount(0);
  expect(downloads).toEqual([]);

  // A fresh attempt in the same HOD session succeeds after the reset.
  const successfulDownload = page.waitForEvent('download');
  await button.click();
  expect((await successfulDownload).suggestedFilename()).toBe('UrbanEats-monthly-content-brief.txt');
  await expect(button).toBeEnabled();

  // Starting another attempt and switching the active identity in the same
  // browser task must invalidate it before the file can be downloaded.
  await page.evaluate(async () => {
    const { useStore } = await import('/src/app/store/workspaceStore.ts');
    const { invalidateWorkspaceSession } = await import('/src/infrastructure/persistence/workspaceSession.ts');
    const button = document.querySelector<HTMLElement>('section[aria-label="Output files"] button');
    if (!button) throw new Error('Output download button was not rendered');
    button.click();
    invalidateWorkspaceSession();
    useStore.setState({ currentUser: useStore.getState().users.find(user => user.id === 'stage-pm') });
  });
  await expect(files).toHaveCount(0);
  await expect.poll(() => downloads.length).toBe(1);
});


test('PM assignments remain available across departments and signed output fields explain revision', async ({ page }) => {
  await seed(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/app/store/workspaceStore.ts');
    const state = useStore.getState();
    useStore.setState({ users: state.users.map(user => user.id === 'stage-pm' ? { ...user, departments: ['Management'], department: 'Management' } : user),
      currentUser: { ...state.currentUser!, departments: ['Management'], department: 'Management' } });
  });
  await openAs(page, 'stage-pm');
  await page.getByRole('button', { name: 'Full edit', exact: true }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const assignee = page.getByRole('combobox', { name: 'Assignee', exact: true });
  await expect(assignee.locator('option[value="stage-pm"]')).toHaveCount(1);
  await assignee.selectOption('stage-pm');
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await page.evaluate(async () => {
    const { useStore } = await import('/src/app/store/workspaceStore.ts');
    useStore.setState({ tasks: useStore.getState().tasks.map(task => ({ ...task, status: 'Approved', completionPercentage: 80 })) });
  });
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Task Title', exact: true })).toHaveAttribute('readonly', '');
  await expect(page.getByRole('textbox', { name: 'Attachment URL', exact: true })).toHaveAttribute('readonly', '');
  await expect(page.getByText('Ask the HOD or project manager to return approved work for revision.', { exact: true })).toBeVisible();
});

test('an internal reviewer can open the earlier output without its private brief', async ({ page }) => {
  await seed(page);
  await openAs(page, 'stage-hod');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/app/store/workspaceStore.ts');
    const state = useStore.getState();
    useStore.setState({ currentUser: state.users.find(user => user.id === 'stage-hod'), tasks: state.tasks.map(task => ({ ...task,
      workflowStepKind: 'internal_review', predecessorTaskIds: ['hidden-work'], status: 'Waiting Approval', completionPercentage: 60,
      reviewAccess: { actorId: 'stage-hod', canApprove: true }, reviewEvidence: { actorId: 'stage-hod', attachments: [],
        links: [{ taskId: 'hidden-work', url: 'https://example.com/output.mp4', name: 'Final video', outputVersion: 2 }] } })) });
  });
  await expect(page.getByRole('region', { name: 'Review inputs', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Final video Open output', exact: true })).toHaveAttribute('href', 'https://example.com/output.mp4');
});
