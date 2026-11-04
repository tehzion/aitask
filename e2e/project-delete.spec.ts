import { expect, test } from '@playwright/test';

test('project deletion cancels safely and retries without restaging or deleting tasks', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const state = useStore.getState();
    const boss = state.users.find(user => user.isSuperAdmin)!;
    const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
    enablePasswordResetBypass(boss.id);
    localStorage.setItem(`aitask:release-notice:2026-08-service-operations:${boss.id}`, 'acknowledged');
    const project = { id: 'delete-project', clientId: 'delete-client', clientName: 'Delete company', projectName: 'Delete example', services: ['Design'], startDate: '2026-11-01', deadline: '', createdBy: boss.id };

    useStore.setState({ currentUser: { ...boss, mustResetPassword: false }, projects: [project], clients: [{ id: 'delete-client', clientName: 'Delete company', createdBy: boss.id, createdAt: '2026-11-01', updatedAt: '2026-11-01' }], tasks: [{ ...state.tasks[0], id: 'keep-task', projectId: project.id, projectName: project.projectName }],
      backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 },
    });
  });
  await page.goto('/projects');
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  const create = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Create project', exact: true }) });
  await expect(create.getByRole('button', { name: 'Delete project', exact: true })).toHaveCount(0);
  await create.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.goto('/projects');
  await page.locator('div.bg-surface.p-5').filter({ has: page.getByText('Delete company', { exact: true }) }).getByRole('button', { name: 'Details', exact: true }).click();
  await page.getByRole('button', { name: 'Edit project', exact: true }).click();
  // Navigation reloads the store; inject the failure after opening the real editor.
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    let stages = 0;
    const original = useStore.getState().deleteProject;
    useStore.setState({ tasks: [{ ...useStore.getState().tasks[0], id: 'keep-task', projectId: 'delete-project', projectName: 'Delete example' }], deleteProject: id => { stages++; return original(id); },
      commitPendingMutation: async () => ({ ok: false, error: 'Test save failure' }),
      retryPendingSave: async () => ({ ok: true }) });
    (window as unknown as { deleteStages: () => number }).deleteStages = () => stages;
  });
  const editor = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Edit project', exact: true }) });
  await editor.getByLabel('Project name').fill('Unsaved edit');
  await editor.getByRole('button', { name: 'Delete project', exact: true }).click();
  let confirm = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Delete project', exact: true }) });
  await expect(confirm).toContainText('Unsaved project edits will be discarded.');
  await confirm.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(editor.getByLabel('Project name')).toHaveValue('Unsaved edit');
  await editor.getByRole('button', { name: 'Delete project', exact: true }).click();
  confirm = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Delete project', exact: true }) });
  await confirm.getByRole('button', { name: 'Delete project', exact: true }).click();
  await expect(confirm.getByRole('alert')).toContainText('Test save failure');
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Retry deleting project' }).click();
  await expect(confirm).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { deleteStages: () => number }).deleteStages())).toBe(1);
  const result = await page.evaluate(async () => {
    const state = (await import('/src/store/index.ts')).useStore.getState();
    return { project: state.projects.find(project => project.id === 'delete-project'), task: state.tasks.find(task => task.id === 'keep-task') };
  });
  expect(result.project).toBeUndefined();
  expect(result.task).toBeDefined();
  expect(result.task?.projectId).toBeUndefined();
});
