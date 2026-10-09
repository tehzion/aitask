import { expect, test, type Page } from '@playwright/test';

const seedBoss = async (page: Page) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/login');
  await page.evaluate(async () => {
    localStorage.setItem('aitask:locale', 'en');
    const { useStore } = await import('/src/store/index.ts');
    const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
    const state = useStore.getState();
    const boss = state.users.find(user => user.isSuperAdmin)!;
    enablePasswordResetBypass(boss.id);
    localStorage.setItem(`aitask:release-notice:2026-08-service-operations:${boss.id}`, 'acknowledged');
    const task = { ...state.tasks[0], id: 'action-gap-task', title: 'Action gap task',
      clientName: 'Action QA', clientId: undefined, projectId: undefined, projectName: undefined,
      deliverableId: undefined, serviceCycleId: undefined, status: 'Pending', priority: 'Medium',
      createdBy: boss.id, assignedTo: boss.id, comments: [], approvalHistory: [],
      startDate: '2026-10-01', dueDate: '2026-10-30', isCompleted: false, version: 1 };
    useStore.setState({ currentUser: { ...boss, mustResetPassword: false }, tasks: [task],
      clients: [], projects: [], servicePackages: [], serviceWorkflowTemplates: [],
      backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 } });
  });
};

const catalog = {
  package: { name: 'Package name', item: 'Service name', save: 'Save package', collection: 'servicePackages' },
  workflow: { name: 'Template name', item: 'Step 1 title', save: 'Save workflow', collection: 'serviceWorkflowTemplates' },
} as const;

