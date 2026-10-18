import { expect, test, type Page } from '@playwright/test';

const taskId = 'ui-feedback-task';
const seed = async (page: Page, role: 'Staff' | 'HOD', locale: 'en' | 'zh' = 'en') => {
  await page.goto('/login');
  await page.evaluate(async ({ role, locale }) => {
    const { useStore } = await import('/src/store/index.ts');
    const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
    const state = useStore.getState();
    const staff = { ...state.users.find(user => user.name === 'Staff Demo')!, mustResetPassword: false };
    const hod = { ...staff, id: 'ui-hod', name: 'Review HOD', role: 'HOD', customRoleId: undefined, customRoleName: undefined };
    const actor = role === 'Staff' ? staff : hod;
    for (const user of [staff, hod]) {
      enablePasswordResetBypass(user.id);
      localStorage.setItem(`aitask:release-notice:2026-08-service-operations:${user.id}`, 'acknowledged');
    }
    localStorage.setItem('aitask:locale', locale);
    localStorage.setItem('aitask:onboarding:v1', JSON.stringify({ 'ui-hod': { status: 'skipped', updatedAt: new Date().toISOString() } }));
    useStore.setState({ currentUser: actor, users: [staff, hod, ...state.users.filter(user => user.id !== staff.id)],
      rolePermissions: [], clients: [], projects: [], clientPlans: [], deliverables: [], serviceCycles: [], notifications: [],
      tasks: [{ ...state.tasks[0], id: 'ui-feedback-task', title: 'Pending Designer artwork', clientName: 'UI Company', clientId: undefined,
        projectId: undefined, projectName: undefined, assignedTo: actor.id, assignedBy: hod.id, createdBy: hod.id, department: actor.department,
        status: 'In Progress', isCompleted: false, revisionCount: 0, completionPercentage: 50, predecessorTaskIds: [],
        serviceCycleId: undefined, deliverableId: undefined, comments: [], approvalHistory: [], workState: undefined, visibility: 'internal' }],
      backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 } });
  }, { role, locale });
  await page.goto(`/tasks?taskId=${taskId}`);
  await expect(page.getByRole('dialog', { name: 'Pending Designer artwork' })).toBeVisible();
};
const successes = (page: Page) => page.evaluate(async () => {
  const { useToastStore } = await import('/src/store/useToastStore.ts');
  return useToastStore.getState().toasts.filter(toast => toast.type === 'success').map(toast => typeof toast.message === 'object' ? toast.message.id : toast.message);
});

for (const role of ['Staff', 'HOD'] as const) {
  test(`${role} details show one confirmation after a slow acknowledgement and preserve later input`, async ({ page }) => {
    await seed(page, role);
    await page.evaluate(async () => {
      const { useStore } = await import('/src/store/index.ts');
      const { useToastStore } = await import('/src/store/useToastStore.ts');
      useToastStore.setState({ toasts: [] });
      useStore.setState({ commitPendingMutation: () => new Promise(resolve => { (window as unknown as { finishUiSave: () => void }).finishUiSave = () => resolve({ ok: true }); }) });
    });
    await page.getByRole('button', { name: 'Full edit', exact: true }).click();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByLabel('Task Title', { exact: true }).fill('Submitted artwork');
    await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
    expect(await successes(page)).toEqual([]);
    await page.getByLabel('Task Title', { exact: true }).fill('Later unsent artwork');
    await page.evaluate(() => (window as unknown as { finishUiSave: () => void }).finishUiSave());
    await expect.poll(() => successes(page)).toEqual(['task.updated']);
    await expect(page.getByLabel('Task Title', { exact: true })).toHaveValue('Later unsent artwork');
  });

  for (const locale of ['en', 'zh'] as const) {
    test(`${role} ${locale} review enquiry stays a comment and does not mark work blocked`, async ({ page }) => {
      await seed(page, role, locale);
      await page.evaluate(async () => {
        const { useStore } = await import('/src/store/index.ts');
        const { useToastStore } = await import('/src/store/useToastStore.ts');
        useStore.setState(state => ({ tasks: state.tasks.map(task => ({ ...task, status: 'Waiting Approval', workState: { reviewRequestedBy: state.currentUser!.id, reviewRequestedAt: '2026-10-14T00:00:00Z' } })) }));
        useToastStore.setState({ toasts: [] });
      });
      await page.getByRole('button', { name: locale === 'en' ? 'Request review update' : '询问审核进度', exact: true }).click();
      await page.getByLabel(locale === 'en' ? 'What review update do you need?' : '您需要了解哪些审核进度？').fill('Please review Pending Designer artwork');
      await page.getByRole('button', { name: locale === 'en' ? 'Request review update' : '询问审核进度', exact: true }).last().click();
      await expect.poll(() => successes(page)).toEqual(['feedback.reviewUpdateRequested']);
      const result = await page.evaluate(async () => { const { useStore } = await import('/src/store/index.ts'); const task = useStore.getState().tasks[0]; return { status: task.status, blocker: task.workState?.blocker, comments: task.comments?.map(item => item.text), assignedTo: task.assignedTo, actor: useStore.getState().currentUser!.id }; });
      expect(result).toMatchObject({ status: 'Waiting Approval', blocker: undefined, comments: ['Please review Pending Designer artwork'] });
      expect(result.assignedTo).toBe(result.actor);
      const confirmation = page.getByRole('dialog').getByText(locale === 'en' ? 'Review update requested.' : '已询问审核进度。', { exact: true });
      await expect(confirmation).toBeVisible();
      await expect(confirmation).toBeInViewport();
      await page.screenshot({ path: test.info().outputPath(`${role}-${locale}-feedback.png`), fullPage: true });
    });

    test(`${role} ${locale} missing work links explain the outcome without revealing records`, async ({ page }) => {
      await seed(page, role, locale);
      await page.goto('/tasks?taskId=hidden-or-deleted');
      await expect(page.getByText(locale === 'en' ? 'This work is no longer available to you.' : '您目前无法访问此工作。', { exact: true })).toBeVisible();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.getByRole('link', { name: locale === 'en' ? 'Go to your workspace' : '进入您的工作区' })).toBeVisible();
    });
  }
}

