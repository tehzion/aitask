import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const openAs = async (page: Page, actorId: string) => {
  await page.evaluate(async id => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ currentUser: useStore.getState().users.find(user => user.id === id)! });
  }, actorId);
  await page.goto('/tasks?taskId=stage-task');
  await expect(page.getByRole('dialog', { name: actorId === 'stage-client' ? 'Delivery details' : 'Stage artwork', exact: true })).toBeVisible();
};

const seed = async (page: Page) => {
  await page.goto('/login');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
    const state = useStore.getState();
    const base = state.users.find(user => user.name === 'Staff Demo')!;
    const member = (id: string, role: 'Staff' | 'HOD' | 'Project Manager' | 'Client') => ({ ...base, id, name: id, role, departments: role === 'Client' ? ['Client'] : ['Designer'], department: role === 'Client' ? 'Client' : 'Designer', companyName: role === 'Client' ? 'Stage Company' : undefined, customRoleId: undefined, customRoleName: undefined, permissions: undefined, isSuperAdmin: false, mustResetPassword: false });
    const users = [member('stage-pm', 'Project Manager'), member('stage-hod', 'HOD'), member('stage-staff', 'Staff'), member('stage-client', 'Client')];
    for (const user of users) { enablePasswordResetBypass(user.id); localStorage.setItem(`aitask:release-notice:2026-08-service-operations:${user.id}`, 'acknowledged'); }
    localStorage.setItem('aitask:locale', 'en');
    useStore.setState({ currentUser: users[0], users, rolePermissions: [], projects: [], clientPlans: [], deliverables: [], serviceCycles: [], notifications: [], clients: [{ id: 'stage-company', clientName: 'Stage Company', createdBy: 'stage-pm', createdAt: '2026-10-01', updatedAt: '2026-10-01' }], tasks: [{ ...state.tasks[0], generatedFromDeliverable: false, workflowStepId: undefined, workflowStepKind: undefined, workflowDependenciesReady: undefined, internalReview: undefined, id: 'stage-task', title: 'Stage artwork', clientId: 'stage-company', clientName: 'Stage Company', projectId: undefined, deliverableId: undefined, serviceCycleId: undefined, department: 'Designer', assignedTo: '', assignedBy: 'stage-pm', createdBy: 'stage-pm', status: 'Pending', isCompleted: false, completionPercentage: 0, revisionCount: 0, clientApprovalStatus: 'Pending', visibility: 'client-visible', predecessorTaskIds: [], workState: {}, workHistory: [], comments: [], approvalHistory: [] }], backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 } });
    if (!useStore.getState().updateTaskAssignee('stage-task', 'stage-hod').ok) throw new Error('PM assignment failed');
  });
};

test('legacy HOD can delegate and approve through the full editor without completing for the PM', async ({ page }) => {
  await seed(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ users: useStore.getState().users.map(user => user.id === 'stage-hod' ? { ...user, role: 'Staff' as const, customRoleId: 'builtin-hod' } : user) });
  });
  await openAs(page, 'stage-hod');
  await page.getByRole('button', { name: 'Full edit', exact: true }).click();
  await page.getByRole('combobox', { name: 'Choose a team member', exact: true }).selectOption('stage-staff');
  await page.getByRole('button', { name: 'Assign Task', exact: true }).click();
  await expect(page.getByRole('progressbar', { name: 'Task progress', exact: true })).toHaveAttribute('aria-valuenow', '20');
  await openAs(page, 'stage-staff');
  await page.getByRole('button', { name: 'Start work', exact: true }).click();
  await page.getByRole('button', { name: 'Send for review', exact: true }).click();
  await openAs(page, 'stage-hod');
  await page.getByRole('button', { name: 'Full edit', exact: true }).click();
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByRole('progressbar', { name: 'Task progress', exact: true })).toHaveAttribute('aria-valuenow', '80');
  await expect(page.getByRole('button', { name: 'Confirm completion', exact: true })).toHaveCount(0);
});

