import { expect, test, type Page } from '@playwright/test';

const startPm = async (page: Page) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/login');
  await page.waitForFunction(() => Boolean(document.querySelector('form input, main')));
  return page.evaluate(async () => {
    localStorage.setItem('aitask:locale', 'en');
    const { useStore } = await import('/src/store/index.ts');
    const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
    const state = useStore.getState();
    const pm = state.users.find(item => item.role === 'Project Manager' && !item.isSuperAdmin)!;
    enablePasswordResetBypass(pm.id);
    localStorage.setItem(`aitask:release-notice:2026-11-start-wording:${pm.id}`, 'acknowledged');
    const staff = state.users.find(user => user.role === 'Staff' && (user.departments || []).includes('Designer'))!;
    const base = { ...state.tasks[0], clientId: undefined, clientName: 'Rate Co', projectId: 'rate-project', projectName: 'Rate project', department: 'Designer',
      createdBy: pm.id, assignedBy: pm.id, assignedTo: staff.id, comments: [], approvalHistory: [], workHistory: [], workState: {},
      deliverableId: undefined, serviceCycleId: undefined, generatedFromDeliverable: false, workflowStepId: undefined, startDate: '2026-01-01', dueDate: '2099-01-01', visibility: 'client-visible' };
    useStore.setState({
      currentUser: { ...pm, mustResetPassword: false },
      projects: [{ id: 'rate-project', clientName: 'Rate Co', projectName: 'Rate project', createdBy: pm.id, projectManagerIds: [pm.id], includedRevisions: 2, services: ['Design'], startDate: '2026-01-01', deadline: '' }],
      tasks: [
        { ...base, id: 'rate-open', title: 'Revising banner', status: 'In Progress', isCompleted: false, revisionCount: 1, clientApprovalStatus: 'Pending' },
        { ...base, id: 'rate-done', title: 'Accepted banner', status: 'Completed', isCompleted: true, completedAt: '2026-11-18T01:00:00.000Z', revisionCount: 3, clientApprovalStatus: 'Approved' },
      ],
      backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 },
    });
    return pm.id;
  });
};

test('a task shows the revision rounds used against what the project includes', async ({ page }) => {
  await startPm(page);
  await page.goto('/tasks');
  const card = page.getByRole('article').filter({ hasText: 'Revising banner' }).or(page.locator('li, div').filter({ hasText: 'Revising banner' }).first());
  await expect(card.getByText('Revision 1 of 2').first()).toBeVisible();
});

test('a PM rates an accepted delivery and the rating is stored once saved', async ({ page }) => {
  await startPm(page);
  await page.goto('/tasks?taskId=rate-done');
  const rating = page.getByRole('region', { name: 'Client satisfaction' });
  await expect(rating).toBeVisible();
  await expect(page.getByText('Beyond the revisions included in this project.')).toBeVisible();
  await rating.getByRole('radio', { name: '4 stars' }).click();
  await rating.getByLabel(/Comment/).fill('Happy with the banner');
  await rating.getByRole('button', { name: 'Save rating' }).click();
  await expect(rating.getByText('Rating saved.')).toBeVisible();
  const stored = await page.evaluate(async () => (await import('/src/store/index.ts')).useStore.getState().tasks.find(task => task.id === 'rate-done')?.clientRating);
  expect(stored).toMatchObject({ stars: 4, comment: 'Happy with the banner' });
});

test('an unfinished task cannot be rated', async ({ page }) => {
  await startPm(page);
  await page.goto('/tasks?taskId=rate-open');
  await expect(page.getByRole('dialog').first()).toBeVisible();
  await expect(page.getByText('Revision 1 of 2').first()).toBeVisible();
  await expect(page.getByRole('region', { name: 'Client satisfaction' })).toHaveCount(0);
});

test('a PM writes a client brief and the team can read it', async ({ page }) => {
  await startPm(page);
  await page.goto('/tasks?taskId=rate-open');
  const brief = page.getByRole('region', { name: 'Client brief' });
  await expect(brief.getByText('No brief yet.', { exact: false })).toBeVisible();
  await brief.getByRole('button', { name: 'Add brief' }).click();
  await brief.getByLabel('Reference links (one per line)').fill('https://example.com/moodboard');
  await brief.getByLabel('Must include').fill('Logo in the top left');
  await brief.getByLabel('Avoid').fill('Stock photos');
  await brief.getByRole('button', { name: 'Save brief' }).click();
  await expect(brief.getByRole('link', { name: 'https://example.com/moodboard' })).toBeVisible();
  await expect(brief.getByText('Logo in the top left')).toBeVisible();
  const stored = await page.evaluate(async () => (await import('/src/store/index.ts')).useStore.getState().tasks.find(task => task.id === 'rate-open')?.brief);
  expect(stored).toMatchObject({ mustHave: 'Logo in the top left', avoid: 'Stock photos' });
});

test('a brief with an insecure link is refused', async ({ page }) => {
  await startPm(page);
  await page.goto('/tasks?taskId=rate-open');
  const brief = page.getByRole('region', { name: 'Client brief' });
  await brief.getByRole('button', { name: 'Add brief' }).click();
  await brief.getByLabel('Reference links (one per line)').fill('http://insecure.example');
  await brief.getByRole('button', { name: 'Save brief' }).click();
  await expect(brief.getByRole('alert')).toContainText('Links must be valid HTTPS URLs.');
});
