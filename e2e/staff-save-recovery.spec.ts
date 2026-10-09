import { expect, test, type Page } from '@playwright/test';

const taskA = 'staff-save-task-a';
const taskB = 'staff-save-task-b';
const titleA = 'Staff save task A';
const titleB = 'Staff save task B';

const seedStaff = async (page: Page, service = false) => {
  await page.goto('/login');
  const clientId = await page.evaluate(async keepServices => {
    const { useStore } = await import('/src/store/index.ts');
    const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
    const state = useStore.getState();
    const staff = state.users.find(user => user.name === 'Staff Demo')!;
    enablePasswordResetBypass(staff.id);
    localStorage.setItem(`aitask:release-notice:2026-08-service-operations:${staff.id}`, 'acknowledged');
    const assigned = state.tasks.find(task => task.assignedTo === staff.id && task.clientId && task.serviceCycleId)!;
    useStore.setState({ currentUser: { ...staff, mustResetPassword: false }, backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 } });
    if (keepServices) return assigned.clientId;
    const template = { ...(assigned || state.tasks[0]), clientName: 'Staff save company', projectId: undefined, projectName: undefined,
      clientId: undefined, department: staff.department, assignedTo: staff.id, createdBy: state.users.find(user => user.isSuperAdmin)!.id,
      status: 'Pending', priority: 'Medium', completionPercentage: 0, isCompleted: false, comments: [], approvalHistory: [],
      predecessorTaskIds: [], serviceCycleId: undefined, deliverableId: undefined, dueDate: '2026-10-30' };
    useStore.setState({ tasks: [{ ...template, id: 'staff-save-task-a', title: 'Staff save task A' }, { ...template, id: 'staff-save-task-b', title: 'Staff save task B' }],
      clients: [], projects: [], notifications: [], clientPlans: [], serviceCycles: [], deliverables: [] });
    return undefined;
  }, service);
  await page.goto(service ? `/clients/${clientId}` : `/tasks?taskId=${taskA}`);
};

const holdSave = async (page: Page) => page.evaluate(async () => {
  const { useStore } = await import('/src/store/index.ts');
  useStore.setState({ commitPendingMutation: () => new Promise(resolve => {
    (window as unknown as { finishStaffSave: () => void }).finishStaffSave = () => resolve({ ok: true });
  }) });
});
const finishSave = async (page: Page) => page.evaluate(() => (window as unknown as { finishStaffSave: () => void }).finishStaffSave());
const savedComments = (page: Page, id = taskA) => page.evaluate(async taskId => {
  const { useStore } = await import('/src/store/index.ts');
  return useStore.getState().tasks.find(task => task.id === taskId)!.comments!.map(comment => comment.text);
}, id);

test('Staff slow comment acknowledgement preserves newer input', async ({ page }) => {
  await seedStaff(page);
  await holdSave(page);
  const sheet = page.getByRole('dialog', { name: titleA });
  const note = sheet.getByPlaceholder('Add a work update…');
  await note.fill('Submitted work note');
  await sheet.getByRole('button', { name: 'Send work update' }).click();
  await expect(sheet.getByRole('button', { name: `Close ${titleA}` })).toBeDisabled();
  await expect(sheet.getByRole('button', { name: 'Full edit' })).toBeDisabled();
  await note.fill('Later unsent work note');
  await finishSave(page);
  await expect(note).toHaveValue('Later unsent work note');
  await expect(sheet.getByRole('button', { name: 'Send work update' })).toBeEnabled();
  expect(await savedComments(page)).toEqual(['Submitted work note']);
  expect(await page.evaluate(async () => { const { hasUnsavedChanges } = await import('/src/lib/unsavedChanges.ts'); return hasUnsavedChanges(); })).toBe(true);
});

