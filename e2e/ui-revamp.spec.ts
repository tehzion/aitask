import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe.configure({ timeout: 90_000 });

const ACTORS = {
  boss: 'u-boss',
  pm: 'u-admin',
  hod: 'u-hod-demo-local',
  staff: 'u-staff-demo-local',
  client: 'u-client-urban',
} as const;

type Actor = keyof typeof ACTORS;

// One project in the PM's portfolio, with every task status the lists must handle.
const seed = async (page: Page, actor: Actor, locale: 'en' | 'zh' = 'en') => {
  page.on('dialog', dialog => void dialog.accept());
  await page.goto('/login');
  await page.waitForFunction(() => Boolean(document.querySelector('form input')));
  await page.evaluate(async ({ actorId, locale }) => {
    const { useStore, stopBackendAutoSync } = await import('/src/store/index.ts');
    const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
    const state = useStore.getState();
    const actor = state.users.find(user => user.id === actorId)!;
    enablePasswordResetBypass(actor.id);
    localStorage.setItem(`aitask:release-notice:2026-08-service-operations:${actor.id}`, 'acknowledged');
    localStorage.setItem('aitask:locale', locale);
    const day = (offset: number) => {
      const date = new Date();
      date.setDate(date.getDate() + offset);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    };
    if (actor.role === 'Client') {
      useStore.setState({ currentUser: { ...actor, mustResetPassword: false } });
      stopBackendAutoSync();
      return;
    }
    const base = {
      clientId: 'rv-company', clientName: 'RV Company', projectId: 'rv-project', projectName: 'RV Launch', serviceType: 'Design',
      description: '', department: 'Designer', assignedTo: 'u-staff-demo-local', assignedBy: 'u-hod-demo-local', createdBy: 'u-admin',
      startDate: day(-10), dueDate: day(5), priority: 'Medium', completionPercentage: 0, isCompleted: false, revisionCount: 0,
      clientApprovalStatus: 'Pending', isRecurring: false, visibility: 'internal', comments: [], approvalHistory: [],
      attachmentLink: 'https://example.com/output.pdf', updatedAt: new Date().toISOString(),
    };
    useStore.setState({
      currentUser: { ...actor, mustResetPassword: false },
      clients: [{ id: 'rv-company', clientName: 'RV Company', createdBy: 'u-admin', createdAt: day(-30), updatedAt: day(-30) }],
      projects: [{
        id: 'rv-project', clientId: 'rv-company', clientName: 'RV Company', projectName: 'RV Launch', services: ['Design'],
        startDate: day(-30), deadline: day(30), totalTasks: 7, completedTasks: 1, createdBy: 'u-admin',
        projectManagerIds: ['u-admin'], hodMemberIds: ['u-hod-demo-local'], staffMemberIds: ['u-staff-demo-local'],
      }],
      tasks: [
        { ...base, id: 'rv-open', title: 'RV open brief', status: 'Pending' },
        { ...base, id: 'rv-overdue', title: 'RV overdue banner', status: 'In Progress', dueDate: day(-2), completionPercentage: 40 },
        { ...base, id: 'rv-done', title: 'RV finished logo', status: 'Completed', isCompleted: true, completionPercentage: 100, completedAt: new Date().toISOString() },
        { ...base, id: 'rv-cancelled', title: 'RV cancelled flyer', status: 'Cancelled' },
        { ...base, id: 'rv-hod-review', title: 'RV department submission', status: 'Waiting Approval', completionPercentage: 80 },
        { ...base, id: 'rv-pm-review', title: 'RV PM-approval submission', status: 'Waiting Approval', approvalMode: 'pm', completionPercentage: 80 },
        { ...base, id: 'rv-approved', title: 'RV approved poster', status: 'Approved', completionPercentage: 90 },
      ],
      clientPlans: [], serviceCycles: [], deliverables: [], addons: [], cycleComments: [], servicePricingSnapshots: [], notifications: [], registrations: [],
      backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 },
    });
    stopBackendAutoSync();
  }, { actorId: ACTORS[actor], locale });
};

const main = (page: Page) => page.locator('main');
// Tables keep a hidden mobile card for each row; only the rendered copy counts.
const visibleText = (page: Page, text: string) => main(page).getByText(text, { exact: true }).filter({ visible: true });
const queue = (page: Page, title: string) => page.getByRole('heading', { name: title, exact: true }).locator('../..');
const metric = (page: Page, label: string) => main(page).getByRole('definition').locator('..').filter({ hasText: label }).getByRole('definition');

