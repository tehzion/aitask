import { expect, test, type Page } from '@playwright/test';

const id = 'staff-deep-task';
const title = 'Staff deep recovery task';
const seed = async (page: Page, route = '/calendar') => {
  await page.goto('/login');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
    const state = useStore.getState();
    const staff = state.users.find(user => user.name === 'Staff Demo')!;
    enablePasswordResetBypass(staff.id);
    localStorage.setItem(`aitask:release-notice:2026-08-service-operations:${staff.id}`, 'acknowledged');
    const today = new Date();
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    useStore.setState({ currentUser: { ...staff, mustResetPassword: false },
      backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 },
      tasks: [{ ...state.tasks[0], id: 'staff-deep-task', title: 'Staff deep recovery task', clientName: 'Staff deep company',
        clientId: undefined, projectId: undefined, projectName: undefined, serviceCycleId: undefined, deliverableId: undefined,
        assignedTo: staff.id, createdBy: staff.id, department: staff.department, predecessorTaskIds: [],
        startDate: date, dueDate: date, status: 'Pending', completionPercentage: 0, isCompleted: false,
        comments: [], attachmentLink: '', attachmentName: '', updatedAt: '2026-10-07T00:00:00.000Z' }],
      clients: [], projects: [], notifications: [], serviceCycles: [], deliverables: [], clientPlans: [] });
  });
  await page.goto(route);
};

const dates = async (page: Page) => {
  await seed(page);
  await page.getByRole('button', { name: `Edit dates for ${title}`, exact: true }).click();
  return page.getByRole('dialog', { name: 'Edit task dates' });
};
const hold = async (page: Page) => page.evaluate(async () => {
  const { useStore } = await import('/src/store/index.ts');
  useStore.setState({ commitPendingMutation: () => new Promise(resolve => {
    (window as unknown as { finishDeepSave: (ok: boolean) => void }).finishDeepSave = ok => resolve({ ok, error: ok ? undefined : 'Date confirmation missing.' });
  }) });
});
const finish = (page: Page, ok = true) => page.evaluate(saved => (window as unknown as { finishDeepSave: (ok: boolean) => void }).finishDeepSave(saved), ok);

for (const mobile of [false, true]) {
 test(`${mobile ? 'mobile' : 'desktop'} Staff date draft requires confirmation before Escape`, async ({ page }) => {
  await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  const dialog = await dates(page);
  await dialog.locator('input[type=date]').last().fill('2026-12-20');
  expect(await page.evaluate(async () => (await import('/src/lib/unsavedChanges.ts')).hasUnsavedChanges())).toBe(true);
  let prompts = 0;
  page.on('dialog', async prompt => { prompts++; await prompt.dismiss(); });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  expect(prompts).toBe(1);
  await expect(dialog.locator('input[type=date]').last()).toHaveValue('2026-12-20');
 });
}


test('Staff calendar locks submitted dates and task navigation during save', async ({ page }) => {
  const dialog = await dates(page);
  await hold(page);
  await dialog.locator('input[type=date]').last().fill('2026-12-20');
  await dialog.getByRole('button', { name: 'Save dates', exact: true }).click();
  await expect(dialog.locator('input[type=date]').first()).toBeDisabled();
  await expect(dialog.locator('input[type=date]').last()).toBeDisabled();
  await expect(dialog.getByRole('link', { name: 'Open task' })).toHaveAttribute('aria-disabled', 'true');
  await finish(page);
  await expect(dialog).toBeHidden();
});

test('Staff calendar handles a rejected save promise without leaving controls stuck', async ({ page }) => {
  const dialog = await dates(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ commitPendingMutation: async () => { throw new Error('Calendar network interrupted.'); } });
  });
  await dialog.locator('input[type=date]').last().fill('2026-12-20');
  await dialog.getByRole('button', { name: 'Save dates', exact: true }).click();
  await expect(dialog.getByRole('alert').first()).toContainText('Calendar network interrupted.');
  await expect(dialog.getByRole('button', { name: 'Retry dates', exact: true })).toBeEnabled();
  await expect(dialog.getByRole('button', { name: 'Close date editor' })).toBeEnabled();
});

for (const sessionChange of [false, true]) {
  test(`Staff calendar failure preserves ${sessionChange ? 'another session' : 'newer pulled'} dates`, async ({ page }) => {
    const dialog = await dates(page);
    await hold(page);
    await dialog.locator('input[type=date]').last().fill('2026-12-20');
    await dialog.getByRole('button', { name: 'Save dates', exact: true }).click();
    await page.evaluate(async changeSession => {
      const { useStore } = await import('/src/store/index.ts');
      if (changeSession) (await import('/src/lib/workspaceSession.ts')).invalidateWorkspaceSession();
      useStore.setState(state => ({ tasks: state.tasks.map(task => ({ ...task, startDate: '2026-11-10', dueDate: '2026-11-15', updatedAt: '2026-11-10T12:00:00.000Z' })) }));
    }, sessionChange);
    await finish(page, false);
    await expect.poll(() => page.evaluate(async () => (await import('/src/store/index.ts')).useStore.getState().tasks[0].dueDate)).toBe('2026-11-15');
  });
}

