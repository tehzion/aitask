import { expect, test, type Page } from '@playwright/test';

const seed = async (page: Page) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/login');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
    const state = useStore.getState();
    const boss = state.users.find(user => user.isSuperAdmin)!;
    enablePasswordResetBypass(boss.id);
    localStorage.setItem('aitask:locale', 'en');
    localStorage.setItem(`aitask:release-notice:2026-08-service-operations:${boss.id}`, 'acknowledged');
    useStore.setState({ currentUser: { ...boss, mustResetPassword: false },
      users: [boss, { id: 'owner-qa-pm', name: 'Owner QA PM', role: 'Project Manager', department: 'Designer', departments: ['Designer'] }],
      clients: [{ id: 'recovery-qa-client', clientName: 'Recovery QA Company', createdAt: '2026-10-01', updatedAt: '2026-10-01' }],
      projects: [], tasks: [{ ...state.tasks[0], id: 'recovery-qa-task', title: 'Recovery QA Task', assignedTo: boss.id, createdBy: boss.id,
        clientId: 'recovery-qa-client', clientName: 'Recovery QA Company', projectId: undefined, projectName: undefined,
        department: 'Designer', status: 'Pending', startDate: '2026-10-01', dueDate: '2026-10-30', comments: [], approvalHistory: [],
        serviceCycleId: undefined, deliverableId: undefined }],
      clientPlans: [], serviceCycles: [], deliverables: [], notifications: [],
      backend: { ...state.backend, mode: 'local', status: 'local', isSaving: false, isPulling: false, hasLocalChanges: false, pendingMutations: 0 } });
  });
};

const openOwner = async (page: Page) => {
  await seed(page);
  await page.goto('/projects');
  await page.getByRole('row').filter({ hasText: 'Recovery QA Company' }).getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Edit details', exact: true }).click();
  return page.getByRole('dialog', { name: 'Recovery QA Company', exact: true });
};

const openTask = async (page: Page) => {
  await seed(page);
  await page.goto('/tasks?taskId=recovery-qa-task');
  const dialog = page.getByRole('dialog', { name: 'Recovery QA Task', exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
};

const deleteTask = async (page: Page) => {
  await page.getByRole('dialog', { name: 'Recovery QA Task', exact: true }).getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('dialog', { name: 'Delete task', exact: true }).getByRole('button', { name: 'Delete task', exact: true }).click();
};

const successToasts = (page: Page) => page.evaluate(async () => {
  const { useToastStore } = await import('/src/store/useToastStore.ts');
  const { formatMessage } = await import('/src/lib/messages.ts');
  return useToastStore.getState().toasts.filter(toast => toast.type === 'success')
    .map(toast => typeof toast.message === 'string' ? toast.message : formatMessage(toast.message, 'en'));
});

for (const outcome of ['rejection', 'exception'] as const) {
  test(`task deletion ${outcome} keeps recovery visible and retries one deletion`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const dialog = await openTask(page);
    await page.evaluate(async outcome => {
      const { useStore } = await import('/src/store/index.ts');
      (await import('/src/store/useToastStore.ts')).useToastStore.setState({ toasts: [] });
      const original = useStore.getState().deleteTask;
      let stages = 0, saves = 0;
      (window as unknown as { deletionStages: () => number }).deletionStages = () => stages;
      useStore.setState({ deleteTask: id => { stages++; return original(id); }, commitPendingMutation: async () => {
        if (++saves > 1) return { ok: true };
        if (outcome === 'exception') throw new Error('Injected deletion exception');
        return { ok: false, error: 'Injected deletion rejection' };
      } });
    }, outcome);
    await deleteTask(page);
    await expect(dialog.getByText(`Injected deletion ${outcome}`, { exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Retry my changes', exact: true })).toBeEnabled();
    expect(await successToasts(page)).toEqual([]);
    await dialog.getByRole('button', { name: 'Retry my changes', exact: true }).click();
    await expect(dialog).toBeHidden();
    expect(await page.evaluate(() => (window as unknown as { deletionStages: () => number }).deletionStages())).toBe(1);
    expect(await successToasts(page)).toEqual(['Task "Recovery QA Task" deleted']);
    expect(errors).toEqual([]);
  });
}

test('task deletion use latest preserves a newer canonical task', async ({ page }) => {
  const dialog = await openTask(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    (await import('/src/store/useToastStore.ts')).useToastStore.setState({ toasts: [] });
    const original = useStore.getState().tasks[0];
    useStore.setState({ commitPendingMutation: async () => ({ ok: false, error: 'Injected uncertain deletion' }),
      discardMutation: async () => { useStore.setState({ tasks: [{ ...original, title: 'Newer canonical task', priority: 'Urgent', version: 9 }] }); } });
  });
  await deleteTask(page);
  await expect(dialog.getByText('Injected uncertain deletion', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Use latest', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Newer canonical task', exact: true })).toBeVisible();
  expect(await page.evaluate(async () => {
    const task = (await import('/src/store/index.ts')).useStore.getState().tasks[0];
    return { title: task.title, priority: task.priority, version: task.version };
  })).toEqual({ title: 'Newer canonical task', priority: 'Urgent', version: 9 });
  expect(await successToasts(page)).toEqual([]);
});

test('task deletion refuses a false retry acknowledgement when the task reappears', async ({ page }) => {
  const dialog = await openTask(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    (await import('/src/store/useToastStore.ts')).useToastStore.setState({ toasts: [] });
    const original = useStore.getState().tasks[0];
    let calls = 0;
    useStore.setState({ commitPendingMutation: async () => {
      if (++calls === 1) return { ok: false, error: 'Injected uncertain deletion' };
      useStore.setState({ tasks: [{ ...original, priority: 'Urgent', version: 9 }] });
      return { ok: true };
    } });
  });
  await deleteTask(page);
  await expect(dialog.getByText('Injected uncertain deletion', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Retry my changes', exact: true }).click();
  await expect(dialog.getByText('The task is still available. Use latest before deleting it again.', { exact: true })).toBeVisible();
  expect(await successToasts(page)).toEqual([]);
});

test('closing a failed deletion confirms discard and closes after reloading saved data', async ({ page }) => {
  const dialog = await openTask(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const original = useStore.getState().tasks[0];
    useStore.setState({ commitPendingMutation: async () => ({ ok: false, error: 'Injected uncertain deletion' }),
      discardMutation: async () => { useStore.setState({ tasks: [original] }); } });
  });
  await deleteTask(page);
  await expect(dialog.getByText('Injected uncertain deletion', { exact: true })).toBeVisible();
  page.once('dialog', async prompt => { expect(prompt.message()).toBe('Discard unsaved changes?'); await prompt.accept(); });
  await dialog.getByRole('button', { name: /Close.*Recovery QA Task/ }).click();
  await expect(dialog).toBeHidden();
  expect(await page.evaluate(async () => (await import('/src/store/index.ts')).useStore.getState().tasks[0].id)).toBe('recovery-qa-task');
});

test('owner save exception shows feedback and retries the same owner without a premature success', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const dialog = await openOwner(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    (await import('/src/store/useToastStore.ts')).useToastStore.setState({ toasts: [] });
    const original = useStore.getState().assignClientOwner;
    let stages = 0, saves = 0;
    (window as unknown as { ownerStages: () => number }).ownerStages = () => stages;
    useStore.setState({ assignClientOwner: (id, ownerId) => { stages++; return original(id, ownerId); }, commitPendingMutation: async () => {
      if (++saves === 1) throw new Error('Injected owner exception');
      return { ok: true };
    } });
  });
  await dialog.getByLabel('Owner', { exact: true }).selectOption('owner-qa-pm');
  await expect(dialog.getByText('Injected owner exception', { exact: true })).toBeVisible();
  await expect(dialog.getByLabel('Owner', { exact: true })).toBeDisabled();
  expect(await successToasts(page)).toEqual([]);
  await dialog.getByRole('button', { name: 'Retry save', exact: true }).click();
  await expect(dialog.getByLabel('Owner', { exact: true })).toBeEnabled();
  await expect(dialog.getByText('Injected owner exception', { exact: true })).toBeHidden();
  expect(await page.evaluate(() => (window as unknown as { ownerStages: () => number }).ownerStages())).toBe(1);
  expect(await successToasts(page)).toEqual(['Owner updated for "Recovery QA Company".']);
  expect(errors).toEqual([]);
});