test.describe('completed tasks leave active lists but stay in history', () => {
  test('Super Admin task list defaults to active work and keeps completed history', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await seed(page, 'boss');
    await page.goto('/tasks');
    await expect(page.getByRole('heading', { name: 'Tasks', exact: true })).toBeVisible();
    const filters = page.getByRole('group', { name: 'Quick task filters' });
    await expect(filters.getByRole('button', { name: 'Active work' })).toHaveAttribute('aria-pressed', 'true');
    await expect(visibleText(page, 'RV open brief')).toBeVisible();
    await expect(visibleText(page, 'RV approved poster')).toBeVisible();
    await expect(visibleText(page, 'RV finished logo')).toHaveCount(0);
    await expect(visibleText(page, 'RV cancelled flyer')).toHaveCount(0);

    await filters.getByRole('button', { name: 'Completed' }).click();
    await expect(page).toHaveURL(/show=completed/);
    await expect(visibleText(page, 'RV finished logo')).toBeVisible();
    await expect(visibleText(page, 'RV open brief')).toHaveCount(0);
    await page.reload();
    await expect(visibleText(page, 'RV finished logo')).toBeVisible();

    await page.getByRole('group', { name: 'Quick task filters' }).getByRole('button', { name: 'All tasks' }).click();
    await expect(visibleText(page, 'RV cancelled flyer')).toBeVisible();
    await expect(visibleText(page, 'RV finished logo')).toBeVisible();

    // A direct link to a completed task still opens it from the default view.
    await page.goto('/tasks?taskId=rv-done');
    await expect(page.getByRole('dialog', { name: 'RV finished logo' })).toBeVisible();
  });

  test('completing work updates dashboard counts and moves the task to history', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await seed(page, 'boss');
    await page.goto('/');
    await expect(metric(page, 'Overdue tasks')).toHaveText('1');
    await page.evaluate(async () => {
      const { useStore } = await import('/src/store/index.ts');
      useStore.setState(state => ({ tasks: state.tasks.map(task => task.id === 'rv-overdue'
        ? { ...task, status: 'Completed', isCompleted: true, completionPercentage: 100, completedAt: new Date().toISOString() }
        : task) }));
    });
    await expect(metric(page, 'Overdue tasks')).toHaveText('0');
    await page.goto('/tasks');
    await expect(visibleText(page, 'RV overdue banner')).toHaveCount(0);
    await page.getByRole('group', { name: 'Quick task filters' }).getByRole('button', { name: 'Completed' }).click();
    await expect(visibleText(page, 'RV overdue banner')).toBeVisible();
    const stored = await page.evaluate(async () => {
      const { useStore } = await import('/src/store/index.ts');
      return useStore.getState().tasks.map(task => task.id).sort();
    });
    expect(stored).toContain('rv-done');
    expect(stored).toContain('rv-cancelled');
  });
});

test.describe('review queues show only decisions the user can take', () => {
  test('PM sees PM-lane reviews as their own and follows HOD-lane reviews separately', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1200 });
    await seed(page, 'pm');
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
    await expect(queue(page, 'Awaiting your review').getByRole('link', { name: 'RV PM-approval submission' })).toBeVisible();
    await expect(queue(page, 'Awaiting your review').getByRole('link', { name: 'RV department submission' })).toHaveCount(0);
    await expect(queue(page, 'With department review').getByRole('link', { name: 'RV department submission' })).toBeVisible();
    await expect(queue(page, 'Ready to finalize').getByRole('link', { name: 'RV approved poster' })).toBeVisible();
    await expect(metric(page, 'Awaiting your review')).toHaveText('1');
    await expect(metric(page, 'Ready to finalize')).toHaveText('1');
    const projects = page.getByRole('heading', { name: 'Your projects' }).locator('../../..');
    await expect(projects.getByText('1/6 tasks complete')).toBeVisible();

    await queue(page, 'Ready to finalize').getByRole('link', { name: 'RV approved poster' }).click();
    await page.getByRole('dialog', { name: 'RV approved poster' }).getByRole('button', { name: 'Confirm completion', exact: true }).click();
    await expect.poll(() => page.evaluate(async () => {
      const { useStore } = await import('/src/store/index.ts');
      return useStore.getState().tasks.find(task => task.id === 'rv-approved')?.status;
    })).toBe('Completed');
    await page.goto('/');
    await expect(queue(page, 'Ready to finalize').getByRole('link', { name: 'RV approved poster' })).toHaveCount(0);
    await expect(metric(page, 'Ready to finalize')).toHaveText('0');
    await expect(page.getByRole('heading', { name: 'Your projects' }).locator('../../..').getByText('2/6 tasks complete')).toBeVisible();

    await page.goto('/tasks');
    await expect(page.getByRole('heading', { name: 'Portfolio work', exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Active work/, selected: true })).toBeVisible();
    await expect(visibleText(page, 'RV approved poster')).toHaveCount(0);
    await page.getByRole('tab', { name: /Done/ }).click();
    await expect(visibleText(page, 'RV approved poster')).toBeVisible();
    await expect(visibleText(page, 'RV finished logo')).toBeVisible();
  });

  test('HOD acts on department reviews only and keeps finished work under Done', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await seed(page, 'hod');
    await page.goto('/tasks?scope=department');
    await expect(page.getByRole('heading', { name: 'Department tasks', exact: true })).toBeVisible();
    await expect(visibleText(page, 'RV finished logo')).toHaveCount(0);
    await page.getByRole('tab', { name: /Needs action/ }).click();
    await expect(visibleText(page, 'RV department submission')).toBeVisible();
    await expect(visibleText(page, 'RV PM-approval submission')).toHaveCount(0);
    await page.getByRole('tab', { name: /^Waiting/ }).click();
    await expect(visibleText(page, 'RV PM-approval submission')).toBeVisible();
    await page.getByRole('tab', { name: /Done/ }).click();
    await expect(visibleText(page, 'RV finished logo')).toBeVisible();
  });

  test('Staff see their active work without management approval controls', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await seed(page, 'staff');
    await page.goto('/tasks');
    await expect(page.getByRole('heading', { name: 'All work', exact: true })).toBeVisible();
    await expect(visibleText(page, 'RV open brief')).toBeVisible();
    await expect(visibleText(page, 'RV finished logo')).toHaveCount(0);
    await expect(main(page).getByRole('button', { name: /^Approve/ })).toHaveCount(0);
    await page.getByRole('tab', { name: /Done/ }).click();
    await expect(visibleText(page, 'RV finished logo')).toBeVisible();
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'My work', level: 1 })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Done/, selected: true })).toHaveCount(0);
  });
});

