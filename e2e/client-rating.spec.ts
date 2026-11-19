import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const seed = async (page: Page) => {
  await page.goto('/login');
  // Let the app finish its startup load so seeded state is not overwritten.
  await page.waitForFunction(() => Boolean(document.querySelector('form input, main')));
  await page.evaluate(async () => {
    const { useStore, stopBackendAutoSync } = await import('/src/store/index.ts');
    const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
    stopBackendAutoSync();
    const client = { id: 'rate-client', name: 'Customer', role: 'Client', companyName: 'Rate Co', department: 'Client', departments: ['Client'], mustResetPassword: false };
    const staff = { id: 'rate-staff', name: 'Contact', role: 'Staff', department: 'Designer', departments: ['Designer'] };
    enablePasswordResetBypass(client.id);
    localStorage.setItem(`aitask:release-notice:2026-11-start-wording:${client.id}`, 'acknowledged');
    const project = { id: 'rate-project', clientName: 'Rate Co', projectName: 'Brand refresh', createdBy: staff.id, projectManagerIds: [staff.id], includedRevisions: 3, services: ['Design'], startDate: '2026-01-01', deadline: '' };
    const task = {
      id: 'rate-task', clientName: 'Rate Co', clientId: 'rate-company', projectId: 'rate-project', title: 'Logo delivery', serviceType: 'Design',
      description: 'Final logo', department: 'Designer', assignedTo: staff.id, createdBy: staff.id, startDate: '2026-10-01', dueDate: '2026-10-08',
      priority: 'Medium', status: 'Approved', isCompleted: false, completionPercentage: 80, clientApprovalStatus: 'Pending', revisionCount: 1,
      isRecurring: false, visibility: 'client-visible', comments: [], approvalHistory: [],
    };
    useStore.setState({ currentUser: client, users: [client, staff], projects: [project], tasks: [task] });
  });
};

test('Customer sees revisions used and rates the delivery when approving', async ({ page }) => {
  await seed(page);
  await page.goto('/tasks?taskId=rate-task');
  const dialog = page.getByRole('dialog', { name: 'Delivery details' });
  await expect(dialog.getByTestId('client-revision-usage')).toHaveText('Revision 1 of 3');

  const axe = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
  expect(axe.violations.map(item => item.id)).toEqual([]);

  const group = dialog.getByRole('radiogroup', { name: 'Client satisfaction' });
  await group.getByRole('radio', { name: '4 stars' }).click();
  await expect(group.getByRole('radio', { name: '4 stars' })).toHaveAttribute('aria-checked', 'true');
  await dialog.getByRole('textbox', { name: 'Comment' }).fill('Clean and on time');
  await dialog.getByRole('button', { name: 'Approve delivery' }).click();

  await expect.poll(() => page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    return useStore.getState().tasks.find(task => task.id === 'rate-task')?.clientRating;
  })).toMatchObject({ stars: 4, comment: 'Clean and on time', ratedBy: 'rate-client' });
});

test('A change request never carries a rating', async ({ page }) => {
  await seed(page);
  await page.goto('/tasks?taskId=rate-task');
  const dialog = page.getByRole('dialog', { name: 'Delivery details' });
  await dialog.getByRole('radio', { name: '5 stars' }).click();
  await dialog.getByRole('textbox', { name: 'Share feedback' }).waitFor();
  await dialog.getByRole('textbox').first().fill('Please change the colour');
  await dialog.getByRole('button', { name: 'Request changes' }).click();
  await expect.poll(() => page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const task = useStore.getState().tasks.find(item => item.id === 'rate-task');
    return { rating: task?.clientRating ?? null, revisions: task?.revisionCount };
  })).toEqual({ rating: null, revisions: 2 });
});

test('Chinese client sees the rating prompt translated', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => localStorage.setItem('aitask:locale', 'zh'));
  await page.goto('/tasks?taskId=rate-task');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('您对本次交付满意吗？（可选，通过验收时填写）')).toBeVisible();
  await expect(dialog.getByTestId('client-revision-usage')).toHaveText('修订 1/3');
});
