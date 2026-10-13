import { expect, test, type Page } from '@playwright/test';
import type { User, ServiceWorkflowTemplate } from '../src/types';

const seed = async (page: Page, role: 'Staff' | 'HOD', ready = true, legacy = false) => {
  await page.goto('/login');
  await expect(page.getByLabel('Email or username')).toBeVisible();
  return page.evaluate(async ({ role, ready, legacy }) => {
    const { useStore, stopBackendAutoSync } = await import('/src/store/index.ts');
    const { snapshotWorkflow } = await import('/src/lib/serviceManagement.ts');
    const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
    stopBackendAutoSync();
    const initial = useStore.getState();
    const boss: User = { id: 'browser-review-boss', name: 'Boss', role: 'Project Manager', isSuperAdmin: true, departments: ['Management'] };
    const worker: User = { id: 'browser-review-worker', name: 'Worker', role: 'Staff', departments: ['Video Editor', 'Designer'] };
    const hod: User = { id: 'browser-review-hod', name: 'Department HOD', role: 'HOD', departments: ['Video Editor'] };
    const template: ServiceWorkflowTemplate = { id: 'browser-review-template', name: 'Reviewed production', serviceTypes: ['Design'], revision: 1, isActive: true, createdAt: '', updatedAt: '', steps: [
      { id: 'work', order: 1, title: 'Create output', department: 'Designer', kind: 'work', clientVisible: false, required: true },
      { id: 'review', order: 2, title: 'Review output', department: 'Video Editor', kind: 'internal_review', clientVisible: false, required: true },
      { id: 'publish', order: 3, title: 'Publish output', department: 'Designer', kind: 'publishing', clientVisible: true, required: true },
    ] };
    useStore.setState({ ...initial, currentUser: boss, users: [boss, worker, hod], tasks: [], clients: [], projects: [], clientPlans: [], serviceCycles: [], deliverables: [], addons: [], notifications: [], registrations: [], rolePermissions: [], servicePricingSnapshots: [], backend: { ...initial.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 } });
    const plan = useStore.getState().createClientWithPlan({ clientName: 'Review QA', planName: 'Reviewed Plan', origin: 'custom', serviceItems: [{ id: 'review-service', name: 'Design', platforms: [], unit: 'output', quantity: 1, unitPriceMinor: 0, workflow: snapshotWorkflow(template) }], startDate: '2026-10-01', billingDay: 1, discountType: 'none', discountValue: 0, taxRateBps: 0 });
    useStore.getState().activateClientPlan(plan.planId!);
    const ids = useStore.getState().generateDeliverableTaskChain(useStore.getState().deliverables[0].id).taskIds!;
    ids.forEach(id => useStore.getState().updateTaskAssignee(id, worker.id));
    if (ready) useStore.getState().updateTaskStatus(ids[0], 'Completed');
    if (legacy) useStore.setState(state => ({ tasks: state.tasks.map(task => task.id === ids[1] ? { ...task, status: 'Completed', isCompleted: true, internalReview: undefined } : task) }));
    const actor = role === 'Staff' ? worker : hod;
    enablePasswordResetBypass(actor.id);
    localStorage.setItem(`aitask:release-notice:2026-08-service-operations:${actor.id}`, 'acknowledged');
    localStorage.setItem('aitask:locale', 'en');
    useStore.setState({ currentUser: actor });
    return { workId: ids[0], reviewId: ids[1], publishId: ids[2], reviewTitle: useStore.getState().tasks.find(task => task.id === ids[1])!.title, workTitle: useStore.getState().tasks.find(task => task.id === ids[0])!.title };
  }, { role, ready, legacy });
};

test('Staff cannot complete internal review in either editor', async ({ page }) => {
  const fixture = await seed(page, 'Staff');
  await page.goto(`/tasks?taskId=${fixture.reviewId}`);
  const dialog = page.getByRole('dialog', { name: fixture.reviewTitle });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('combobox', { name: 'All task statuses' }).locator('option[value="Completed"]')).toHaveJSProperty('disabled', true);
  await expect(dialog.getByRole('button', { name: 'Approve internal review', exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Full edit', exact: true }).click();
  await expect(dialog.getByRole('combobox', { name: 'Task status', exact: true }).locator('option[value="Completed"]')).toHaveJSProperty('disabled', true);
  await expect(dialog.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
});

for (const mobile of [false, true]) {
  test(`${mobile ? 'mobile' : 'desktop'} HOD approves without exposing the hidden predecessor`, async ({ page }) => {
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 950 });
    const fixture = await seed(page, 'HOD');
    await page.goto(`/tasks?taskId=${fixture.reviewId}`);
    const dialog = page.getByRole('dialog', { name: fixture.reviewTitle });
    await expect(dialog.getByText('Earlier steps are complete; their details are outside your access.')).toBeVisible();
    await expect(dialog.getByText(fixture.workTitle, { exact: true })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Approve internal review', exact: true }).click();
    await expect(dialog.getByText('Reviewed by Department HOD')).toBeVisible();
    await expect.poll(() => page.evaluate(async reviewId => {
      const { useStore } = await import('/src/store/index.ts');
      return useStore.getState().tasks.find(task => task.id === reviewId)?.internalReview?.reviewedBy;
    }, fixture.reviewId)).toBe('browser-review-hod');
  });
}

test('unfinished predecessors disable HOD approval and the completion option', async ({ page }) => {
  const fixture = await seed(page, 'HOD', false);
  await page.goto(`/tasks?taskId=${fixture.reviewId}`);
  const dialog = page.getByRole('dialog', { name: fixture.reviewTitle });
  await expect(dialog.getByRole('button', { name: 'Approve internal review', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('combobox', { name: 'All task statuses' }).locator('option[value="Completed"]')).toHaveJSProperty('disabled', true);
  await expect(dialog.getByText('Complete every required predecessor before submitting or completing this step.')).toBeVisible();
});

test('legacy completed review needs explicit approval and later revisions clear its signature', async ({ page }) => {
  const fixture = await seed(page, 'HOD', true, true);
  await page.goto(`/tasks?taskId=${fixture.reviewId}`);
  const dialog = page.getByRole('dialog', { name: fixture.reviewTitle });
  await dialog.getByRole('button', { name: 'Approve internal review', exact: true }).click();
  await expect(dialog.getByText('Reviewed by Department HOD')).toBeVisible();
  await page.evaluate(async fixture => {
    const { useStore } = await import('/src/store/index.ts');
    const worker = useStore.getState().users.find(user => user.id === 'browser-review-worker')!;
    useStore.setState({ currentUser: worker });
    useStore.getState().updateTaskStatus(fixture.publishId, 'Completed');
    useStore.getState().updateTaskAttachment(fixture.workId, 'https://example.com/new-output.pdf');
  }, fixture);
  await expect.poll(() => page.evaluate(async fixture => {
    const { useStore } = await import('/src/store/index.ts');
    const review = useStore.getState().tasks.find(task => task.id === fixture.reviewId)!;
    const publication = useStore.getState().tasks.find(task => task.id === fixture.publishId)!;
    return { reviewStatus: review.status, signed: Boolean(review.internalReview), publicationStatus: publication.status };
  }, fixture)).toEqual({ reviewStatus: 'Pending', signed: false, publicationStatus: 'Pending' });
});
