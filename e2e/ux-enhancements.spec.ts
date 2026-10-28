import { expect, test, type Page } from '@playwright/test';

async function login(page: Page, name = 'Project Manager Demo') {
  await page.goto('/login');
  await page.getByRole('button', { name: `Use ${name}`, exact: true }).click();
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/login'));
  if (/\/settings$/.test(page.url())) await page.getByRole('button', { name: 'Continue for now' }).click();
  const notice = page.getByRole('button', { name: 'Happy working' });
  await notice.waitFor({ state: 'visible', timeout: 3000 }).catch(() => undefined);
  if (await notice.isVisible()) await notice.click();
}

for (const width of [320, 375, 390, 414, 768, 1024]) {
  const role = width === 320 || width === 414 ? 'Project Manager' : width === 375 || width === 768 ? 'HOD' : 'Staff';
  test(`quick creation for ${role} at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page);
    await page.goto('/tasks');
    await page.evaluate(async role => {
      const { useStore } = await import('/src/store/index.ts');
      const state = useStore.getState();
      const actor = { ...state.currentUser, role, departments: ['Designer'], department: 'Designer', customRoleId: undefined, permissions: undefined, isSuperAdmin: false };
      useStore.setState({ currentUser: actor, users: state.users.map(user => user.id === actor.id ? actor : user),
        clients: [...state.clients, { id: 'ux-company', clientName: 'UX company', createdBy: actor.id, createdAt: '', updatedAt: '' }],
        projects: [...state.projects, { id: 'ux-project', clientId: 'ux-company', clientName: 'UX company', projectName: 'UX project', createdBy: actor.id, services: ['Design'], startDate: '2026-01-01', deadline: '' }],
        tasks: [...state.tasks, { ...state.tasks[0], id: 'ux-context', clientId: 'ux-company', clientName: 'UX company', projectId: 'ux-project', assignedTo: actor.id, createdBy: actor.id, department: 'Designer' }],
      });
    }, role);
    await page.getByRole('button', { name: 'New task', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: /^Create task$/i });
    await dialog.getByLabel(/Link to Company/).selectOption('ux-project');
    await dialog.getByLabel('Task Title').fill(`UX creation ${width}`);
    await dialog.getByLabel('Assign to Position/Department').selectOption('Designer');
    await expect(dialog.getByLabel('Description', { exact: true })).toBeHidden();
    await dialog.getByText('Additional details', { exact: true }).click();
    await dialog.getByLabel('Description', { exact: true }).fill('Preserved brief');
    await dialog.getByLabel('Attachment URL').fill('http://example.com/brief');
    await dialog.getByText('Additional details', { exact: true }).click();
    await dialog.getByRole('button', { name: 'Create & open task', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('Links must be valid HTTPS URLs.');
    await expect(dialog.getByLabel('Attachment URL')).toBeVisible();
    await dialog.getByLabel('Attachment URL').fill('https://example.com/brief');
    await dialog.getByRole('button', { name: 'Create & open task', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(/taskId=/);
    const created = await page.evaluate(async title => {
      const { useStore } = await import('/src/store/index.ts');
      return useStore.getState().tasks.filter(task => task.title === title).map(task => ({ description: task.description, clientName: task.clientName }));
    }, `UX creation ${width}`);
    expect(created).toEqual([{ description: 'Preserved brief', clientName: 'UX company' }]);
  });

  test(`global search keyboard and navigation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page);
    await page.goto('/tasks');
    await page.evaluate(async () => {
      const { useStore } = await import('/src/store/index.ts');
      const state = useStore.getState();
      const base = state.tasks[0];
      if (!base) throw new Error('Expected demo task fixture');
      useStore.setState({ tasks: [...state.tasks,
        { ...base, id: 'ux-search-allowed', title: 'UX unique record', createdBy: state.currentUser.id, assignedTo: state.currentUser.id },
        { ...base, id: 'ux-search-denied', title: 'UX secret record', clientId: 'other-client', clientName: 'Other private company', projectId: undefined, createdBy: 'other-pm', assignedTo: 'other-staff' },
      ] });
    });
    if (width < 640) await page.getByRole('button', { name: 'Search', exact: true }).click();
    const input = page.locator('[data-global-search]:visible');
    await input.fill('UX unique');
    const results = page.getByRole('region', { name: 'Workspace search results' }).filter({ visible: true });
    await expect(results.getByRole('button', { name: 'UX unique record' })).toBeVisible();
    await input.press('ArrowDown');
    await expect(results.getByRole('button', { name: 'UX unique record' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/taskId=ux-search-allowed/);
    await expect(page.getByRole('dialog', { name: 'UX unique record', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'UX unique record', exact: true })).toHaveCount(0);
    if (width < 640) await page.getByRole('button', { name: 'Search', exact: true }).click();
    await input.fill('UX secret');
    await expect(results.getByText('No accessible records match your search.')).toBeVisible();
    await expect(results.getByRole('button', { name: 'UX secret record' })).toHaveCount(0);
  });
}

