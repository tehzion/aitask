import { expect, test } from '@playwright/test';

test('a PM is nudged about a delivery the client has not answered for days', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/login');
  await page.waitForFunction(() => Boolean(document.querySelector('form input, main')));
  await page.evaluate(async () => {
    localStorage.setItem('aitask:locale', 'en');
    const { useStore } = await import('/src/store/index.ts');
    const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
    const state = useStore.getState();
    const pm = state.users.find(item => item.role === 'Project Manager' && !item.isSuperAdmin)!;
    enablePasswordResetBypass(pm.id);
    localStorage.setItem(`aitask:release-notice:2026-11-start-wording:${pm.id}`, 'acknowledged');
    const longAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString();
    const base = { ...state.tasks[0], clientId: undefined, clientName: 'Quiet Co', projectId: 'quiet-project', projectName: 'Quiet project', department: 'Designer',
      createdBy: pm.id, assignedBy: pm.id, assignedTo: pm.id, comments: [], approvalHistory: [], workHistory: [], workState: {}, deliverableId: undefined,
      serviceCycleId: undefined, generatedFromDeliverable: false, workflowStepId: undefined, startDate: '2026-01-01', dueDate: '2099-01-01', visibility: 'client-visible' };
    useStore.setState({
      currentUser: { ...pm, mustResetPassword: false },
      projects: [{ id: 'quiet-project', clientName: 'Quiet Co', projectName: 'Quiet project', createdBy: pm.id, projectManagerIds: [pm.id], services: ['Design'], startDate: '2026-01-01', deadline: '' }],
      tasks: [
        { ...base, id: 'quiet-old', title: 'Waiting a week', status: 'Completed', isCompleted: true, completedAt: longAgo, clientApprovalStatus: 'Pending' },
        { ...base, id: 'quiet-fresh', title: 'Handed over just now', status: 'Completed', isCompleted: true, completedAt: new Date().toISOString(), clientApprovalStatus: 'Pending' },
      ],
      backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 },
    });
  });
  await page.goto('/tasks');
  const day = page.getByRole('region', { name: 'My day' });
  const queue = day.getByRole('heading', { name: 'Client has not responded' }).locator('xpath=ancestor::section[1]');
  await expect(day.getByRole('heading', { name: 'Client has not responded' })).toBeVisible();
  await expect(queue).toContainText('Waiting a week');
  await expect(queue).not.toContainText('Handed over just now');
});