test('Staff retry acknowledges one comment, clears its error and keeps newer text', async ({ page }) => {
  await seedStaff(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const state = useStore.getState();
    (window as unknown as { staffCommentApplications: number }).staffCommentApplications = 0;
    useStore.setState({
      addComment: (id, text) => { (window as unknown as { staffCommentApplications: number }).staffCommentApplications++; return state.addComment(id, text); },
      commitPendingMutation: async () => {
        useStore.setState(current => ({ backend: { ...current.backend, status: 'retry_required', hasLocalChanges: true, pendingMutations: 1 } }));
        return { ok: false, error: 'Staff save not confirmed.' };
      },
      retryPendingSave: async () => {
        useStore.setState(current => ({ backend: { ...current.backend, status: 'local', hasLocalChanges: false, pendingMutations: 0 } }));
        return { ok: true };
      },
    });
  });
  const sheet = page.getByRole('dialog', { name: titleA });
  const note = sheet.getByPlaceholder('Add a work update…');
  await note.fill('Submit once');
  await sheet.getByRole('button', { name: 'Send work update' }).click();
  await expect(sheet.getByRole('alert')).toContainText('Staff save not confirmed.');
  await note.fill('A separate later draft');
  await sheet.getByRole('button', { name: 'Retry my changes', exact: true }).click();
  await expect(sheet.getByText('Staff save not confirmed.', { exact: true })).toHaveCount(0);
  await expect(note).toHaveValue('A separate later draft');
  expect(await savedComments(page)).toEqual(['Submit once']);
  expect(await page.evaluate(() => (window as unknown as { staffCommentApplications: number }).staffCommentApplications)).toBe(1);
});

test('retrying an unchanged comment clears the submitted draft and prevents a duplicate send', async ({ page }) => {
  await seedStaff(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ commitPendingMutation: async () => ({ ok: false, error: 'Confirmation missing.' }), retryPendingSave: async () => ({ ok: true }) });
  });
  const sheet = page.getByRole('dialog', { name: titleA });
  const note = sheet.getByPlaceholder('Add a work update…');
  await note.fill('Do not duplicate');
  await sheet.getByRole('button', { name: 'Send work update' }).click();
  await sheet.getByRole('button', { name: 'Retry save', exact: true }).click();
  await expect(note).toHaveValue('');
  await expect(sheet.getByRole('button', { name: 'Send work update' })).toBeDisabled();
  expect(await savedComments(page)).toEqual(['Do not duplicate']);
});

for (const status of ['In Progress', 'Completed']) {
  test(`Staff rejected ${status} save does not emit success or completion toasts`, async ({ page }) => {
    await seedStaff(page);
    await page.evaluate(async () => {
      const { useStore } = await import('/src/store/index.ts');
      const { useToastStore } = await import('/src/store/useToastStore.ts');
      useToastStore.setState({ toasts: [] });
      useStore.setState({ commitPendingMutation: async () => ({ ok: false, error: 'Status was not confirmed.' }), retryPendingSave: async () => ({ ok: true }) });
    });
    const sheet = page.getByRole('dialog', { name: titleA });
    await sheet.getByRole('combobox', { name: 'All task statuses' }).selectOption(status);
    await expect(sheet.getByRole('alert')).toContainText('Status was not confirmed.');
    const successIds = () => page.evaluate(async () => {
      const { useToastStore } = await import('/src/store/useToastStore.ts');
      return useToastStore.getState().toasts.filter(toast => toast.type === 'success').map(toast => typeof toast.message === 'object' ? toast.message.id : toast.message);
    });
    expect(await successIds()).toEqual([]);
    await sheet.getByRole('button', { name: 'Retry save', exact: true }).click();
    expect(await successIds()).toContain('task.statusUpdated');
  });
}

for (const mobile of [false, true]) {
  test(`${mobile ? 'mobile' : 'desktop'} Staff draft requires confirmation on Escape and Full edit`, async ({ page }) => {
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
    await seedStaff(page);
    const sheet = page.getByRole('dialog', { name: titleA });
    const note = sheet.getByPlaceholder('Add a work update…');
    await note.fill('Keep my unsent note');
    await page.keyboard.press('Escape');
    const confirmation = page.getByRole('dialog', { name: 'Discard unsaved changes?' });
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole('button', { name: 'Keep editing' }).click();
    await expect(note).toHaveValue('Keep my unsent note');
    await sheet.getByRole('button', { name: 'Full edit' }).click();
    await confirmation.getByRole('button', { name: 'Keep editing' }).click();
    await expect(note).toHaveValue('Keep my unsent note');
    await sheet.getByRole('button', { name: `Close ${titleA}` }).click();
    await confirmation.getByRole('button', { name: 'Discard changes' }).click();
    await expect(sheet).toBeHidden();
    expect(await page.evaluate(async () => { const { hasUnsavedChanges } = await import('/src/lib/unsavedChanges.ts'); return hasUnsavedChanges(); })).toBe(false);
  });
}

