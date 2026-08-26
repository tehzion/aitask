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
    const contact = current.users.find(user => user.role === 'Staff') || current.users.find(user => user.role === 'Admin')!;
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
    const foreignTask = { ...reviewTask, id: 'client-v2-foreign', clientName: 'Another Company', title: 'Private foreign delivery' };
    localStorage.setItem(`aitask:release-notice:2026-08-service-operations:${client.id}`, 'acknowledged');
    useStore.setState({
      currentUser: { ...client, mustResetPassword: false },
      tasks: [...current.tasks.filter(task => ![reviewTask.id, foreignTask.id].includes(task.id)), reviewTask, foreignTask],
      backend: { ...current.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 },
    });
    return { clientId: current.clients.find(item => item.clientName.trim().toLowerCase() === client.companyName?.trim().toLowerCase())?.id };
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  const primaryAction = page.getByRole('link', { name: 'Review deliverable' }).first();
  await expect(primaryAction).toBeVisible();
  const primaryBox = await primaryAction.boundingBox();
  expect(primaryBox?.y || 9999).toBeLessThan(844);
  const mobileNav = page.getByRole('navigation', { name: 'Mobile navigation' });
  await expect(mobileNav.getByRole('link', { name: 'Home' })).toBeVisible();
  await expect(mobileNav.getByRole('link', { name: 'Deliveries' })).toBeVisible();
  await expect(mobileNav.getByRole('link', { name: 'Inbox' })).toBeVisible();
  await expect(mobileNav.getByRole('button', { name: 'Open more client destinations' })).toBeVisible();
  const widths = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
  expect(widths.content).toBeLessThanOrEqual(widths.viewport);

  await page.goto('/tasks?taskId=client-v2-review');
  const focus = page.getByRole('dialog', { name: 'Delivery details' });
  await expect(focus).toBeVisible();
  await expect(focus.getByText('Approve September campaign', { exact: true })).toBeVisible();
  await focus.getByRole('button', { name: 'Request changes' }).click();
  await expect(focus.getByRole('alert')).toHaveText(/Tell the team what needs to change/);
  await focus.getByLabel('Decision note').fill('Please use the approved headline and reduce the logo size.');
  await focus.getByRole('button', { name: 'Request changes' }).click();
  await expect(focus.getByRole('button', { name: 'Request changes' })).toHaveCount(0);
  await expect(focus.getByText('Review actions will appear when the delivery is ready.')).toBeVisible();
  await focus.getByRole('button', { name: 'Close', exact: true }).click();

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
  }

  await page.getByRole('button', { name: '切换为中文' }).click();
  await expect(page.getByRole('link', { name: '全部交付内容' })).toBeVisible();
  const axe = await new AxeBuilder({ page }).include('main').analyze();
  expect(axe.violations, axe.violations.map(item => `${item.id} (${item.nodes.length})`).join(', ')).toEqual([]);
});