for (const kind of ['package', 'workflow'] as const) {
  test(`${kind} acknowledgement preserves edits typed during saving`, async ({ page }) => {
    await seedBoss(page);
    await page.goto('/settings');
    const controls = catalog[kind];
    await page.getByLabel(controls.name, { exact: true }).fill('Submitted template');
    await page.getByLabel(controls.item, { exact: true }).first().fill('Design');
    await page.evaluate(async () => {
      const { useStore } = await import('/src/store/index.ts');
      useStore.setState({ retryPendingSave: () => new Promise(resolve => {
        (window as unknown as { finishActionSave: () => void }).finishActionSave = () => resolve({ ok: true });
      }) });
    });
    await page.getByRole('button', { name: controls.save, exact: true }).click();
    await page.getByLabel(controls.name, { exact: true }).fill('Newer unsaved template');
    await page.evaluate(() => (window as unknown as { finishActionSave: () => void }).finishActionSave());
    await expect(page.getByLabel(controls.name, { exact: true })).toHaveValue('Newer unsaved template');
    expect(await page.evaluate(async () => (await import('/src/lib/unsavedChanges.ts')).hasUnsavedChanges())).toBe(true);
    const savedNames = await page.evaluate(async collection => {
      const { useStore } = await import('/src/store/index.ts');
      return useStore.getState()[collection].map(record => record.name);
    }, controls.collection);
    expect(savedNames).toContain('Submitted template');
    expect(savedNames).not.toContain('Newer unsaved template');
  });

  test(`${kind} save exception leaves an error and usable retry`, async ({ page }) => {
    await seedBoss(page);
    await page.goto('/settings');
    const controls = catalog[kind];
    await page.getByLabel(controls.name, { exact: true }).fill('Recoverable template');
    await page.getByLabel(controls.item, { exact: true }).first().fill('Design');
    await page.evaluate(async () => {
      const { useStore } = await import('/src/store/index.ts');
      useStore.setState({ retryPendingSave: async () => { throw new Error('Injected catalog save failure'); } });
    });
    await page.getByRole('button', { name: controls.save, exact: true }).click();
    await expect(page.getByText('Injected catalog save failure', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Retry save|Save package|Save workflow/, exact: true }).filter({ hasText: kind === 'package' ? /Retry save|Save package/ : /Retry save|Save workflow/ }).first()).toBeEnabled();
  });

  test(`${kind} retry confirms one record and saves newer input as its next revision`, async ({ page }) => {
    await seedBoss(page);
    await page.goto('/settings');
    const controls = catalog[kind];
    const section = page.locator(kind === 'package' ? 'section[aria-labelledby="service-packages-title"]' : 'section[aria-labelledby="workflow-templates-title"]');
    await page.getByLabel(controls.name, { exact: true }).fill('Original retry template');
    await page.getByLabel(controls.item, { exact: true }).first().fill('Design');
    await page.evaluate(async () => {
      const { useStore } = await import('/src/store/index.ts');
      useStore.setState({ retryPendingSave: async () => ({ ok: false, error: 'Injected uncertain save' }) });
    });
    await page.getByRole('button', { name: controls.save, exact: true }).click();
    await expect(page.getByText('Injected uncertain save', { exact: true })).toBeVisible();
    await page.getByLabel(controls.name, { exact: true }).fill('Newer retry template');
    await page.evaluate(async () => {
      const { useStore } = await import('/src/store/index.ts');
      useStore.setState({ retryPendingSave: async () => ({ ok: true }) });
    });
    await section.getByRole('button', { name: 'Retry save', exact: true }).click();
    await expect(page.getByLabel(controls.name, { exact: true })).toHaveValue('Newer retry template');
    await section.getByRole('button', { name: controls.save, exact: true }).click();
    const records = await page.evaluate(async collection => {
      const { useStore } = await import('/src/store/index.ts');
      return useStore.getState()[collection].filter(record => record.name.includes('retry template'));
    }, controls.collection);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ name: 'Newer retry template', revision: 2 });
  });

  test(`${kind} switching editors asks before discarding a draft`, async ({ page }) => {
    await seedBoss(page);
    await page.goto('/settings');
    await page.getByLabel(catalog[kind].name, { exact: true }).fill('Unsaved catalog draft');
    const dialog = page.waitForEvent('dialog');
    const click = page.getByRole('button', { name: kind === 'package' ? 'New package' : 'New workflow', exact: true }).click();
    const confirm = await dialog;
    expect(confirm.message()).toBe('Discard unsaved changes?');
    await confirm.dismiss();
    await click;
    await expect(page.getByLabel(catalog[kind].name, { exact: true })).toHaveValue('Unsaved catalog draft');
  });

  test(`${kind} late acknowledgement cannot reset another account’s draft`, async ({ page }) => {
    await seedBoss(page);
    await page.goto('/settings');
    const controls = catalog[kind];
    await page.getByLabel(controls.name, { exact: true }).fill('First account submission');
    await page.getByLabel(controls.item, { exact: true }).first().fill('Design');
    await page.evaluate(async () => {
      const { useStore } = await import('/src/store/index.ts');
      useStore.setState({ retryPendingSave: () => new Promise(resolve => {
        (window as unknown as { finishActionSave: () => void }).finishActionSave = () => resolve({ ok: true });
      }) });
    });
    await page.getByRole('button', { name: controls.save, exact: true }).click();
    await page.evaluate(async () => {
      const { useStore } = await import('/src/store/index.ts');
      const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
      enablePasswordResetBypass('action-next-account');
      localStorage.setItem('aitask:release-notice:2026-08-service-operations:action-next-account', 'acknowledged');
      useStore.setState(state => ({ currentUser: { ...state.currentUser!, id: 'action-next-account', mustResetPassword: false } }));
    });
    await expect(page.getByLabel(controls.name, { exact: true })).toHaveValue('');
    await page.getByLabel(controls.name, { exact: true }).fill('Another account draft');
    await page.evaluate(() => (window as unknown as { finishActionSave: () => void }).finishActionSave());
    await expect(page.getByLabel(controls.name, { exact: true })).toHaveValue('Another account draft');
    await expect(page.getByRole('button', { name: controls.save, exact: true })).toBeEnabled();
  });

  test(`${kind} failed deletion retries without deleting the same record twice`, async ({ page }) => {
    await seedBoss(page);
    await page.goto('/settings');
    const controls = catalog[kind];
    await page.getByLabel(controls.name, { exact: true }).fill('Deletion retry template');
    await page.getByLabel(controls.item, { exact: true }).first().fill('Design');
    await page.getByRole('button', { name: controls.save, exact: true }).click();
    await expect(page.getByText('Deletion retry template', { exact: true })).toBeVisible();
    await page.evaluate(async () => {
      const { useStore } = await import('/src/store/index.ts');
      useStore.setState({ retryPendingSave: async () => { throw new Error('Injected catalog deletion failure'); } });
    });
    await page.getByRole('button', { name: `Delete ${kind} Deletion retry template`, exact: true }).click();
    const confirmation = page.getByRole('dialog', { name: /Delete the/ });
    await confirmation.getByRole('button', { name: kind === 'package' ? 'Delete package' : 'Delete workflow', exact: true }).click();
    await expect(page.getByText('Injected catalog deletion failure', { exact: true })).toBeVisible();
    await page.evaluate(async () => {
      const { useStore } = await import('/src/store/index.ts');
      useStore.setState({ retryPendingSave: async () => ({ ok: true }) });
    });
    await page.getByRole('button', { name: 'Retry save', exact: true }).click();
    const editor = page.locator(kind === 'package' ? 'section[aria-labelledby="service-packages-title"]' : 'section[aria-labelledby="workflow-templates-title"]');
    await expect(editor.getByText(kind === 'package' ? 'Package deleted. Existing client plans remain unchanged.'
      : 'Workflow template deleted. Frozen copies in plans remain unchanged.', { exact: true })).toBeVisible();
  });
}

