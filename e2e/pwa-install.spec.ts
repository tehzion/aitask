import { expect, test } from '@playwright/test';

test('production PWA installs and restores its offline shell', async ({ context, page }) => {
  await page.goto('/login');
  const manifest = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifest).toBe('/manifest.webmanifest');

  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>(resolve => {
        navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
      });
    }
  });

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#root')).not.toBeEmpty();
  await expect(page.getByRole('heading', { name: /Welcome back|AiTask/i })).toBeVisible();
});

test('a first-time offline Reports deep link renders the report shell and data fallback', async ({ context, page }) => {
  await page.clock.install({ time: new Date('2026-09-28T00:00:00.000Z') });
  await page.goto('/login');
  await page.getByRole('button', { name: 'Use Project Manager Demo' }).click();
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Access Dashboard' }).click();
  await page.waitForURL(url => url.pathname === '/' || url.pathname === '/settings');
  const continueButton = page.getByRole('button', { name: 'Continue for now' });
  if (page.url().endsWith('/settings')) await continueButton.click();
  const releaseNotice = page.getByRole('dialog', { name: 'Service operations are now in one calm workspace' });
  if (await releaseNotice.isVisible().catch(() => false)) {
    await releaseNotice.getByRole('button', { name: 'Happy working' }).click();
  }
  await page.evaluate(() => {
    const raw = window.localStorage.getItem('market-task-storage');
    if (!raw) throw new Error('Local workspace persistence was not initialized.');
    const persisted = JSON.parse(raw) as { state?: { tasks?: unknown[]; currentUser?: { id?: string } } };
    const state = persisted.state;
    if (!state?.currentUser?.id) throw new Error('Local demo session was not persisted.');
    state.tasks = [
      ...(state.tasks || []),
      {
        id: 'PWA-REPORT-TASK',
        clientName: 'TechNova',
        serviceType: 'Design',
        title: 'Offline report task',
        description: 'PWA report fixture',
        department: 'Designer',
        assignedTo: state.currentUser.id,
        createdBy: state.currentUser.id,
        startDate: '2026-09-28',
        dueDate: '2026-09-28',
        priority: 'Medium',
        status: 'Pending',
        completionPercentage: 0,
        isCompleted: false,
        revisionCount: 0,
        clientApprovalStatus: 'Pending',
        isRecurring: false,
        comments: [],
        approvalHistory: [],
      },
    ];
    window.localStorage.setItem('market-task-storage', JSON.stringify(persisted));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Portfolio work' })).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>(resolve => {
        navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
      });
    }
  });

  await context.setOffline(true);
  await page.goto('/reports', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Four-Week Performance Report' })).toBeVisible();
  await expect(page.getByText('Due tasks', { exact: true })).toBeVisible();
  await expect(page.getByText('View weekly data table', { exact: true })).toBeVisible();
});