test('owner acknowledgement verifies the retained owner against the canonical company', async ({ page }) => {
  const dialog = await openOwner(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    (await import('/src/store/useToastStore.ts')).useToastStore.setState({ toasts: [] });
    useStore.setState({ commitPendingMutation: async () => {
      useStore.setState(state => ({ clients: state.clients.map(client => ({ ...client, createdBy: undefined })) }));
      return { ok: true };
    } });
  });
  await dialog.getByLabel('Owner', { exact: true }).selectOption('owner-qa-pm');
  await expect(dialog.getByText('The pending owner change is no longer available. Review the company before saving again.', { exact: true })).toBeVisible();
  await expect(dialog.getByLabel('Owner', { exact: true })).toHaveValue('');
  expect(await successToasts(page)).toEqual([]);
});

for (const action of ['owner', 'deletion'] as const) {
  test(`${action} late save response cannot affect a different account`, async ({ page }) => {
    const dialog = action === 'owner' ? await openOwner(page) : await openTask(page);
    await page.evaluate(async () => {
      const { useStore } = await import('/src/store/index.ts');
      (await import('/src/store/useToastStore.ts')).useToastStore.setState({ toasts: [] });
      useStore.setState({ commitPendingMutation: () => new Promise(resolve => {
        (window as unknown as { finishOldAction: () => void }).finishOldAction = () => resolve({ ok: true });
      }) });
    });
    if (action === 'owner') await dialog.getByLabel('Owner', { exact: true }).selectOption('owner-qa-pm');
    else await deleteTask(page);
    await expect.poll(() => page.evaluate(() => typeof (window as unknown as { finishOldAction?: () => void }).finishOldAction)).toBe('function');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await page.evaluate(async () => {
      const { useStore } = await import('/src/store/index.ts');
      const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
      enablePasswordResetBypass('other-recovery-boss');
      localStorage.setItem('aitask:release-notice:2026-08-service-operations:other-recovery-boss', 'acknowledged');
      useStore.setState(state => ({ currentUser: { ...state.currentUser!, id: 'other-recovery-boss', mustResetPassword: false },
        tasks: [], clients: [], backend: { ...state.backend, hasLocalChanges: false, pendingMutations: 0 } }));
    });
    await expect(dialog).toBeHidden();
    await page.evaluate(() => (window as unknown as { finishOldAction: () => void }).finishOldAction());
    expect(await successToasts(page)).toEqual([]);
  });
}
