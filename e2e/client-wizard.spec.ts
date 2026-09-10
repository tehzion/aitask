import { expect, test, type Page } from '@playwright/test';

const seedAdminAndPackage = async (page: Page) => {
  await page.goto('/login');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const state = useStore.getState();
    const boss = state.users.find(user => user.isSuperAdmin)!;
    localStorage.setItem(`aitask:release-notice:2026-08-service-operations:${boss.id}`, 'acknowledged');
    useStore.setState({
      currentUser: { ...boss, mustResetPassword: false },
      clients: [],
      clientPlans: [],
      serviceCycles: [],
      deliverables: [],
      cycleComments: [],
      addons: [],
      servicePricingSnapshots: [],
      servicePackages: [{
        id: 'PKG-growth-e2e',
        name: 'Growth Plan',
        description: 'Stable E2E package',
        revision: 3,
        currency: 'MYR',
        serviceItems: [{ id: 'SI-video-e2e', name: 'Short Video', platforms: ['TikTok'], unit: 'video', quantity: 1, unitPriceMinor: 25000 }],
        discountType: 'none',
        discountValue: 0,
        taxRateBps: 0,
        isActive: true,
        createdAt: '2026-08-15T00:00:00.000Z',
        updatedAt: '2026-08-15T00:00:00.000Z',
      }],
      backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 },
    });
  });
};

test('creates a client profile first, then a named project', async ({ page }) => {
  test.setTimeout(120_000);
  await seedAdminAndPackage(page);
  await page.goto('/projects');

  await page.getByRole('button', { name: 'New client' }).click();
  const clientDialog = page.getByRole('dialog', { name: 'Add a client company' });
  await clientDialog.getByLabel('Company name *').fill('Flow Test Company');
  await clientDialog.getByLabel('Email').fill('contact@flow-test.example');
  await clientDialog.getByRole('button', { name: 'Save client' }).click();
  const clientAddedDialog = page.getByRole('dialog', { name: 'Client added' });
  await expect(clientAddedDialog).toBeVisible();

  await clientAddedDialog.getByRole('button', { name: 'Create project' }).click();
  const projectDialog = page.getByRole('dialog', { name: 'Create project' });
  await expect(projectDialog.getByLabel('Company name *')).toHaveValue(/CL-/);
  await projectDialog.getByLabel('Project name *').fill('Q4 Launch');
  await projectDialog.getByRole('button', { name: 'Design' }).click();
  await projectDialog.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(projectDialog).toBeHidden();
  await expect(page.getByText('Projects: Q4 Launch', { exact: true }).last()).toBeVisible();

  const project = await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    return useStore.getState().projects.find(item => item.projectName === 'Q4 Launch');
  });
  expect(project).toMatchObject({ clientName: 'Flow Test Company', projectName: 'Q4 Launch' });

  await page.getByRole('button', { name: 'New task' }).click();
  const taskDialog = page.getByRole('dialog', { name: 'Create task' });
  await taskDialog.getByLabel(/Link to Company \/ Brand/).selectOption(project!.id);
  await taskDialog.getByLabel('Task Title').fill('Launch creative brief');
  await taskDialog.getByLabel(/Assign to Position\/Department/).selectOption('Designer');
  await taskDialog.getByRole('button', { name: 'Create & open task' }).click();
  await expect(taskDialog).toBeHidden();
  await expect(page).toHaveURL(/\/tasks\?taskId=/);

  const task = await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    return useStore.getState().tasks.find(item => item.title === 'Launch creative brief');
  });
  expect(task).toMatchObject({ clientId: project!.clientId, clientName: 'Flow Test Company', projectId: project!.id, projectName: 'Q4 Launch' });
});

test('can add a client inside project creation and continue the same form', async ({ page }) => {
  test.setTimeout(120_000);
  await seedAdminAndPackage(page);
  await page.goto('/projects');

  await page.getByRole('button', { name: 'New project' }).click();
  const projectDialog = page.getByRole('dialog', { name: 'Create project' });
  await projectDialog.getByRole('button', { name: '+ Add client' }).click();
  const clientDialog = page.getByRole('dialog', { name: 'Add a client company' });
  await clientDialog.getByLabel('Company name *').fill('Inline Company');
  await clientDialog.getByRole('button', { name: 'Save client' }).click();
  await expect(projectDialog.getByLabel('Company name *')).toHaveValue(/CL-/);
  await projectDialog.getByLabel('Project name *').fill('Inline Project');
  await projectDialog.getByRole('button', { name: 'Design' }).click();
  await projectDialog.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(projectDialog).toBeHidden();
  await expect(page.getByText('Projects: Inline Project', { exact: true }).last()).toBeVisible();
});