test('saved personal views restore URL filters, update, delete, and preserve the table preference', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await login(page, 'Staff Demo');
  await page.goto('/tasks');
  const views = page.locator('details').filter({ hasText: 'Personal views' });
  await views.locator('summary').click();
  await page.getByLabel('Search visible work').fill('UrbanEats');
  await page.waitForURL(/search=UrbanEats/);
  await views.getByLabel('View name').fill('My delivery search');
  await views.getByRole('button', { name: 'Save view', exact: true }).click();
  await expect(views.getByRole('status')).toContainText('View saved');
  await page.getByLabel('Search visible work').fill('');
  await page.waitForURL(url => !url.searchParams.has('search'));
  await views.getByLabel('Choose a saved view').selectOption({ label: 'My delivery search' });
  await expect(page).toHaveURL(/search=UrbanEats/);
  await views.getByLabel('View name').fill('Updated delivery search');
  await views.getByRole('button', { name: 'Update view', exact: true }).click();
  await expect(views.getByRole('option', { name: 'Updated delivery search' })).toHaveCount(1);
  await views.getByRole('button', { name: 'Delete view', exact: true }).click();
  await expect(views.getByRole('option', { name: 'Updated delivery search' })).toHaveCount(0);
});

test('Boss table and board preference stays URL-backed and persists per user', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/login');
  // Let the app finish its startup load so seeded state is not overwritten.
  await page.waitForFunction(() => Boolean(document.querySelector('form input, main')));
  await page.evaluate(async () => {
    const { useStore, stopBackendAutoSync } = await import('/src/store/index.ts');
    const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
    const state = useStore.getState();
    const boss = state.users.find(user => user.isSuperAdmin)!;
    enablePasswordResetBypass(boss.id);
    localStorage.setItem(`aitask:release-notice:2026-08-service-operations:${boss.id}`, 'acknowledged');
    useStore.setState({ currentUser: { ...boss, mustResetPassword: false }, backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 } });
    stopBackendAutoSync();
  });
  await page.goto('/tasks');
  const views = page.locator('details').filter({ hasText: 'Personal views' });
  await views.locator('summary').click();
  await views.getByLabel('View mode').selectOption('board');
  await expect(page).toHaveURL(/view=board/);
  await expect(page.locator('main').getByRole('button', { name: 'Board', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page).toHaveURL(/view=board/);
  await expect(page.locator('main').getByRole('button', { name: 'Board', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await views.locator('summary').click();
  await views.getByLabel('View mode').selectOption('table');
  await expect(page).toHaveURL(/view=table/);
  await expect(page.locator('main').getByRole('button', { name: 'Table', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('My work and All work explain distinct responsibilities and reuse existing queues', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await login(page, 'Staff Demo');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'My work' })).toBeVisible();
  await expect(page.getByText('What to work on next, ordered by revisions and deadlines.')).toBeVisible();
  // One summary row replaces the duplicated Action Centre panel; its counts still link into the queues.
  const overview = page.getByRole('navigation', { name: 'Assignment overview' });
  await expect(overview.getByRole('link')).toHaveCount(4);
  await overview.getByRole('link', { name: /Needs action/ }).click();
  await expect(page).toHaveURL(/\/tasks\?queue=needs_action/);
  await expect(page.getByRole('heading', { name: 'All work', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Needs action/, selected: true })).toBeVisible();
});
