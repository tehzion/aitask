import { expect, test, type Page } from '@playwright/test';

const seed = async (page: Page, role: 'Boss' | 'PM') => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/login');
  await page.evaluate(async role => {
    const { useStore, stopBackendAutoSync } = await import('/src/store/index.ts');
    const { useToastStore } = await import('/src/store/useToastStore.ts');
    const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
    stopBackendAutoSync();
    const state = useStore.getState();
    const actor = state.users.find(user => role === 'Boss' ? user.isSuperAdmin : user.role === 'Project Manager' && !user.isSuperAdmin)!;
    const worker = state.users.find(user => user.role === 'Staff' && user.departments?.includes('Designer'))!;
    enablePasswordResetBypass(actor.id);
    localStorage.setItem('aitask:locale', 'en');
    localStorage.setItem(`aitask:release-notice:2026-08-service-operations:${actor.id}`, 'acknowledged');
    const stamp = new Date().toISOString();
    useStore.setState({ currentUser: { ...actor, mustResetPassword: false }, clients: [
      { id: 'audit-company', clientName: 'Audit Company', createdBy: actor.id, createdAt: stamp, updatedAt: stamp },
      { id: 'audit-second', clientName: 'Second Company', createdBy: actor.id, createdAt: stamp, updatedAt: stamp },
      { id: 'audit-foreign', clientName: 'Other Portfolio', createdBy: 'another-pm', createdAt: stamp, updatedAt: stamp },
    ], projects: [0, 1, 2, 3].map(index => ({ id: `audit-project-${index}`, clientId: index === 3 ? 'audit-foreign' : 'audit-company', clientName: index === 3 ? 'Other Portfolio' : 'Audit Company', projectName: `Campaign ${index}`, serviceType: 'Design', serviceTypes: ['Design'], createdBy: index === 3 ? 'another-pm' : actor.id, createdAt: stamp, updatedAt: stamp })),
    tasks: [{ id: 'audit-task', title: 'Campaign work', clientId: 'audit-company', clientName: 'Audit Company', projectId: 'audit-project-0', projectName: 'Campaign 0', serviceType: 'Design', department: 'Designer', assignedTo: worker.id, createdBy: actor.id, status: 'Pending', priority: 'Medium', startDate: stamp.slice(0, 10), dueDate: '', completionPercentage: 0, isCompleted: false, revisionCount: 0, clientApprovalStatus: 'Pending', isRecurring: false, recurrenceFrequency: 'None', version: 1 }],
    notifications: [], clientPlans: [], serviceCycles: [], deliverables: [], cycleComments: [], addons: [], rolePermissions: [],
    backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0, error: undefined, conflict: undefined } });
    useToastStore.setState({ toasts: [] });
  }, role);
};

const holdSave = async (page: Page) => {
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const { useToastStore } = await import('/src/store/useToastStore.ts');
    useToastStore.setState({ toasts: [] });
    const { confirmMutationFeedback } = await import('/src/lib/mutationFeedback.ts');
    const acknowledge = () => {
      confirmMutationFeedback();
      useStore.setState(state => ({ backend: { ...state.backend, mode: 'supabase', status: 'live', isSaving: false, hasLocalChanges: false, pendingMutations: 0, error: undefined, conflict: undefined, lastSavedAt: new Date().toISOString() } }));
    };
    useStore.setState(state => ({ backend: { ...state.backend, mode: 'supabase', status: 'live', hasLocalChanges: false, error: undefined },
      commitPendingMutation: () => new Promise(resolve => {
        useStore.setState(state => ({ backend: { ...state.backend, status: 'saving', isSaving: true, hasLocalChanges: true } }));
        (window as unknown as { finishAuditSave: (ok: boolean) => void }).finishAuditSave = ok => {
          if (ok) { acknowledge(); resolve({ ok: true }); }
          else {
            useStore.setState(state => ({ backend: { ...state.backend, status: 'retry_required', isSaving: false, hasLocalChanges: true, error: 'Save was not confirmed. Your pending change is retained for retry.' } }));
            resolve({ ok: false, error: 'Save was not confirmed. Your pending change is retained for retry.' });
          }
        };
      }),
      retryPendingSave: async () => {
        useStore.setState(state => ({ tasks: state.tasks.map(task => task.id === 'audit-task' ? { ...task, priority: 'High' } : task) }));
        acknowledge(); return { ok: true };
      },
    }));
  });
};

const successes = (page: Page) => page.evaluate(async () => {
  const { useToastStore } = await import('/src/store/useToastStore.ts');
  return useToastStore.getState().toasts.filter(toast => toast.type === 'success').length;
});

