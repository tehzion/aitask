import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const tabTo = async (page: Page, target: import('@playwright/test').Locator, key = 'Tab') => {
  for (let step = 0; step < 160; step += 1) {
    if (await target.evaluate(element => element === document.activeElement)) return;
    await page.keyboard.press(key);
  }
  throw new Error('Could not reach target by keyboard');
};

const seedPanels = async (page: Page, theme: 'light' | 'dark') => {
  await page.goto('/login');
  await page.waitForFunction(() => Boolean(document.querySelector('form input, main')));
  await page.evaluate(async selectedTheme => {
    const { useStore } = await import('/src/store/index.ts');
    const state = useStore.getState();
    const boss = state.users.find(user => user.isSuperAdmin)!;
    const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
    enablePasswordResetBypass(boss.id);
    localStorage.setItem('aitask-color-theme', selectedTheme);
    localStorage.setItem(`aitask:release-notice:2026-08-service-operations:${boss.id}`, 'acknowledged');
    useStore.setState({ currentUser: { ...boss, mustResetPassword: false }, backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 } });
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const created = useStore.getState().createClientWithPlan({ clientName: 'Mobile QA', planName: 'Mobile Plan', origin: 'custom', serviceItems: [{ id: 'mobile-service', name: 'Design', platforms: [], unit: 'item', quantity: 1, unitPriceMinor: 0 }], startDate: currentMonth, billingDay: 1, discountType: 'none', discountValue: 0, taxRateBps: 0 });
    if (!created.ok) throw new Error(created.error);
    const plan = useStore.getState().clientPlans.find(item => item.clientId === created.clientId)!;
    const activation = useStore.getState().activateClientPlan(plan.id);
    if (!activation.ok) throw new Error(activation.error);
    const next = useStore.getState();
    const cycle = next.serviceCycles.find(item => item.id === activation.cycleId)!;
    const hod = { id: 'mobile-hod', name: 'Mobile Shooting HOD', role: 'HOD' as const, departments: ['Video Shooting' as const] };
    useStore.setState({
      users: [...next.users.filter(user => !(user.role === 'Staff' && user.departments.includes('Video Shooting'))), hod],
      serviceCycles: [...next.serviceCycles, { ...cycle, id: 'mobile-old-cycle', status: 'Draft' as const, periodStart: '2020-01-01', periodEnd: '2020-01-31', publishedAt: undefined }],
      projects: [...next.projects, { id: 'mobile-gap-project', clientId: created.clientId, clientName: 'Mobile QA', projectName: 'Mobile shoot', services: [], startDate: '2020-01-01', deadline: '', projectManagerIds: [boss.id], hodMemberIds: [hod.id], staffMemberIds: [], createdBy: boss.id, status: 'Active', milestones: [] }],
    } as never);
  }, theme);
  await page.goto('/');
  const overview = page.getByRole('tab', { name: 'Overview', exact: true });
  await tabTo(page, overview);
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Portfolio', exact: true })).toBeFocused();
};

for (const theme of ['light', 'dark'] as const) {
  test(`months and staffing panels work at 375px with keyboard in ${theme} mode`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await seedPanels(page, theme);
    if (theme === 'dark') await expect(page.locator('html')).toHaveClass(/dark/);
    const months = page.locator('section', { has: page.getByRole('heading', { name: 'Months to tidy up', exact: true }) }).last();
    const staffing = page.locator('section', { has: page.getByRole('heading', { name: 'Staffing gaps', exact: true }) }).last();
    await expect(months).toBeVisible();
    await expect(staffing).toBeVisible();
    const checkbox = months.getByRole('checkbox', { name: /Select: Mobile QA/ }).first();
    await tabTo(page, checkbox);
    await page.keyboard.press('Space');
    await expect(checkbox).toBeChecked();
    await expect(months.getByRole('button', { name: /Cancel month \(1\)/ })).toBeEnabled();
    const teamLink = staffing.getByRole('link', { name: 'Manage team' });
    for (const panel of [months, staffing]) {
      const box = await panel.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(375);
      await panel.evaluate(element => element.setAttribute('data-mobile-audit', 'true'));
      const results = await new AxeBuilder({ page }).include('[data-mobile-audit="true"]').analyze();
      expect(results.violations.map(violation => violation.id)).toEqual([]);
      await panel.evaluate(element => element.removeAttribute('data-mobile-audit'));
    }
    await tabTo(page, teamLink);
    await expect(teamLink).toBeFocused();
  });
}