test('customer revision returns to Staff and requires another HOD approval before PM completion', async ({ page }) => {
  test.setTimeout(60_000);
  await seed(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ tasks: useStore.getState().tasks.map(task => ({ ...task, status: 'Approved', assignedTo: 'stage-staff', completionPercentage: 80 })) });
  });
  await openAs(page, 'stage-client');
  await page.getByPlaceholder('Add context for the team…').fill('Use the new artwork');
  await page.getByRole('button', { name: 'Request changes', exact: true }).click();
  await expect(page.getByRole('progressbar', { name: 'Delivery progress', exact: true })).toHaveAttribute('aria-valuenow', '50');
  await openAs(page, 'stage-pm');
  await expect(page.getByRole('button', { name: 'Confirm completion', exact: true })).toHaveCount(0);
  await openAs(page, 'stage-staff');
  await page.getByRole('button', { name: 'Send for review', exact: true }).click();
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
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ users: useStore.getState().users.filter(user => user.id !== 'stage-hod'), tasks: useStore.getState().tasks.map(task => ({ ...task, assignedTo: 'stage-staff', status: 'In Progress', completionPercentage: 30 })) });
  });
  await openAs(page, 'stage-staff');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const { getDepartmentReviewers } = await import('/src/lib/taskWorkflowAccess.ts');
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
    const { useStore } = await import('/src/store/index.ts');
    const state = useStore.getState();
    useStore.setState({ users: state.users.filter(user => user.id !== 'stage-hod'), tasks: state.tasks.map(task => ({ ...task, assignedTo: 'stage-staff', status: 'In Progress', completionPercentage: 30 })) });
  });
  await openAs(page, 'stage-staff');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const { getDepartmentReviewers } = await import('/src/lib/taskWorkflowAccess.ts');
    const state = useStore.getState();
    // Reloading a local demo restores its seed HOD; remove that demo reviewer
    // as well so this fixture represents the production Designer configuration.
    const hods = new Set(getDepartmentReviewers(state.users, state.tasks[0], state.rolePermissions).filter(user => user.role !== 'Project Manager').map(user => user.id));
    useStore.setState({ users: state.users.filter(user => !hods.has(user.id)) });
  });
  await page.getByRole('button', { name: 'Send for review', exact: true }).click();
  await expect(page.getByRole('progressbar', { name: 'Task progress', exact: true })).toHaveAttribute('aria-valuenow', '60');
  expect(await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    return useStore.getState().notifications.some(n => n.targetUserId === 'stage-pm' && n.title === 'Task Ready for Approval');
  })).toBe(true);
  await openAs(page, 'stage-pm');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const { getDepartmentReviewers } = await import('/src/lib/taskWorkflowAccess.ts');
    const state = useStore.getState();
    // Reloading a local demo restores its seed HOD; remove that demo reviewer
    // as well so this fixture represents the production Designer configuration.
    const hods = new Set(getDepartmentReviewers(state.users, state.tasks[0], state.rolePermissions).filter(user => user.role !== 'Project Manager').map(user => user.id));
    useStore.setState({ users: state.users.filter(user => !hods.has(user.id)) });
  });
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByRole('progressbar', { name: 'Task progress', exact: true })).toHaveAttribute('aria-valuenow', '80');
  await page.getByRole('button', { name: 'Confirm completion', exact: true }).click();
  await expect(page.getByRole('progressbar', { name: 'Task progress', exact: true })).toHaveAttribute('aria-valuenow', '100');
});

