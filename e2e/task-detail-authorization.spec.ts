import { expect, test, type Page } from '@playwright/test';

type SeedTask = {
  id: string;
  title: string;
  clientName: string;
  visibility?: 'internal' | 'client-visible';
  assignedTo: string;
  createdBy: string;
  department: 'Designer' | 'Video Editor' | 'Operation';
};

const makeTask = (task: SeedTask) => ({
  ...task,
  serviceType: 'Design',
  description: 'Authorization matrix task',
  projectName: task.clientName,
  startDate: '2026-09-18',
  dueDate: '2026-09-25',
  priority: 'Medium' as const,
  status: 'In Progress',
  completionPercentage: 35,
  isCompleted: false,
  revisionCount: 0,
  clientApprovalStatus: 'Pending' as const,
  isRecurring: false,
  recurrenceFrequency: 'None' as const,
  comments: [],
  approvalHistory: [],
});

const signIn = async (page: Page, username: string) => {
  await page.goto('/login');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByLabel('Email or username').fill(username);
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Access Dashboard' }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/login'));
  const continueButton = page.getByRole('button', { name: 'Continue for now' });
  if (page.url().includes('/settings')) {
    await expect(continueButton).toBeVisible();
    await continueButton.click();
    await page.waitForURL(url => !url.pathname.endsWith('/settings'));
  }
  const releaseNotice = page.getByRole('button', { name: 'Happy working' });
  await releaseNotice.waitFor({ state: 'visible', timeout: 5_000 }).then(() => releaseNotice.click()).catch(() => undefined);
  await page.evaluate(async () => {
    const { stopBackendAutoSync } = await import('/src/store/index.ts');
    stopBackendAutoSync();
  });
};

const seedTasks = async (page: Page, tasks: ReturnType<typeof makeTask>[], ownedClientNames: string[] = []) => {
  await page.evaluate(({ tasks: nextTasks, ownedClientNames: nextOwnedClientNames }) => (
    (async () => {
      const { useStore } = await import('/src/store/index.ts');
      const state = useStore.getState();
      const seededIds = new Set(nextTasks.map(task => task.id));
      const seededClients = nextOwnedClientNames.map((clientName, index) => ({
        id: `e2e-client-${index}`,
        clientName,
        createdBy: state.currentUser?.id,
        createdAt: '2026-09-18T00:00:00.000Z',
        updatedAt: '2026-09-18T00:00:00.000Z',
      }));
      useStore.setState({
        tasks: [...state.tasks.filter(task => !seededIds.has(task.id)), ...nextTasks],
        clients: [
          ...state.clients.filter(client => !nextOwnedClientNames.includes(client.clientName)),
          ...seededClients,
        ],
      });
    })()
  ), { tasks, ownedClientNames });
};