test('late task A acknowledgement cannot erase task B draft', async ({ page }) => {
  await seedStaff(page);
  await holdSave(page);
  const sheet = page.getByRole('dialog', { name: titleA });
  await sheet.getByPlaceholder('Add a work update…').fill('Task A update');
  await sheet.getByRole('button', { name: 'Send work update' }).click();
  page.on('dialog', prompt => prompt.accept());
  await page.locator('main button').filter({ hasText: titleB }).evaluate(button => (button as HTMLButtonElement).click());
  const nextNote = page.getByRole('dialog', { name: titleB }).getByPlaceholder('Add a work update…');
  await nextNote.fill('Task B unsent note');
  await finishSave(page);
  await expect(nextNote).toHaveValue('Task B unsent note');
  expect(await savedComments(page, taskB)).toEqual([]);
});

const openActivity = async (page: Page) => {
  await seedStaff(page, true);
  await page.getByRole('tab', { name: 'Activity / Files' }).click();
  await page.getByRole('button', { name: 'Add activity', exact: true }).click();
  return page.getByRole('dialog', { name: 'Add activity' });
};

for (const retry of [false, true]) {
  test(`Staff activity ${retry ? 'retry' : 'save'} retains a newer note, visibility and file`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const sheet = await openActivity(page);
    if (retry) await page.evaluate(async () => {
      const { useStore } = await import('/src/store/index.ts');
      useStore.setState({ commitPendingMutation: async () => ({ ok: false, error: 'Activity not confirmed.' }), retryPendingSave: () => new Promise(resolve => {
        (window as unknown as { finishStaffSave: () => void }).finishStaffSave = () => resolve({ ok: true });
      }) });
    });
    else await holdSave(page);
    const update = sheet.getByPlaceholder('Share an update...');
    await update.fill('Submitted activity');
    await sheet.getByRole('button', { name: 'Add activity', exact: true }).click();
    if (retry) await expect(sheet.getByRole('alert')).toContainText('Activity not confirmed.');
    await update.fill('Newer activity draft');
    await sheet.getByLabel('Visibility').selectOption('client-visible');
    await sheet.locator('#activity-file').setInputFiles({ name: 'newer-note.pdf', mimeType: 'application/pdf', buffer: Buffer.from('newer selected PDF') });
    if (retry) await sheet.getByRole('button', { name: 'Retry save', exact: true }).last().click();
    await finishSave(page);
    await expect(sheet).toBeVisible();
    await expect(update).toHaveValue('Newer activity draft');
    await expect(sheet.getByLabel('Visibility')).toHaveValue('client-visible');
    await expect(sheet.getByText('newer-note.pdf', { exact: true })).toBeVisible();
    expect(await sheet.locator('#activity-file').evaluate(input => (input as HTMLInputElement).files?.length)).toBe(1);
    const comments = await page.evaluate(async () => {
      const { useStore } = await import('/src/store/index.ts');
      return useStore.getState().cycleComments.filter(comment => comment.text === 'Submitted activity');
    });
    expect(comments).toHaveLength(1);
  });
}

test('Staff full editor also retains comments typed during saving', async ({ page }) => {
  await seedStaff(page);
  await page.getByRole('dialog', { name: titleA }).getByRole('button', { name: 'Full edit' }).click();
  await holdSave(page);
  const input = page.getByPlaceholder('Write a comment or update...');
  await input.fill('Full editor submitted note');
  await page.getByRole('button', { name: 'Send comment' }).click();
  await input.fill('Full editor later note');
  await finishSave(page);
  await expect(input).toHaveValue('Full editor later note');
  expect(await savedComments(page)).toEqual(['Full editor submitted note']);
});

