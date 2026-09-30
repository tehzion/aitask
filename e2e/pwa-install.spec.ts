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
  await releaseNotice.waitFor({ state: 'visible', timeout: 5000 }).then(() => releaseNotice.getByRole('button', { name: 'Happy working' }).click()).catch(() => undefined);
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

test('a real service-worker replacement preserves a dirty form and enables refresh after save', async ({ page }) => {
  const { readFile, writeFile } = await import('node:fs/promises');
  const workerPath = new URL('../dist/sw.js', import.meta.url);
  const original = await readFile(workerPath, 'utf8');
  await page.goto('/login');
  await page.getByRole('button', { name: 'Use Project Manager Demo' }).click();
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Access Dashboard' }).click();
  await page.waitForURL(url => url.pathname === '/' || url.pathname === '/settings');
  if (new URL(page.url()).pathname === '/settings') await page.getByRole('button', { name: 'Continue for now' }).click();
  const notice = page.getByRole('button', { name: 'Happy working' });
  if (await notice.isVisible().catch(() => false)) await notice.click();
  await page.goto('/settings');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  // Reload once while pristine so the application starts with a controller.
  await page.reload();
  const release = page.getByRole('button', { name: 'Happy working' });
  await release.waitFor({ state: 'visible', timeout: 5000 }).then(() => release.click()).catch(() => undefined);
  const name = page.locator('#profile-name');
  await name.fill('PWA protected draft');
  await expect(page.getByRole('button', { name: 'Save profile', exact: true })).toBeEnabled();
  const marker = `audit-update-${Date.now()}`;
  await page.evaluate(value => { window.__auditPageMarker = value; Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); }, marker);
  try {
    await writeFile(workerPath, `${original}\n// ${marker}\n`);
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      const changed = new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
      await registration.update(); await changed;
    });
    await expect(page.getByText('Update available', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Refresh now' })).toBeDisabled();
    await expect(name).toHaveValue('PWA protected draft');
    expect(await page.evaluate(() => window.__auditPageMarker)).toBe(marker);
    await page.evaluate(() => { delete document.visibilityState; });
    await page.getByRole('button', { name: 'Save profile', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Refresh now' })).toBeEnabled();
  } finally { await writeFile(workerPath, original); }
});