test('Staff Full edit preserves a newer details draft when earlier details save completes', async ({ page }) => {
  await seed(page, `/tasks?taskId=${id}`);
  await page.getByRole('button', { name: 'Full edit', exact: true }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await hold(page);
  await page.getByLabel('Task Title', { exact: true }).fill('Submitted title');
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await page.getByLabel('Task Title', { exact: true }).fill('Later unsent title');
  await finish(page);
  await expect(page.getByLabel('Task Title', { exact: true })).toHaveValue('Later unsent title');
});

test('Staff date retry applies the retained attempt once and clears the editor', async ({ page }) => {
  const dialog = await dates(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ commitPendingMutation: async () => ({ ok: false, error: 'Confirmation missing.' }),
      retryPendingSave: async () => {
        useStore.setState(state => ({ tasks: state.tasks.map(task => ({ ...task, dueDate: '2026-12-20' })) }));
        return { ok: true };
      } });
  });
  await dialog.locator('input[type=date]').last().fill('2026-12-20');
  await dialog.getByRole('button', { name: 'Save dates', exact: true }).click();
  await expect(dialog.getByText('Attempted range retained')).toBeVisible();
  await dialog.getByRole('button', { name: 'Retry dates', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(await page.evaluate(async () => (await import('/src/lib/unsavedChanges.ts')).hasUnsavedChanges())).toBe(false);
});

test('Staff date retry with no applied command never claims the dates were saved', async ({ page }) => {
  const dialog = await dates(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ commitPendingMutation: async () => ({ ok: false, error: 'Confirmation missing.' }), retryPendingSave: async () => ({ ok: true }) });
  });
  await dialog.locator('input[type=date]').last().fill('2026-12-20');
  await dialog.getByRole('button', { name: 'Save dates', exact: true }).click();
  expect(await page.evaluate(async () => (await import('/src/store/index.ts')).useStore.getState().tasks[0].dueDate)).not.toBe('2026-12-20');
  await dialog.getByRole('button', { name: 'Retry dates', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('The pending date change was not applied.');
  await expect(dialog.locator('input[type=date]').last()).not.toHaveValue('2026-12-20');
  await expect(page.getByText(`${title} · dates updated`, { exact: true })).toHaveCount(0);
});

test('Staff date recovery catches retry and reload exceptions and can use latest afterward', async ({ page }) => {
  const dialog = await dates(page);
  const original = await dialog.locator('input[type=date]').last().inputValue();
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ commitPendingMutation: async () => ({ ok: false, error: 'Confirmation missing.' }),
      retryPendingSave: async () => { throw new Error('Retry interrupted.'); },
      discardMutation: async () => { throw new Error('Reload interrupted.'); } });
  });
  await dialog.locator('input[type=date]').last().fill('2026-12-20');
  await dialog.getByRole('button', { name: 'Save dates', exact: true }).click();
  await dialog.getByRole('button', { name: 'Retry dates', exact: true }).click();
  await expect(dialog.getByRole('alert').first()).toContainText('Retry interrupted.');
  await dialog.getByRole('button', { name: 'Use latest', exact: true }).click();
  await expect(dialog.getByRole('alert').first()).toContainText('Reload interrupted.');
  await page.evaluate(async () => (await import('/src/store/index.ts')).useStore.setState({ discardMutation: async () => undefined }));
  await dialog.getByRole('button', { name: 'Use latest', exact: true }).click();
  await expect(dialog.locator('input[type=date]').last()).toHaveValue(original);
  await expect(dialog.getByRole('button', { name: 'Save dates', exact: true })).toBeEnabled();
});

test('Staff Full edit catches save exceptions and retries the original details while keeping newer input', async ({ page }) => {
  await seed(page, `/tasks?taskId=${id}`);
  await page.getByRole('button', { name: 'Full edit', exact: true }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const original = useStore.getState().updateTask;
    (window as unknown as { detailApplications: number }).detailApplications = 0;
    useStore.setState({ updateTask: (...args) => { (window as unknown as { detailApplications: number }).detailApplications++; return original(...args); },
      commitPendingMutation: async () => { throw new Error('Details network interrupted.'); }, retryPendingSave: async () => ({ ok: true }) });
  });
  await page.getByLabel('Task Title', { exact: true }).fill('Submitted title');
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Details network interrupted.');
  await page.getByLabel('Task Title', { exact: true }).fill('Later unsent title');
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await expect(page.getByLabel('Task Title', { exact: true })).toHaveValue('Later unsent title');
  await expect(page.getByText('Details network interrupted.', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { detailApplications: number }).detailApplications)).toBe(1);
  expect(await page.evaluate(async () => (await import('/src/store/index.ts')).useStore.getState().tasks[0].title)).toBe('Submitted title');
});

test('Staff cancelling Full edit asks before resetting the details draft', async ({ page }) => {
  await seed(page, `/tasks?taskId=${id}`);
  await page.getByRole('button', { name: 'Full edit', exact: true }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Task Title', { exact: true }).fill('Unsaved title');
  page.once('dialog', prompt => prompt.dismiss());
  await page.getByRole('button', { name: 'Cancel Edit', exact: true }).click();
  await expect(page.getByLabel('Task Title', { exact: true })).toHaveValue('Unsaved title');
  page.once('dialog', prompt => prompt.accept());
  await page.getByRole('button', { name: 'Cancel Edit', exact: true }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel('Task Title', { exact: true })).toHaveValue(title);
});

test('Staff Full edit retry preserves a draft whose original command was discarded', async ({ page }) => {
  await seed(page, `/tasks?taskId=${id}`);
  await page.getByRole('button', { name: 'Full edit', exact: true }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.evaluate(async () => (await import('/src/store/index.ts')).useStore.setState({
    commitPendingMutation: async () => ({ ok: false, error: 'Confirmation missing.' }), retryPendingSave: async () => ({ ok: true }),
  }));
  await page.getByLabel('Task Title', { exact: true }).fill('Submitted but discarded title');
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState(state => ({ tasks: state.tasks.map(task => ({ ...task, title: 'Staff deep recovery task' })) }));
  });
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('The pending task update is no longer available.');
  await expect(page.getByLabel('Task Title', { exact: true })).toHaveValue('Submitted but discarded title');
});
