import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const seed = async (page: Page, locale: 'en' | 'zh' = 'en') => {
  await page.goto('/login');
  await page.waitForFunction(() => Boolean(document.querySelector('form input, main')));
  await page.evaluate(async lang => {
    localStorage.setItem('aitask:locale', lang);
    const { useStore } = await import('/src/store/index.ts');
    const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
    const state = useStore.getState();
    const pm = state.users.find(item => item.role === 'Project Manager' && !item.isSuperAdmin)!;
    const staff = state.users.find(user => user.role === 'Staff' && (user.departments || []).includes('Designer'))!;
    enablePasswordResetBypass(pm.id);
    localStorage.setItem(`aitask:release-notice:2026-11-start-wording:${pm.id}`, 'acknowledged');
    const iso = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString();
    const ymd = (offset: number) => iso(offset).slice(0, 10);
    const base = { ...state.tasks[0], clientId: undefined, clientName: 'Audit Co', projectId: 'audit-project', projectName: 'Audit project', department: 'Designer',
      createdBy: pm.id, assignedBy: pm.id, assignedTo: staff.id, comments: [], approvalHistory: [], workHistory: [], workState: {}, deliverableId: undefined,
      serviceCycleId: undefined, generatedFromDeliverable: false, workflowStepId: undefined, startDate: '2026-01-01', visibility: 'client-visible', clientApprovalStatus: 'Approved' };
    useStore.setState({
      currentUser: { ...pm, mustResetPassword: false },
      projects: [{ id: 'audit-project', clientName: 'Audit Co', projectName: 'Audit project', createdBy: pm.id, projectManagerIds: [pm.id], includedRevisions: 2, services: ['Design'], startDate: '2026-01-01', deadline: '' }],
      tasks: [
        { ...base, id: 'a-done', title: 'Accepted banner', status: 'Completed', isCompleted: true, dueDate: ymd(-3), completedAt: iso(-4), revisionCount: 3,
          clientRating: { stars: 4, comment: 'Happy', ratedBy: pm.id, ratedAt: iso(-3) }, brief: { references: ['https://example.com/moodboard'], mustHave: 'Logo top left', avoid: 'Stock photos', updatedBy: pm.id, updatedAt: iso(-8) } },
        { ...base, id: 'a-open', title: 'Banner in revision', status: 'In Progress', isCompleted: false, dueDate: ymd(5), revisionCount: 1, clientApprovalStatus: 'Pending' },
        { ...base, id: 'a-quiet', title: 'Waiting on client', status: 'Completed', isCompleted: true, dueDate: ymd(-9), completedAt: iso(-6), clientApprovalStatus: 'Pending' },
      ],
      backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 },
    });
  }, locale);
};

const noViolations = async (page: Page, selector: string, context: string) => {
  const results = await new AxeBuilder({ page }).include(selector).analyze();
  expect(results.violations, `${context}: ${results.violations.map(item => `${item.id} (${item.nodes.map(node => node.target.join(' ')).join(' | ')})`).join(', ')}`).toEqual([]);
};

for (const theme of ['light', 'dark'] as const) {
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    test(`new delivery surfaces are accessible and readable: ${theme}, ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: theme });
      await seed(page);
      await page.evaluate(theme2 => localStorage.setItem('aitask-color-theme', theme2), theme);

      await page.goto('/reports');
      const quality = page.getByRole('region', { name: 'Delivery quality' });
      await expect(quality).toBeVisible();
      await noViolations(page, '#main-content', 'Reports with delivery quality');
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

      await page.goto('/tasks?taskId=a-done');
      await expect(page.getByRole('region', { name: 'Client brief' })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Client satisfaction' })).toBeVisible();
      await noViolations(page, '[role="dialog"]', 'Task drawer with brief and rating');
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

      await page.goto('/tasks');
      await expect(page.getByRole('heading', { name: 'Client has not responded' })).toBeVisible();
      await noViolations(page, '#main-content', 'Portfolio with the new queues');
    });
  }
}

test('new surfaces are fully translated in Chinese', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await seed(page, 'zh');
  await page.goto('/reports');
  const quality = page.getByRole('region', { name: '交付质量' });
  await expect(quality).toBeVisible();
  await expect(quality).toContainText('最近 90 天');
  await expect(quality).toContainText('需要修订');
  await expect(quality).not.toContainText(/\{[a-z]+\}|Delivery quality|Finished|On time/);

  await page.goto('/tasks?taskId=a-done');
  const drawer = page.getByRole('dialog');
  await expect(drawer).toContainText('修订 3/2');
  await expect(drawer.getByRole('region', { name: '客户需求简报' })).toBeVisible();
  await expect(drawer.getByRole('region', { name: '客户满意度' })).toBeVisible();
  await expect(drawer).not.toContainText(/\{[a-z]+\}|Revision \d|Client brief|Client satisfaction/);
});