for (const role of ['Boss', 'PM'] as const) {
  for (const failFirst of [false, true]) {
    test(`${role} waits for confirmation before announcing a task save${failFirst ? ' and keeps retry feedback accurate' : ''}`, async ({ page }) => {
      await seed(page, role);
      await page.goto('/tasks?taskId=audit-task');
      const dialog = page.getByRole('dialog', { name: 'Campaign work' });
      if (role === 'PM') await dialog.getByRole('button', { name: 'Full edit', exact: true }).click();
      await dialog.getByRole('button', { name: 'Edit', exact: true }).click();
      await dialog.getByRole('combobox', { name: 'Priority', exact: true }).selectOption('High');
      await holdSave(page);
      await dialog.getByRole('button', { name: 'Save Changes', exact: true }).click();
      expect(await successes(page)).toBe(0);
      await page.evaluate(ok => (window as unknown as { finishAuditSave: (ok: boolean) => void }).finishAuditSave(ok), !failFirst);
      if (failFirst) {
        await expect(page.getByText('Save was not confirmed. Your pending change is retained for retry.', { exact: true }).first()).toBeVisible();
        expect(await successes(page)).toBe(0);
        await page.getByRole('button', { name: 'Retry my changes', exact: true }).first().click();
        await expect(page.getByText('Save was not confirmed. Your pending change is retained for retry.', { exact: true })).toHaveCount(0);
      }
      await expect.poll(() => successes(page)).toBe(1);
      await expect(page.getByRole('status').filter({ hasText: 'Task "Campaign work" updated successfully' })).toBeVisible();
      if (role === 'Boss' && !failFirst) await page.screenshot({ path: '/private/tmp/aitask-boss-save-feedback.png' });
    });
  }

  test(`${role} conflict feedback avoids internal IDs and field names`, async ({ page }) => {
    await seed(page, role);
    await page.goto('/settings');
    await page.evaluate(async () => {
      const { useStore } = await import('/src/store/index.ts');
      useStore.setState(state => ({ backend: { ...state.backend, mode: 'supabase', status: 'conflict', hasLocalChanges: true, error: 'A newer record is available.', conflict: { entityType: 'service_cycle', entityId: 'internal-cycle-identifier', changedFields: ['serviceItems', 'clientApprovalStatus'], expectedVersion: 1, currentVersion: 2 } } }));
    });
    await expect(page.getByText(/internal-cycle-identifier|clientApprovalStatus/)).toHaveCount(0);
    await expect(page.getByText('This item was changed by someone else. Review the latest version before retrying.', { exact: true }).first()).toBeVisible();
  });

  test(`${role} settings count distinct accessible companies`, async ({ page }) => {
    await seed(page, role);
    await page.goto('/settings');
    await expect(page.getByText('Visible Companies', { exact: true }).last()).toBeVisible();
    await page.evaluate(async () => {
      const { useStore } = await import('/src/store/index.ts');
      useStore.setState(state => ({ clients: state.clients.filter(item => item.id.startsWith('audit-')), projects: state.projects.filter(item => item.id.startsWith('audit-')), tasks: state.tasks.filter(item => item.id.startsWith('audit-')) }));
    });
    const metric = page.locator('.app-metric-card').filter({ hasText: 'Visible Companies' });
    await expect(metric).toContainText(role === 'Boss' ? '3' : '2');
  });
}

test('Boss completing a teammate task gets a normal status confirmation', async ({ page }) => {
  await seed(page, 'Boss');
  await page.goto('/tasks?taskId=audit-task');
  const dialog = page.getByRole('dialog', { name: 'Campaign work' });
  await dialog.getByRole('combobox', { name: 'Task status', exact: true }).selectOption('Completed');
  await expect(page.getByRole('status').filter({ hasText: 'Status updated to "Completed"' })).toBeVisible();
  await expect(page.getByText(/Nice work/)).toHaveCount(0);
});

test('PM plan review uses clear totals and does not claim activation is Boss-only', async ({ page }) => {
  await seed(page, 'PM');
  await page.goto('/clients/audit-company');
  await page.getByRole('tab', { name: 'Plan', exact: true }).click();
  await page.getByRole('button', { name: 'Add service plan', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Create service plan', exact: true });
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await dialog.getByRole('button', { name: /^Fully custom/ }).click();
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Service name', exact: true }).fill('Design');
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(dialog.getByText('Service cycles start when the plan is activated.', { exact: true })).toBeVisible();
  await expect(dialog.getByText(/until Boss Koo activates/)).toHaveCount(0);
  for (const label of ['Subtotal', 'Discount', 'Tax', 'Total']) {
    await expect(dialog.locator('#review-step').locator('..').getByText(label, { exact: true })).toBeVisible();
  }
});

for (const role of ['Boss', 'PM'] as const) {
  test(`${role} workflow editor keeps company and department fixed`, async ({ page }) => {
    await seed(page, role);
    await page.evaluate(async () => {
      const { useStore } = await import('/src/store/index.ts');
      useStore.setState(state => ({ tasks: state.tasks.map(task => ({ ...task, generatedFromDeliverable: true, workflowStepId: 'audit-work', workflowStepKind: 'work' })) }));
    });
    await page.goto('/tasks?taskId=audit-task');
    const dialog = page.getByRole('dialog', { name: 'Campaign work' });
    if (role === 'PM') await dialog.getByRole('button', { name: 'Full edit', exact: true }).click();
    await dialog.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(dialog.getByRole('textbox', { name: 'Client / Brand', exact: true })).toBeDisabled();
    await expect(dialog.getByRole('combobox', { name: 'Department', exact: true })).toBeDisabled();
    await expect(dialog.getByRole('textbox', { name: 'Task Title', exact: true })).toBeEditable();
    await expect(dialog.getByText('Company and department are set by the service workflow.', { exact: true })).toBeVisible();
  });
}
