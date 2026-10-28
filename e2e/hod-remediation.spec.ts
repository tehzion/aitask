import { expect, test, type Page } from '@playwright/test';

const seed = async (page: Page, actor: 'hod' | 'pm' | 'boss', own = false) => {
  await page.goto('/login');
  // Let the app finish its startup load so seeded state is not overwritten.
  await page.waitForFunction(() => Boolean(document.querySelector('form input, main')));
  await page.evaluate(async ({ actor, own }) => {
    const { useStore, stopBackendAutoSync } = await import('/src/store/index.ts');
    const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
    stopBackendAutoSync();
    const old = useStore.getState();
    const users = [
      { id: 'hod', name: 'Department HOD', role: 'HOD', departments: ['Designer'], department: 'Designer', mustResetPassword: false },
      { id: 'staff', name: 'Worker', role: 'Staff', departments: ['Designer'], department: 'Designer', mustResetPassword: false },
      { id: 'pm', name: 'Responsible PM', role: 'Project Manager', departments: [], mustResetPassword: false },
      { id: 'boss', name: 'Boss', role: 'Project Manager', departments: ['Management'], department: 'Management', isSuperAdmin: true, mustResetPassword: false },
    ];
    for (const user of users) { enablePasswordResetBypass(user.id); localStorage.setItem(`aitask:release-notice:2026-08-service-operations:${user.id}`, 'acknowledged'); }
    localStorage.setItem('aitask:locale', 'en');
    const task = { ...old.tasks[0], id: 'independent-review', title: 'Independent artwork review', clientName: 'Review company', clientId: undefined, projectId: undefined, serviceCycleId: undefined, deliverableId: undefined, generatedFromDeliverable: false, workflowStepId: undefined, workflowStepKind: undefined, workflowDependenciesReady: undefined, internalReview: undefined, reviewDecision: undefined, reviewAccess: undefined, reviewEvidence: undefined, reviewCover: undefined, accountableLeadId: 'pm', department: 'Designer', assignedTo: own ? actor : 'staff', createdBy: 'pm', status: 'Waiting Approval', isCompleted: false, completionPercentage: 60, revisionCount: 0, clientApprovalStatus: 'Pending', workState: { reviewRequestedBy: own ? actor : 'staff' }, predecessorTaskIds: [], outputAttachments: [], comments: [], notes: undefined };
    useStore.setState({ currentUser: users.find(user => user.id === actor), users, tasks: [task], clients: [], projects: [], rolePermissions: [], notifications: [], serviceCycles: [], deliverables: [], clientPlans: [], backend: { ...old.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 } });
  }, { actor, own });
  await page.goto('/tasks?taskId=independent-review');
};

test('HOD-owned review uses an independent PM and retains accountable ownership', async ({ page }) => {
  await seed(page, 'hod', true);
  await expect(page.getByRole('status').filter({ hasText: 'Awaiting Review' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
  await page.evaluate(async () => { const { useStore } = await import('/src/store/index.ts'); useStore.setState({ currentUser: useStore.getState().users.find(user => user.id === 'pm')! }); });
  await page.goto('/tasks?taskId=independent-review');
  await page.evaluate(async () => { const { useStore } = await import('/src/store/index.ts'); useStore.setState({ users: useStore.getState().users.filter(user => ['hod','staff','pm','boss'].includes(user.id)) }); });
  await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeEnabled();
  // Review settings are a secondary disclosure for a PM.
  await page.locator('summary', { hasText: 'Review settings' }).click();
  const settings = page.getByRole('region', { name: 'Review responsibility' });
  await settings.getByRole('combobox', { name: 'Accountable lead', exact: true }).selectOption('hod');
  await settings.getByRole('combobox', { name: 'Temporary review cover', exact: true }).selectOption('pm');
  await settings.getByRole('button', { name: 'Save review responsibility' }).click();
  await expect(settings.getByText('Review cover and lead saved.', { exact: true })).toBeVisible();
  if (process.env.AITASK_HOD_EVIDENCE_DIR) await page.screenshot({ path: `${process.env.AITASK_HOD_EVIDENCE_DIR}/review-cover-desktop.png`, fullPage: true });
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect.poll(() => page.evaluate(async () => { const { useStore } = await import('/src/store/index.ts'); const task = useStore.getState().tasks[0]; return { status: task.status, lead: task.accountableLeadId, assignee: task.assignedTo }; })).toEqual({ status: 'Approved', lead: 'hod', assignee: 'hod' });
});

test('Boss self-review requires a reason and stores explicit override provenance', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await seed(page, 'boss', true);
  const settings = page.getByRole('region', { name: 'Review responsibility' });
  const button = settings.getByRole('button', { name: 'Approve with audited override', exact: true });
  await expect(button).toBeDisabled();
  await settings.getByLabel('Review override reason').fill('Time-critical release; independent cover unavailable.');
  if (process.env.AITASK_HOD_EVIDENCE_DIR) await page.screenshot({ path: `${process.env.AITASK_HOD_EVIDENCE_DIR}/review-override-mobile.png`, fullPage: true });
  await button.click();
  await expect.poll(() => page.evaluate(async () => { const { useStore } = await import('/src/store/index.ts'); const task = useStore.getState().tasks[0]; return { status: task.status, by: task.reviewDecision?.reviewedBy, reason: task.reviewDecision?.overrideReason }; })).toEqual({ status: 'Approved', by: 'boss', reason: 'Time-critical release; independent cover unavailable.' });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('department controls recover when an actor-bound cover snapshot expires', async ({ page }) => {
  await seed(page, 'hod');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const expiresAt = new Date(Date.now() + 3000).toISOString();
    useStore.setState({ tasks: useStore.getState().tasks.map(task => ({ ...task, reviewCover: { reviewerId:'pm', expiresAt }, reviewAccess: { actorId:'hod', canApprove:false, expiresAt } })) });
  });
  await expect(page.getByRole('button', { name:'Approve', exact:true })).toHaveCount(0);
  await expect(page.getByRole('button', { name:'Approve', exact:true })).toBeEnabled({ timeout:10000 });
});