test('a retry completed outside the Staff sheet reconciles its submitted comment and error', async ({ page }) => {
  await seedStaff(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ commitPendingMutation: async () => {
      useStore.setState(state => ({ backend: { ...state.backend, status: 'retry_required', hasLocalChanges: true, pendingMutations: 1 } }));
      return { ok: false, error: 'Waiting for an external retry.' };
    } });
  });
  const sheet = page.getByRole('dialog', { name: titleA });
  const note = sheet.getByPlaceholder('Add a work update…');
  await note.fill('Externally retried note');
  await sheet.getByRole('button', { name: 'Send work update' }).click();
  await expect(sheet.getByRole('alert')).toContainText('Waiting for an external retry.');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState(state => ({ backend: { ...state.backend, status: 'live', hasLocalChanges: false, pendingMutations: 0 } }));
  });
  await expect(note).toHaveValue('');
  await expect(sheet.getByText('Waiting for an external retry.', { exact: true })).toHaveCount(0);
  expect(await savedComments(page)).toEqual(['Externally retried note']);
});

test('discarding a failed Staff comment restores saved records before closing', async ({ page }) => {
  await seedStaff(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const before = useStore.getState();
    useStore.setState({
      commitPendingMutation: async () => ({ ok: false, error: 'Pending comment rejected.' }),
      discardMutation: async () => useStore.setState(state => ({ tasks: before.tasks, backend: { ...state.backend, status: 'local', hasLocalChanges: false, pendingMutations: 0 } })),
    });
  });
  const sheet = page.getByRole('dialog', { name: titleA });
  await sheet.getByPlaceholder('Add a work update…').fill('Discard this pending comment');
  await sheet.getByRole('button', { name: 'Send work update' }).click();
  await sheet.getByRole('button', { name: `Close ${titleA}` }).click();
  await page.getByRole('dialog', { name: 'Discard unsaved changes?' }).getByRole('button', { name: 'Discard changes' }).click();
  await expect(sheet).toBeHidden();
  expect(await savedComments(page)).toEqual([]);
});

test('activity retry does not claim a discarded comment was saved or wipe its draft', async ({ page }) => {
  const sheet = await openActivity(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ commitPendingMutation: async () => ({ ok: false, error: 'Activity waiting.' }), retryPendingSave: async () => ({ ok: true }) });
  });
  const note = sheet.getByPlaceholder('Share an update...');
  await note.fill('Keep after external discard');
  await sheet.getByRole('button', { name: 'Add activity', exact: true }).click();
  await expect(sheet.getByRole('alert')).toContainText('Activity waiting.');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState(state => ({ cycleComments: state.cycleComments.filter(item => item.text !== 'Keep after external discard') }));
  });
  await sheet.getByRole('button', { name: 'Retry save', exact: true }).last().click();
  await expect(sheet.getByRole('alert')).toContainText('pending activity is no longer available');
  await expect(note).toHaveValue('Keep after external discard');
});

test('a pending activity can be retried even when its newer draft is empty or has an invalid file', async ({ page }) => {
  const sheet = await openActivity(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ commitPendingMutation: async () => ({ ok: false, error: 'Retry pending activity.' }), retryPendingSave: async () => ({ ok: true }) });
  });
  const note = sheet.getByPlaceholder('Share an update...');
  await note.fill('Already submitted activity');
  await sheet.getByRole('button', { name: 'Add activity', exact: true }).click();
  await expect(sheet.getByRole('alert')).toContainText('Retry pending activity.');
  await note.fill('');
  await sheet.locator('#activity-file').setInputFiles({ name: 'invalid-script.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('invalid') });
  await sheet.getByRole('button', { name: 'Retry save', exact: true }).last().click();
  await expect(sheet).toBeVisible();
  await expect(note).toHaveValue('');
  await expect(sheet.getByRole('button', { name: 'Add activity', exact: true })).toBeEnabled();
});

test('Use latest still resolves a workspace operation started outside the Staff sheet', async ({ page }) => {
  await seedStaff(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    (window as unknown as { externalDiscardCalls: number }).externalDiscardCalls = 0;
    useStore.setState(state => ({ backend: { ...state.backend, status: 'retry_required', hasLocalChanges: true, pendingMutations: 1 },
      discardMutation: async () => {
        (window as unknown as { externalDiscardCalls: number }).externalDiscardCalls++;
        useStore.setState(current => ({ backend: { ...current.backend, status: 'local', hasLocalChanges: false, pendingMutations: 0 } }));
      },
    }));
  });
  const sheet = page.getByRole('dialog', { name: titleA });
  await sheet.getByRole('button', { name: 'Use latest', exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { externalDiscardCalls: number }).externalDiscardCalls)).toBe(1);
  await expect(sheet.getByRole('alert')).toHaveCount(0);
});