test('discarded company creation is not acknowledged as a saved company', async ({ page }) => {
  await seedBoss(page);
  await page.goto('/projects');
  await page.getByRole('button', { name: 'New client', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a client company' });
  await dialog.getByLabel('Company name *', { exact: true }).fill('Discarded company');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ retryPendingSave: async () => ({ ok: false, error: 'Injected company save failure' }) });
  });
  await dialog.getByRole('button', { name: 'Save client', exact: true }).click();
  await expect(dialog.getByText('Injected company save failure')).toBeVisible();
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ clients: [], retryPendingSave: async () => ({ ok: true }) });
  });
  await dialog.getByRole('button', { name: 'Retry save', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Client added' })).toHaveCount(0);
  await expect(dialog.getByText('The pending company is no longer available. Review your draft before saving again.')).toBeVisible();
});

test('project save locks its submitted form, recovers exceptions and detects discarded creation', async ({ page }) => {
  await seedBoss(page);
  const clientId = await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    return useStore.getState().createClientProfile({ clientName: 'Project action QA' }).id!;
  });
  await page.goto('/projects');
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Create project' });
  await dialog.getByLabel('Company name *').selectOption(clientId);
  await dialog.getByLabel('Project name *').fill('Retained project');
  await dialog.getByRole('button', { name: 'Design', exact: true }).click();
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ retryPendingSave: () => new Promise((_resolve, reject) => {
      (window as unknown as { finishActionSave: () => void }).finishActionSave = () => reject(new Error('Injected project save failure'));
    }) });
  });
  await dialog.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(dialog.getByLabel('Project name *')).toBeDisabled();
  await page.evaluate(() => (window as unknown as { finishActionSave: () => void }).finishActionSave());
  await expect(dialog.getByText('Injected project save failure', { exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ projects: [], retryPendingSave: async () => ({ ok: true }) });
  });
  await dialog.getByRole('button', { name: 'Retry saving', exact: true }).click();
  await expect(dialog.getByText('The pending project change is no longer available. Review your draft before saving again.')).toBeVisible();
  await expect(dialog.getByLabel('Project name *')).toHaveValue('Retained project');
  await expect(dialog.getByLabel('Project name *')).toBeEnabled();
});

test('plan date save locks submitted dates and recovers a rejected promise', async ({ page }) => {
  await seedBoss(page);
  const clientId = await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const created = useStore.getState().createClientWithPlan({ clientName: 'Plan date QA', planName: 'Date QA',
      origin: 'custom', serviceItems: [{ id: 'date-service', name: 'Design', platforms: [], unit: 'post', quantity: 1, unitPriceMinor: 100 }],
      startDate: '2026-10-01', billingDay: 1, discountType: 'none', discountValue: 0, taxRateBps: 0 });
    if (!created.ok) throw new Error(created.error);
    useStore.getState().activateClientPlan(created.planId!);
    return created.clientId!;
  });
  await page.goto(`/clients/${clientId}`);
  await page.getByRole('tab', { name: 'Plan', exact: true }).click();
  await page.getByRole('button', { name: 'Edit plan dates', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit plan dates' });
  await dialog.getByLabel('Monthly billing day').fill('15');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ retryPendingSave: () => new Promise((_resolve, reject) => {
      (window as unknown as { finishActionSave: () => void }).finishActionSave = () => reject(new Error('Injected plan date failure'));
    }) });
  });
  await dialog.getByRole('button', { name: 'Save dates', exact: true }).click();
  await expect(dialog.getByLabel('Monthly billing day')).toBeDisabled();
  await expect(dialog.getByLabel('Contract end date (reminder only)')).toBeDisabled();
  await page.evaluate(() => (window as unknown as { finishActionSave: () => void }).finishActionSave());
  await expect(dialog.getByText('Injected plan date failure', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Save dates', exact: true })).toBeEnabled();
});

for (const outcome of ['rejection', 'exception'] as const) {
  test(`task quick ${outcome} preserves a newer canonical task`, async ({ page }) => {
    await seedBoss(page);
    await page.goto('/tasks');
    await page.evaluate(async kind => {
      const { useStore } = await import('/src/store/index.ts');
      useStore.setState({ commitPendingMutation: () => new Promise((resolve, reject) => {
        (window as unknown as { finishActionSave: () => void }).finishActionSave = () => {
          useStore.setState(state => ({ tasks: state.tasks.map(task => ({ ...task,
            title: 'Newer server title', priority: 'Urgent', version: 2 })) }));
          if (kind === 'exception') reject(new Error('Injected quick save failure'));
          else resolve({ ok: false, error: 'Injected quick save failure' });
        };
      }) });
    }, outcome);
    await page.locator('tbody').getByText('Action gap task', { exact: true }).click({ button: 'right' });
    const quick = page.getByRole('dialog', { name: 'Quick Edit' });
    await quick.getByRole('combobox').nth(1).selectOption('High');
    await page.evaluate(() => (window as unknown as { finishActionSave: () => void }).finishActionSave());
    const task = await page.evaluate(async () => {
      const { useStore } = await import('/src/store/index.ts');
      return useStore.getState().tasks.find(task => task.id === 'action-gap-task');
    });
    expect(task).toMatchObject({ title: 'Newer server title', priority: 'Urgent', version: 2 });
    await expect(page.getByText('Injected quick save failure', { exact: true })).toBeVisible();
  });
}