const navigateToTask = async (page: Page, task: ReturnType<typeof makeTask>, ownedClientNames: string[] = []) => {
  await page.goto('/tasks');
  await seedTasks(page, [task], ownedClientNames);
  await page.evaluate(taskId => {
    window.history.pushState({}, '', `/tasks?taskId=${encodeURIComponent(taskId)}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, task.id);
};

const openTask = async (page: Page, task: ReturnType<typeof makeTask>, ownedClientNames: string[] = []) => {
  await navigateToTask(page, task, ownedClientNames);
  const dialog = page.getByRole('dialog', { name: task.title });
  await expect(dialog).toBeVisible();
  return dialog;
};

test.describe('task detail authorization matrix', () => {
  test('Boss Koo keeps full controls while PM portfolio tasks are read-only', async ({ page }) => {
    const bossTask = makeTask({
      id: 'e2e-boss-unrelated',
      title: 'Boss unrestricted task',
      clientName: 'Hidden Co',
      assignedTo: 'u-staff-demo-local',
      createdBy: 'u-staff-demo-local',
      department: 'Designer',
    });
    await signIn(page, 'Boss Koo');
    const bossDialog = await openTask(page, bossTask);
    await expect(bossDialog.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
    await expect(bossDialog.getByRole('button', { name: 'Delete', exact: true })).toBeVisible();
    await expect(bossDialog.getByPlaceholder('Write a comment or update...')).toBeVisible();
    await expect(bossDialog.locator('select')).toHaveCount(1);

    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Logout' }).click();
    await signIn(page, 'Project Manager Demo');
    const portfolioTask = makeTask({
      id: 'e2e-pm-portfolio',
      title: 'PM portfolio read-only task',
      clientName: 'Owned Portfolio Co',
      assignedTo: 'u-staff-demo-local',
      createdBy: 'u-staff-demo-local',
      department: 'Designer',
    });
    const portfolioDialog = await openTask(page, portfolioTask, ['Owned Portfolio Co']);
    await expect(portfolioDialog.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
    await expect(portfolioDialog.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
    await expect(portfolioDialog.getByPlaceholder('Write a comment or update...')).toHaveCount(0);
    await expect(portfolioDialog.getByText('PM portfolio read-only task', { exact: true })).toBeVisible();
  });

  test('PM owned work, HOD department work, and Staff assignments expose matching actions', async ({ page }) => {
    const pmCreatedTask = makeTask({
      id: 'e2e-pm-created',
      title: 'PM created task',
      clientName: 'Other Co',
      assignedTo: 'u-staff-demo-local',
      createdBy: 'u-admin',
      department: 'Designer',
    });
    await signIn(page, 'Project Manager Demo');
    const pmDialog = await openTask(page, pmCreatedTask);
    await expect(pmDialog.getByRole('button', { name: 'Full edit', exact: true })).toBeVisible();
    await pmDialog.getByRole('button', { name: 'Full edit', exact: true }).click();
    const pmEditor = page.getByRole('dialog', { name: pmCreatedTask.title });
    await expect(pmEditor.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
    await expect(pmEditor.getByPlaceholder('Write a comment or update...')).toBeVisible();

    const hodDepartmentTask = makeTask({
      id: 'e2e-hod-department',
      title: 'HOD department task',
      clientName: 'Department Co',
      assignedTo: 'u-staff-demo-local',
      createdBy: 'u-staff-demo-local',
      department: 'Designer',
    });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Logout' }).click();
    await signIn(page, 'HOD Demo');
    const hodDialog = await openTask(page, hodDepartmentTask);
    await expect(hodDialog.getByRole('button', { name: 'Full edit', exact: true })).toBeVisible();
    await hodDialog.getByRole('button', { name: 'Full edit', exact: true }).click();
    const hodEditor = page.getByRole('dialog', { name: hodDepartmentTask.title });
    await expect(hodEditor.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
    await hodEditor.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(hodEditor.locator('select').filter({ has: page.locator('option[value="u-staff-demo-local"]') })).toBeDisabled();

    const staffAssignedTask = makeTask({
      id: 'e2e-staff-assigned',
      title: 'Staff assigned task',
      clientName: 'Staff Co',
      assignedTo: 'u-staff-demo-local',
      createdBy: 'u-admin',
      department: 'Designer',
    });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Logout' }).click();
    await signIn(page, 'Staff Demo');
    const staffDialog = await openTask(page, staffAssignedTask);
    await expect(staffDialog.getByRole('button', { name: 'Full edit', exact: true })).toBeVisible();
    await staffDialog.getByRole('button', { name: 'Full edit', exact: true }).click();
    const staffEditor = page.getByRole('dialog', { name: staffAssignedTask.title });
    await expect(staffEditor.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
    await staffEditor.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(staffEditor.locator('select').filter({ has: page.locator('option[value="u-staff-demo-local"]') })).toBeDisabled();
  });

  test('deep links fail closed for unrelated tasks and preserve Client isolation', async ({ page }) => {
    const unrelatedTask = makeTask({
      id: 'e2e-unrelated-deep-link',
      title: 'Unrelated deep link task',
      clientName: 'Other Company',
      assignedTo: 'u-admin',
      createdBy: 'u-admin',
      department: 'Designer',
    });
    await signIn(page, 'Staff Demo');
    await navigateToTask(page, unrelatedTask);
    await expect(page.getByRole('dialog', { name: unrelatedTask.title })).toHaveCount(0);

    const clientTask = makeTask({
      id: 'e2e-client-visible',
      title: 'Client-visible delivery',
      clientName: 'UrbanEats',
      visibility: 'client-visible',
      assignedTo: 'u-staff-demo-local',
      createdBy: 'u-admin',
      department: 'Operation',
    });
    const internalTask = makeTask({
      id: 'e2e-client-internal',
      title: 'Client-hidden internal task',
      clientName: 'UrbanEats',
      visibility: 'internal',
      assignedTo: 'u-staff-demo-local',
      createdBy: 'u-admin',
      department: 'Operation',
    });
    await page.getByRole('button', { name: 'Logout' }).click();
    await signIn(page, 'UrbanEats Client Demo');
    await navigateToTask(page, clientTask);
    const clientDialog = page.getByRole('dialog', { name: 'Delivery details' });
    await expect(clientDialog).toBeVisible();
    await clientDialog.getByRole('button', { name: 'Close', exact: true }).click();
    await navigateToTask(page, internalTask);
    await expect(page.getByRole('dialog', { name: internalTask.title })).toHaveCount(0);
  });
});
