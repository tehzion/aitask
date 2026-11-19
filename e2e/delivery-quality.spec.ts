import { expect, test, type Page } from '@playwright/test';

const seed = async (page: Page, as: 'pm' | 'staff') => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/login');
  await page.waitForFunction(() => Boolean(document.querySelector('form input, main')));
  await page.evaluate(async role => {
    localStorage.setItem('aitask:locale', 'en');
    const { useStore } = await import('/src/store/index.ts');
    const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
    const state = useStore.getState();
    const pm = state.users.find(item => item.role === 'Project Manager' && !item.isSuperAdmin)!;
    const staff = state.users.find(user => user.role === 'Staff' && (user.departments || []).includes('Designer'))!;
    const other = state.users.find(user => user.role === 'Staff' && user.id !== staff.id) || staff;
    const actor = role === 'pm' ? pm : staff;
    enablePasswordResetBypass(actor.id);
    localStorage.setItem(`aitask:release-notice:2026-11-start-wording:${actor.id}`, 'acknowledged');
    const day = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); return d; };
    const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const base = { ...state.tasks[0], clientId: undefined, clientName: 'Quality Co', projectId: 'quality-project', projectName: 'Quality project', department: 'Designer',
      createdBy: pm.id, assignedBy: pm.id, comments: [], approvalHistory: [], workHistory: [], workState: {}, deliverableId: undefined, serviceCycleId: undefined,
      generatedFromDeliverable: false, workflowStepId: undefined, startDate: '2026-01-01', status: 'Completed', isCompleted: true, clientApprovalStatus: 'Approved' };
    const done = (id: string, assignedTo: string, dueOffset: number, doneOffset: number, revisionCount = 0) => ({ ...base, id, title: id, assignedTo,
      dueDate: ymd(day(dueOffset)), completedAt: day(doneOffset).toISOString(), revisionCount });
    useStore.setState({
      currentUser: { ...actor, mustResetPassword: false },
      projects: [{ id: 'quality-project', clientName: 'Quality Co', projectName: 'Quality project', createdBy: pm.id, projectManagerIds: [pm.id], services: ['Design'], startDate: '2026-01-01', deadline: '' }],
      tasks: [
        done('q-on-time-1', staff.id, -3, -4),
        done('q-on-time-2', staff.id, -2, -2, 1),
        done('q-late', staff.id, -6, -5, 2),
        done('q-other', other.id, -3, -4),
        // Finished moments ago: must count in the period, not be treated as the future.
        { ...done('q-today', other.id, 0, 0), completedAt: new Date(Date.now() - 60_000).toISOString() },
      ],
      backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 },
    });
  }, as);
};

test('a PM sees delivery quality for each person on their projects', async ({ page }) => {
  await seed(page, 'pm');
  await page.goto('/reports');
  const panel = page.getByRole('region', { name: 'Delivery quality' });
  await expect(panel).toBeVisible();
  await expect(panel.getByText('Finished', { exact: true }).first()).toBeVisible();
  const table = panel.getByRole('table', { name: 'Delivery quality by person' });
  await expect(table.getByRole('row')).toHaveCount(3); // header + two people
  // 3 finished by the busiest person, 2 of them on time.
  const busiest = table.getByRole('row').nth(1);
  await expect(busiest).toContainText('3');
  await expect(busiest).toContainText('67%');
  await expect(busiest).toContainText('67%'); // 2 of 3 needed a revision round
});

test('Staff only see their own delivery quality, without a people table', async ({ page }) => {
  await seed(page, 'staff');
  await page.goto('/reports');
  const panel = page.getByRole('region', { name: 'Delivery quality' });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('table')).toHaveCount(0);
  await expect(panel.getByText('2 of 3')).toBeVisible();
});

test('the period switch narrows the finished work', async ({ page }) => {
  await seed(page, 'pm');
  await page.goto('/reports');
  const panel = page.getByRole('region', { name: 'Delivery quality' });
  await panel.getByRole('button', { name: 'Last 30 days' }).click();
  await expect(panel.getByRole('button', { name: 'Last 30 days' })).toHaveAttribute('aria-pressed', 'true');
  await expect(panel.getByText('5', { exact: true }).first()).toBeVisible();
});

test('the delivery quality panel shows a weekly trend with a text alternative', async ({ page }) => {
  await seed(page, 'pm');
  await page.goto('/reports');
  const trend = page.getByRole('img', { name: /^Finished per week:/ });
  await expect(trend).toBeVisible();
  const label = await trend.getAttribute('aria-label');
  // Eight weeks, oldest first, each with its count.
  expect((label || '').split(',').length).toBe(8);
});

test('a company card rolls up the ratings of its delivered work', async ({ page }) => {
  await seed(page, 'pm');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const state = useStore.getState();
    const pm = state.currentUser!;
    useStore.setState({
      clients: [{ id: 'quality-co', clientName: 'Quality Co', createdBy: pm.id, createdAt: '', updatedAt: '' }] as never,
      tasks: state.tasks.map((task, index) => ({ ...task, clientId: 'quality-co',
        clientRating: index === 0 ? { stars: 5, ratedBy: pm.id, ratedAt: new Date().toISOString() } : index === 1 ? { stars: 4, ratedBy: pm.id, ratedAt: new Date().toISOString() } : undefined })),
    });
  });
  await page.goto('/projects');
  await expect(page.getByRole('heading', { name: 'Companies', level: 1 })).toBeVisible();
  await expect(page.getByText('4.5 / 5').filter({ visible: true })).toHaveCount(1);
  await expect(page.getByText('(2 rated)').filter({ visible: true })).toHaveCount(1);
});
