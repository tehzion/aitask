import { expect, test, type Page } from '@playwright/test';

const taskId = 'hod-status-task';
const title = 'HOD assigned shooting task';
const seed = async (page: Page, locale: 'en' | 'zh') => {
  await page.goto('/login');
  await page.evaluate(async locale => {
    const { useStore, stopBackendAutoSync } = await import('/src/store/index.ts');
    const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
    stopBackendAutoSync();
    const state = useStore.getState();
    const hod = { id: 'status-hod', name: 'Status HOD', role: 'HOD' as const, department: 'Video Shooting' as const, departments: ['Video Shooting', 'Video Editor'] as const, mustResetPassword: false };
    enablePasswordResetBypass(hod.id);
    localStorage.setItem('aitask:locale', locale);
    localStorage.setItem(`aitask:release-notice:2026-08-service-operations:${hod.id}`, 'acknowledged');
    const pm = { id: 'status-pm', name: 'Status PM', role: 'Project Manager' as const, departments: ['Management' as const] };
    const task = { id: 'hod-status-task', title: 'HOD assigned shooting task', clientId: 'status-client', clientName: 'Status Company', projectId: 'status-project', projectName: 'Shooting project', serviceType: 'Shooting', description: '', department: 'Video Shooting' as const, assignedTo: hod.id, assignedBy: pm.id, createdBy: pm.id, startDate: '2026-10-01', dueDate: '2026-10-30', priority: 'Medium' as const, status: 'In Progress', completionPercentage: 30, isCompleted: false, revisionCount: 0, clientApprovalStatus: 'Pending' as const, isRecurring: false, visibility: 'internal' as const, workState: {}, workHistory: [], comments: [] };
    useStore.setState({ currentUser: { ...hod, departments: [...hod.departments] }, users: [{ ...hod, departments: [...hod.departments] }, pm], tasks: [task], clients: [{ id: 'status-client', clientName: 'Status Company', createdBy: pm.id, createdAt: '2026-10-01', updatedAt: '2026-10-01' }], projects: [{ id: 'status-project', projectName: 'Shooting project', clientId: 'status-client', clientName: 'Status Company', createdBy: pm.id, services: ['Shooting'], startDate: '2026-10-01', deadline: '2026-10-30', totalTasks: 1, completedTasks: 0 }], rolePermissions: [], clientPlans: [], serviceCycles: [], deliverables: [], notifications: [], backend: { ...state.backend, mode: 'local', status: 'local', isSaving: false, isPulling: false, hasLocalChanges: false, pendingMutations: 0, error: undefined, errorCode: undefined } });
  }, locale);
  await page.goto(`/tasks?taskId=${taskId}`);
  const dialog = page.getByRole('dialog', { name: title });
  await expect(dialog).toBeVisible();
  const fullEdit = dialog.getByRole('button', { name: locale === 'zh' ? '完整编辑' : 'Full edit', exact: true });
  if (await fullEdit.isVisible()) await fullEdit.click();
  return dialog;
};

for (const locale of ['en', 'zh'] as const) {
  for (const code of ['FORBIDDEN', 'VALIDATION', 'NOT_FOUND'] as const) {
    test(`HOD ${locale} ${code} status rejection requires restore before a fresh save`, async ({ page }) => {
      if (locale === 'zh') await page.setViewportSize({ width: 390, height: 844 });
      const dialog = await seed(page, locale);
      await page.evaluate(async code => {
        const { useStore } = await import('/src/store/index.ts');
        const canonical = structuredClone(useStore.getState().tasks);
        useStore.setState({
          commitPendingMutation: async () => {
            const error = 'You do not have permission to make this change.';
            useStore.setState(state => ({ backend: { ...state.backend, mode: 'supabase', status: 'retry_required', errorCode: code, error, hasLocalChanges: true, pendingMutations: 1 } }));
            return { ok: false, code, error };
          },
          discardMutation: async () => { useStore.setState(state => ({ tasks: canonical, backend: { ...state.backend, status: 'live', hasLocalChanges: false, pendingMutations: 0, errorCode: undefined, error: undefined } })); },
        });
      }, code);
      await dialog.getByRole('combobox', { name: locale === 'zh' ? '任务状态' : 'Task status', exact: true }).selectOption('Pending');
      await expect(dialog.getByRole('alert')).toContainText(locale === 'zh' ? '您没有进行此更改的权限' : 'You do not have permission');
      await expect(dialog.getByRole('button', { name: locale === 'zh' ? '重试我的更改' : 'Retry my changes', exact: true })).toHaveCount(0);
      await expect(dialog.getByRole('alert')).toContainText(locale === 'zh' ? '修正被拒绝的更改' : 'correct the rejected change');
      await dialog.getByRole('button', { name: locale === 'zh' ? '恢复已保存数据' : 'Restore saved data', exact: true }).click();
      await expect(dialog.getByRole('combobox', { name: locale === 'zh' ? '任务状态' : 'Task status', exact: true })).toHaveValue('In Progress');
      await expect(dialog.getByRole('alert')).toHaveCount(0);
      await page.evaluate(async () => {
        const { useStore } = await import('/src/store/index.ts');
        useStore.setState({ commitPendingMutation: async () => ({ ok: true }) });
      });
      await dialog.getByRole('combobox', { name: locale === 'zh' ? '任务状态' : 'Task status', exact: true }).selectOption('Pending');
      await expect(dialog.getByRole('combobox', { name: locale === 'zh' ? '任务状态' : 'Task status', exact: true })).toHaveValue('Pending');
    });
  }
}

test('HOD transient status failure can retry and unlock the editor after confirmation', async ({ page }) => {
  const dialog = await seed(page, 'en');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({
      commitPendingMutation: async () => {
        useStore.setState(state => ({ backend: { ...state.backend, mode: 'supabase', status: 'retry_required', hasLocalChanges: true, pendingMutations: 1, errorCode: 'RETRY_REQUIRED', error: 'Save confirmation timed out.' } }));
        return { ok: false, code: 'RETRY_REQUIRED', error: 'Save confirmation timed out.' };
      },
      retryPendingSave: async () => {
        useStore.setState(state => ({ backend: { ...state.backend, status: 'live', hasLocalChanges: false, pendingMutations: 0, errorCode: undefined, error: undefined } }));
        return { ok: true };
      },
    });
  });
  await dialog.getByRole('combobox', { name: 'Task status', exact: true }).selectOption('Pending');
  await dialog.getByRole('button', { name: 'Retry my changes', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(dialog.getByRole('combobox', { name: 'Task status', exact: true })).toBeEnabled();
  await expect(dialog.getByRole('combobox', { name: 'Task status', exact: true })).toHaveValue('Pending');
});
