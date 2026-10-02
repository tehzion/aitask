import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('Client 2.0 is approval-first, mobile-safe, and fails closed', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login');
  const seeded = await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const current = useStore.getState();
    const client = current.users.find(user => user.role === 'Client');
    if (!client) throw new Error('Expected a Client demo account');
    const contact = current.users.find(user => user.role === 'Staff') || current.users.find(user => user.role === 'Project Manager')!;
    const reviewTask = {
      id: 'client-v2-review',
      clientName: client.companyName || 'UrbanEats',
      serviceType: 'Design',
      title: 'Approve September campaign',
      description: 'Review the final artwork before publishing.',
      department: 'Designer' as const,
      assignedTo: contact.id,
      createdBy: contact.id,
      startDate: '2026-08-20',
      dueDate: '2026-08-26',
      priority: 'Urgent' as const,
      status: 'Waiting Approval',
      completionPercentage: 100,
      isCompleted: true,
      revisionCount: 0,
      clientApprovalStatus: 'Pending' as const,
      isRecurring: false,
      visibility: 'client-visible' as const,
      comments: [],
      approvalHistory: [],
      updatedAt: '2026-08-26T08:00:00.000Z',
    };
    const approveTask = {
      ...reviewTask,
      id: 'client-v2-approve',
      title: 'Approve launch artwork',
      approvalHistory: [],
    };
    const foreignTask = { ...reviewTask, id: 'client-v2-foreign', clientName: 'Another Company', title: 'Private foreign delivery' };
    const seededClientId = current.clients.find(item => item.clientName.trim().toLowerCase() === client.companyName?.trim().toLowerCase())?.id;
    const now = new Date().toISOString();
    const seededPlan = seededClientId ? {
      id: 'e2e-cvp-plan', clientId: seededClientId, clientName: client.companyName || 'UrbanEats',
      name: 'Growth Plan', origin: 'custom' as const, sourcePackageId: undefined, sourcePackageRevision: undefined,
      revision: Math.max(0, ...current.clientPlans.map(plan => plan.revision)) + 1, status: 'Active' as const, currency: 'MYR' as const,
      serviceItems: [{ id: 'e2e-svc', name: 'Short Video', platforms: ['TikTok'], unit: 'video', quantity: 2, unitPriceMinor: 0 }],
      discountType: 'none' as const, discountValue: 0, taxRateBps: 0,
      startDate: '2026-08-01', billingDay: 15, contractEndDate: '2027-08-14',
      createdBy: contact.id, createdAt: now, updatedAt: now,
    } : null;
    localStorage.setItem(`aitask:release-notice:2026-08-service-operations:${client.id}`, 'acknowledged');
    useStore.setState({
      currentUser: { ...client, mustResetPassword: false },
      tasks: [...current.tasks.filter(task => ![reviewTask.id, approveTask.id, foreignTask.id].includes(task.id)), reviewTask, approveTask, foreignTask],
      clientPlans: seededPlan ? [...current.clientPlans.filter(plan => plan.id !== 'e2e-cvp-plan'), seededPlan] : current.clientPlans,
      backend: { ...current.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 },
    });
    return { clientId: seededClientId };
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  if (seeded.clientId) await expect(page.getByText('Growth Plan', { exact: true })).toBeVisible();
  const primaryAction = page.getByRole('link', { name: 'Review deliverable' }).first();
  await expect(primaryAction).toBeVisible();
  const primaryBox = await primaryAction.boundingBox();
  expect(primaryBox?.y || 9999).toBeLessThan(844);
  const mobileNav = page.getByRole('navigation', { name: 'Mobile navigation' });
  await expect(mobileNav.getByRole('link', { name: 'Home' })).toBeVisible();
  await expect(mobileNav.getByRole('link', { name: 'Deliveries' })).toBeVisible();
  await expect(mobileNav.getByRole('link', { name: /^Notifications(?:, \d+ unread)?$/ })).toBeVisible();
  await expect(mobileNav.getByRole('button', { name: 'Open more destinations' })).toBeVisible();
  const widths = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
  expect(widths.content).toBeLessThanOrEqual(widths.viewport);

  await page.goto('/tasks?taskId=client-v2-review');
  const focus = page.getByRole('dialog', { name: 'Delivery details' });
  await expect(focus).toBeVisible();
  await expect(focus.getByText('Approve September campaign', { exact: true })).toBeVisible();
  await focus.getByRole('button', { name: 'Request changes' }).click();
  await expect(focus.getByRole('alert')).toHaveText(/Tell the team what needs to change/);
  const decisionNote = focus.getByLabel('Decision note');
  await expect(decisionNote).toBeFocused();
  await expect(decisionNote).toHaveAttribute('aria-invalid', 'true');
  await expect(decisionNote).toHaveAttribute('aria-describedby', /.+/);
  await decisionNote.fill('Please use the approved headline and reduce the logo size.');
  await focus.getByRole('button', { name: 'Request changes' }).click();
  await expect(focus.getByRole('button', { name: 'Request changes' })).toHaveCount(0);
  await expect(focus.getByText('Review actions will appear when the delivery is ready.')).toBeVisible();
  await expect(focus.getByText('Decision history')).toBeVisible();
  await expect(focus.getByText('requested changes', { exact: false })).toBeVisible();
  await focus.getByRole('button', { name: 'Close', exact: true }).click();

  await page.goto('/tasks?taskId=client-v2-approve');
  const approvalFocus = page.getByRole('dialog', { name: 'Delivery details' });
  await expect(approvalFocus.getByText('Approve launch artwork', { exact: true })).toBeVisible();
  await approvalFocus.getByLabel('Decision note').fill('Recover my approval note.');
  page.once('dialog', dialog => dialog.dismiss());
  await page.keyboard.press('Escape');
  await expect(approvalFocus).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Restore recovered draft' })).toBeVisible();
  await page.getByRole('button', { name: 'Restore recovered draft' }).click();
  await expect(approvalFocus.getByLabel('Decision note')).toHaveValue('Recover my approval note.');
  await approvalFocus.getByLabel('Decision note').fill('Approved for launch.');
  await approvalFocus.getByRole('button', { name: 'Approve delivery' }).click();
  await expect(approvalFocus.getByText('This delivery is approved.')).toBeVisible();
  await expect(approvalFocus.getByText('approved the delivery', { exact: false })).toBeVisible();
  await expect(approvalFocus.getByText('Approved for launch.')).toBeVisible();
  await page.reload();
  const persistedApproval = page.getByRole('dialog', { name: 'Delivery details' });
  await expect(persistedApproval.getByText('This delivery is approved.')).toBeVisible();
  await expect(persistedApproval.getByText('approved the delivery', { exact: false })).toHaveCount(1);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const originalCommit = useStore.getState().commitPendingMutation;
    useStore.setState({ commitPendingMutation: async (...args) => {
      await new Promise(resolve => setTimeout(resolve, 800));
      const result = await originalCommit(...args);
      useStore.setState({ commitPendingMutation: originalCommit });
      return result;
    } });
  });
  await persistedApproval.getByLabel('Share feedback', { exact: true }).fill('First feedback to save.');
  await persistedApproval.getByRole('button', { name: 'Send feedback' }).click();
  await persistedApproval.getByLabel('Share feedback', { exact: true }).fill('Keep this newer feedback draft.');
  await expect(persistedApproval.getByRole('button', { name: 'Send feedback' })).toBeEnabled();
  await expect(persistedApproval.getByLabel('Share feedback', { exact: true })).toHaveValue('Keep this newer feedback draft.');
  await expect(persistedApproval.getByText('First feedback to save.', { exact: true })).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await persistedApproval.getByRole('button', { name: 'Close', exact: true }).click();

  await page.goto('/clients?period=all&taskId=client-v2-approve');
  const trackerFocus = page.getByRole('dialog', { name: 'Delivery details' });
  await expect(trackerFocus.getByText('This delivery is approved.')).toBeVisible();
  await expect(trackerFocus.getByText('Approved for launch.')).toBeVisible();
  await trackerFocus.getByRole('button', { name: 'Close', exact: true }).click();

  await page.goto('/tasks?taskId=client-v2-foreign');
  await expect(page.getByText('This delivery is not available for your company.')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Delivery details' })).toHaveCount(0);
  await page.getByRole('button', { name: /Open delivery filters/ }).click();
  const filters = page.getByRole('dialog', { name: 'Filter deliveries' });
  await expect(filters.getByText('All delivery stages')).toBeVisible();
  await expect(filters.getByLabel('Service')).toHaveValue('All');
  await page.keyboard.press('Escape');

  if (seeded.clientId) {
    await page.goto(`/clients/${seeded.clientId}`);
    await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Deliveries' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Files & updates' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Services' })).toBeVisible();
    await expect(page.getByText(/linked task/i)).toHaveCount(0);
    await expect(page.getByText(/Internal monthly total/i)).toHaveCount(0);
    await page.getByRole('tab', { name: 'Services' }).click();
    await expect(page.getByText('Short Video', { exact: true }).first()).toBeVisible();
    await expect(page.locator('main article').first().getByText(/video/)).toBeVisible();
    await expect(page.getByText(/Billing day/)).toBeVisible();
    await expect(page.getByText(/Day \d+/).first()).toBeVisible();
  }

  await page.getByRole('button', { name: '切换为中文' }).click();
  await expect(page.getByRole('link', { name: '全部交付内容' })).toBeVisible();
  if (seeded.clientId) {
    await page.getByRole('tab', { name: '概览' }).click();
    await expect(page.getByText('需要您审阅', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Needs your review', { exact: true })).toHaveCount(0);
  }
  const axe = await new AxeBuilder({ page }).include('main').analyze();
  expect(axe.violations, axe.violations.map(item => `${item.id} (${item.nodes.length})`).join(', ')).toEqual([]);
});

test('Client tracker statistics reconcile approvals, cancellations and filtered totals', async ({ page }) => {
  await page.goto('/login');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const state = useStore.getState();
    const client = state.users.find(user => user.role === 'Client')!;
    const base = state.tasks[0];
    const company = client.companyName!;
    const makeTask = (id: string, extra = {}) => ({ ...base, id, title: id,
      clientName: company, visibility: 'client-visible' as const, dueDate: '',
      status: 'Pending', isCompleted: false, clientApprovalStatus: 'Pending' as const,
      comments: [], approvalHistory: [], ...extra });
    localStorage.setItem(`aitask:release-notice:2026-08-service-operations:${client.id}`, 'acknowledged');
    useStore.setState({ currentUser: { ...client, mustResetPassword: false },
      tasks: [
        makeTask('Stats awaiting review', { status: 'Completed', isCompleted: true }),
        makeTask('Stats approved', { status: 'Completed', isCompleted: true, clientApprovalStatus: 'Approved' }),
        makeTask('Stats cancelled', { status: 'Cancelled', isCompleted: true }),
        makeTask('Stats private', { visibility: 'internal' }),
        makeTask('Stats foreign', { clientName: 'Foreign company' }),
      ],
      deliverables: [], serviceCycles: [],
      backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 },
    });
  });
  await page.goto('/clients?period=all');
  const summary = page.getByLabel('Delivery tracker summary');
  await expect(summary.locator('strong')).toHaveText(['1', '0', '1', '0']);
  await expect(page.getByRole('progressbar', { name: 'Client completion' })).toHaveAttribute('aria-valuenow', '50');
  await page.getByRole('button', { name: 'View work', exact: true }).click();
  await expect(page.getByText('Needs your review', { exact: true })).toBeVisible();
  await expect(page.getByText('Stats private', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Stats foreign', { exact: true })).toHaveCount(0);
  await page.getByRole('searchbox', { name: 'Search delivery tracker' }).fill('Stats approved');
  await expect(page.getByText('Stats awaiting review', { exact: true })).toHaveCount(0);
  await expect(summary.locator('strong')).toHaveText(['0', '0', '1', '0']);
  await expect(page.getByRole('progressbar', { name: 'Client completion' })).toHaveAttribute('aria-valuenow', '100');
  await page.getByRole('searchbox', { name: 'Search delivery tracker' }).fill('no such work');
  await expect(summary.locator('strong')).toHaveText(['0', '0', '0', '0']);
});