for (const status of ['Waiting Approval', 'Approved', 'Completed']) {
  test(`Staff cannot delete ${status} work while the portfolio PM retains management`, async ({ page }) => {
    await seed(page);
    await page.evaluate(async status => {
      const { useStore } = await import('/src/store/index.ts');
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
      const { useStore } = await import('/src/store/index.ts');
      useStore.setState({ tasks: useStore.getState().tasks.map(task => ({ ...task, assignedTo: 'stage-staff', deliverableId: 'evidence-output', serviceCycleId: 'evidence-cycle', attachmentLink: undefined, status: 'Waiting Approval', completionPercentage: 60 })) });
    });
    await openAs(page, 'stage-hod');
    await page.evaluate(async () => {
      const { useStore } = await import('/src/store/index.ts');
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

test('a pending evidence download recovers after session reset and cannot start for another account', async ({ page }) => {
  await seed(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ tasks: useStore.getState().tasks.map(task => ({ ...task, assignedTo: 'stage-staff', deliverableId: 'evidence-output', serviceCycleId: 'evidence-cycle', attachmentLink: undefined, status: 'Waiting Approval' })) });
  });
  await openAs(page, 'stage-hod');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const attachment = { id: 'file', bucket: 'client-service-files', path: 'aitask-main/stage-company/evidence-cycle/output.pdf', fileName: 'output.pdf', mimeType: 'application/pdf', sizeBytes: 32, uploadedBy: 'stage-staff', uploadedAt: '2026-10-14T00:00:00.000Z' };
    useStore.setState({ deliverables: [], tasks: useStore.getState().tasks.map(task => ({ ...task, reviewAccess: { actorId: 'stage-hod', canApprove: true }, reviewEvidence: { actorId: 'stage-hod', attachments: [attachment] } })) });
  });
  let release!: () => void;
  let reached!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  const intercepted = new Promise<void>(resolve => { reached = resolve; });
  await page.route('**/src/lib/serviceFiles.ts*', async route => {
    const response = await route.fetch();
    const body = await response.text();
    const needle = 'const downloadServiceFile = async (attachment, options = {}) => {';
    expect(body).toContain(needle);
    reached();
    await hold;
    await route.fulfill({ response, body: body.replace(needle, needle + ' globalThis.__taskDownloadStarts = (globalThis.__taskDownloadStarts || 0) + 1;') + '\nglobalThis.__taskDownloadModuleReady = true;\n' });
  });
  const files = page.getByRole('region', { name: 'Output files', exact: true });
  const button = files.getByRole('button', { name: 'output.pdf Download', exact: true });
  await button.click();
  await intercepted;
  await expect(files.getByRole('status')).toHaveText('Downloading…');
  await page.evaluate(async () => {
    const { invalidateWorkspaceSession } = await import('/src/lib/workspaceSession.ts');
    invalidateWorkspaceSession();
  });
  await expect(button).toBeEnabled();
  await button.click();
  await expect(files.getByRole('status')).toHaveText('Downloading…');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ currentUser: useStore.getState().users.find(user => user.id === 'stage-pm') });
  });
  const loaded = page.waitForResponse(response => response.url().includes('/src/lib/serviceFiles.ts'));
  release();
  await loaded;
  await expect(files).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => Reflect.get(globalThis, '__taskDownloadModuleReady'))).toBe(true);
  expect(await page.evaluate(() => Reflect.get(globalThis, '__taskDownloadStarts') || 0)).toBe(0);
  await expect(page.getByRole('dialog').getByRole('alert')).toHaveCount(0);
});


test('PM assignments remain available across departments and signed output fields explain revision', async ({ page }) => {
  await seed(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
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
    const { useStore } = await import('/src/store/index.ts');
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
    const { useStore } = await import('/src/store/index.ts');
    const state = useStore.getState();
    useStore.setState({ currentUser: state.users.find(user => user.id === 'stage-hod'), tasks: state.tasks.map(task => ({ ...task,
      workflowStepKind: 'internal_review', predecessorTaskIds: ['hidden-work'], status: 'Waiting Approval', completionPercentage: 60,
      reviewAccess: { actorId: 'stage-hod', canApprove: true }, reviewEvidence: { actorId: 'stage-hod', attachments: [],
        links: [{ taskId: 'hidden-work', url: 'https://example.com/output.mp4', name: 'Final video', outputVersion: 2 }] } })) });
  });
  await expect(page.getByRole('region', { name: 'Review inputs', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Final video Open output', exact: true })).toHaveAttribute('href', 'https://example.com/output.mp4');
});