test('draft storage failure is explained without losing the current work update', async ({ page }) => {
  await seed(page, 'Staff');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) { if (key.startsWith('aitask:draft-recovery:')) throw new DOMException('Quota', 'QuotaExceededError'); return original.call(this, key, value); };
  });
  await page.getByPlaceholder('Add a work update…').fill('Keep this in memory');
  await expect(page.getByRole('alert')).toContainText('Your draft could not be saved on this device.');
  await expect(page.getByPlaceholder('Add a work update…')).toHaveValue('Keep this in memory');
  await page.getByRole('button', { name: 'Send work update', exact: true }).click();
  await expect.poll(() => successes(page)).toEqual(['feedback.workUpdateAdded']);
  await expect(page.getByText('Your draft could not be saved on this device.', { exact: true })).toHaveCount(0);
});


test('local save failure never shows success and can retry after storage is available', async ({ page }) => {
  await seed(page, 'Staff');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    (window as unknown as { restoreUiStorage: () => void }).restoreUiStorage = () => { Storage.prototype.setItem = original; };
    Storage.prototype.setItem = function(key, value) { if (key === 'market-task-storage') throw new DOMException('Quota', 'QuotaExceededError'); return original.call(this, key, value); };
  });
  await page.getByPlaceholder('Add a work update…').fill('Persist this update once');
  await page.getByRole('button', { name: 'Send work update', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'This change could not be saved on this device.' })).toBeVisible();
  expect(await successes(page)).toEqual([]);
  await page.evaluate(() => (window as unknown as { restoreUiStorage: () => void }).restoreUiStorage());
  await page.getByRole('button', { name: 'Retry save', exact: true }).click();
  await expect.poll(() => successes(page)).toEqual(['feedback.workUpdateAdded']);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('market-task-storage')!).state.tasks[0].comments.map((comment: { text: string }) => comment.text));
  expect(saved).toEqual(['Persist this update once']);
});

for (const locale of ['en', 'zh'] as const) {
  test(`notification popup ${locale} preserves titles and stays open while focused`, async ({ page }) => {
    await seed(page, 'Staff', locale);
    await page.goto('/tasks');
    await expect(page.locator('[data-popup-ready="true"]')).toHaveCount(1);
    await page.clock.install();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(async () => {
      const { useStore } = await import('/src/store/index.ts');
      useStore.setState(state => ({ notifications: [{ id: 'popup-ui-test', targetUserId: state.currentUser!.id, title: 'Task Ready for Approval', message: '"Pending Designer artwork" is ready for department review.', route: { page: 'tasks', entityId: 'ui-feedback-task' }, category: 'review', importance: 'action', iconType: 'status', createdAt: new Date().toISOString(), isRead: false }, ...state.notifications] }));
    });
    const popup = page.getByRole('article', { name: locale === 'en' ? 'New notification: Ready for department review' : '新通知：任务待部门审核' });
    await expect(popup).toBeVisible();
    await expect(popup).toContainText('Pending Designer artwork');
    await popup.hover();
    await popup.getByRole('button', { name: locale === 'en' ? 'Mark as read' : '标为已读', exact: true }).focus();
    await page.mouse.move(0, 0);
    await page.clock.fastForward(10_000);
    await expect(popup).toBeVisible();
    await page.screenshot({ path: test.info().outputPath(`popup-${locale}-mobile.png`), fullPage: true });
    await popup.getByRole('button', { name: locale === 'en' ? 'Mark as read' : '标为已读', exact: true }).click();
    await expect(popup).toBeHidden();
  });
}