test('Client Home counts the entire review queue and Reports separate completion from approval', async ({ page }) => {
  await page.goto('/login');
  const timingDates = await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const { getWorkWeekRange } = await import('/src/lib/workWeek.ts');
    const state = useStore.getState();
    const client = state.users.find(user => user.role === 'Client')!;
    const base = state.tasks[0];
    const start = getWorkWeekRange(new Date()).start;
    const due = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
    const completion = new Date(start); completion.setHours(9);
    const approval = new Date(start); approval.setDate(start.getDate() + 1); approval.setHours(10);
    localStorage.setItem(`aitask:release-notice:2026-08-service-operations:${client.id}`, 'acknowledged');
    const tasks = Array.from({ length: 6 }, (_, index) => ({ ...base,
      id: `Review queue ${index}`, title: `Review queue ${index}`, clientName: client.companyName!,
      visibility: 'client-visible' as const, status: 'Completed', isCompleted: true,
      clientApprovalStatus: 'Pending' as const, dueDate: due, completedAt: completion.toISOString(),
      comments: [], approvalHistory: [],
    }));
    useStore.setState({ currentUser: { ...client, mustResetPassword: false },
      tasks: [...tasks, { ...tasks[0], id: 'Timing approved', title: 'Timing approved', clientApprovalStatus: 'Approved',
        approvalHistory: [{ id: 'approval', userId: client.id, status: 'Approved', createdAt: approval.toISOString() }] }],
      backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 },
    });
    return { completion: completion.toISOString(), approval: approval.toISOString() };
  });
  await page.goto('/');
  await expect(page.getByText('6 deliveries need your review', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'View all 6 review requests' }).click();
  await expect(page.locator('main article')).toHaveCount(6);
  await page.goto('/reports');
  await expect(page.getByRole('heading', { name: 'Agency completion and your approval' })).toBeVisible();
  const timing = page.getByRole('region', { name: 'Agency completion and your approval' });
  const approved = timing.getByRole('row').filter({ hasText: 'Timing approved' });
  await expect(approved.locator('td').nth(0)).not.toHaveText('No recorded date');
  await expect(approved.locator('td').nth(1)).not.toHaveText('No recorded date');
  expect(await approved.locator('td').nth(0).textContent()).not.toBe(await approved.locator('td').nth(1).textContent());
  await expect(timing.getByRole('row').filter({ hasText: 'Review queue 0' }).getByText('Not yet approved', { exact: true })).toBeVisible();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const download = await downloaded;
  const csv = await readFile((await download.path())!, 'utf8');
  expect(csv).toContain('Agency completion date');
  expect(csv).toContain('Client approval date');
  expect(csv).toContain(timingDates.completion);
  expect(csv).toContain(timingDates.approval);
  const csvHeader = csv.split(/\r?\n/u)[0];
  expect(csvHeader).not.toContain('Assignee');
  expect(csvHeader).not.toContain('Department');
  await page.getByRole('button', { name: '切换为中文' }).click();
  await expect(page.getByRole('heading', { name: '团队完成时间与您的批准时间' })).toBeVisible();
});