test('Client pages stay free of internal review and management sections', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await seed(page, 'client');
  await page.goto('/clients');
  await expect(page.getByRole('heading', { name: 'Deliveries', level: 1 })).toBeVisible();
  for (const path of ['/', '/clients']) {
    await page.goto(path);
    for (const internal of ['With department review', 'Waiting on others', 'Requires your action', 'Company at a glance', 'Department tasks']) {
      await expect(page.getByText(internal, { exact: true })).toHaveCount(0);
    }
    await expect(main(page).getByRole('button', { name: /^Approve/ })).toHaveCount(0);
  }
  // Delivery cards name the agency team, never an internal member.
  const internalNames = await page.evaluate(async () => (await import('/src/store/index.ts')).useStore.getState().users
    .filter(user => user.role !== 'Client').map(user => user.name));
  for (const path of ['/', '/tasks', '/clients']) {
    await page.goto(path);
    await expect(main(page).getByRole('heading', { level: 1 })).toBeVisible();
    if (path === '/tasks') await expect(main(page).getByText(/Agency team/).first()).toBeVisible();
    const visibleText = await main(page).innerText();
    expect(internalNames.filter(name => visibleText.includes(name)), path).toEqual([]);
  }

  // Client Settings keeps to the Client's own account, without agency internals.
  await page.goto('/settings');
  await expect(main(page).getByRole('heading', { name: 'Client Access' })).toBeVisible();
  for (const internal of ['Department', 'Application release', 'Performance and save diagnostics', 'registration requests']) {
    await expect(main(page).getByText(internal, { exact: false })).toHaveCount(0);
  }
});

test('every role lands on pages whose headings match their navigation', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const expected: Array<[Actor, string, string]> = [
    ['boss', '/tasks', 'Tasks'],
    ['pm', '/', 'Dashboard'],
    ['pm', '/tasks', 'Portfolio work'],
    ['hod', '/', 'Department work'],
    ['hod', '/tasks', 'Department tasks'],
    ['staff', '/', 'My work'],
    ['staff', '/tasks', 'All work'],
  ];
  for (const [actor, path, heading] of expected) {
    await seed(page, actor);
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
    await expect(page.locator('a[aria-current="page"]').filter({ hasText: heading }).first()).toBeVisible();
  }
});

for (const width of [320, 390, 768, 1024, 1440]) {
  test(`dashboards fit and stay accessible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const actor of ['boss', 'pm', 'hod', 'staff'] as Actor[]) {
      await seed(page, actor);
      await page.goto('/');
      const heading = page.getByRole('heading', { level: 1 }).first();
      await expect(heading).toBeVisible();
      // Header actions must wrap rather than squeeze the page title to zero width.
      expect((await heading.boundingBox())?.width ?? 0).toBeGreaterThan(96);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), { message: `${actor} overflow at ${width}px` }).toBe(true);
      if (width === 390 || width === 1440) {
        const results = await new AxeBuilder({ page }).include('main').analyze();
        expect(results.violations.map(violation => `${actor}:${violation.id}`)).toEqual([]);
      }
    }
  });
}

test('task scope and dashboard labels are translated into Simplified Chinese', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page, 'boss', 'zh');
  await page.goto('/tasks');
  const filters = page.locator('[role="group"]').filter({ hasText: '进行中的工作' });
  await expect(filters.getByRole('button', { name: '进行中的工作' })).toBeVisible();
  await expect(filters.getByRole('button', { name: '全部任务' })).toBeVisible();
  await seed(page, 'pm', 'zh');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '需要您处理' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '部门审核中' })).toBeVisible();
});
