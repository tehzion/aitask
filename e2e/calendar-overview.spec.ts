import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const dismissOverlays = async (page: Page) => {
  const continueButton = page.getByRole('button', { name: 'Continue for now' });
  if (await continueButton.isVisible().catch(() => false)) await continueButton.click().catch(() => undefined);
  const releaseClose = page.getByRole('button', { name: 'Continue to AiTask' });
  await releaseClose.waitFor({ state: 'visible', timeout: 15_000 }).then(() => releaseClose.click()).catch(() => undefined);
  if (await releaseClose.isVisible().catch(() => false)) {
    await releaseClose.click().catch(() => undefined);
    await expect(releaseClose).toBeHidden({ timeout: 5_000 }).catch(() => undefined);
  }
};

const signInAs = async (page: Page, username: string) => {
  await page.goto('/login');
  const demoAccount = page.getByRole('button', { name: `Use ${username}` });
  if (await demoAccount.count()) {
    await demoAccount.click();
  } else {
    await page.getByLabel('Email or username').fill(username);
  }
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Access Dashboard' }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/login'));
  if (/\/settings$/.test(page.url())) {
    const continueButton = page.getByRole('button', { name: 'Continue for now' });
    await expect(continueButton).toBeVisible();
    await continueButton.click();
  }
  await dismissOverlays(page);
};

const expectNoHorizontalOverflow = async (page: Page, context: string) => {
  await expect.poll(
    () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    { message: `${context} should not overflow horizontally` },
  ).toBe(true);
};

test.describe('Calendar overview and navigation', () => {
  test('client calendar shows client-facing labels for internal review states', async ({ page }) => {
    await signInAs(page, 'UrbanEats Client Demo');
    await page.evaluate(async () => {
      const { useStore } = await import('/src/app/store/workspaceStore.ts');
      const state = useStore.getState();
      const source = state.tasks[0];
      if (!source || state.currentUser?.role !== 'Client') throw new Error('Client calendar fixture is unavailable.');
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const task = {
        ...source,
        id: 'calendar-client-review-label',
        title: 'Internal review status probe',
        clientId: undefined,
        clientName: state.currentUser.companyName || source.clientName,
        visibility: 'client-visible' as const,
        startDate: today,
        dueDate: today,
        assignedTo: '',
        status: 'Waiting Approval',
        isCompleted: false,
        completedAt: undefined,
        clientApprovalStatus: 'Pending' as const,
      };
      useStore.setState({ tasks: [task, ...state.tasks] });
    });
    await page.goto('/calendar');
    await expect(page.getByRole('heading', { name: 'Delivery Schedule', level: 1 })).toBeVisible();
    await expect(page.getByText('Internal review status probe', { exact: true })).toBeVisible();
    const taskCard = page.getByRole('article').filter({ has: page.getByRole('link', { name: 'Internal review status probe', exact: true }) });
    await expect(taskCard.getByText('In progress', { exact: true })).toBeVisible();
    await expect(taskCard.getByText('Waiting Approval', { exact: true })).toHaveCount(0);
  });

  test('keeps role-scoped calendar scanning usable across desktop and mobile', async ({ page }) => {
    test.setTimeout(180_000);

    for (const role of [
      { username: 'Boss Koo', heading: 'Team Calendar' },
      { username: 'Staff Demo', heading: 'Team Calendar' },
      { username: 'UrbanEats Client Demo', heading: 'Delivery Schedule' },
    ]) {
      await signInAs(page, role.username);

      for (const viewport of [
        { width: 1280, height: 800 },
        { width: 390, height: 844 },
        { width: 320, height: 700 },
        { width: 414, height: 896 },
      ]) {
        await page.setViewportSize(viewport);
        await page.goto('/calendar');
        await expect(page.getByRole('heading', { name: role.heading, level: 1 })).toBeVisible();
        await expect(page.locator('[data-calendar-filter]')).toHaveCount(6);
        await expect(page.locator('[data-calendar-filter="all"]')).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('main span[role="button"]')).toHaveCount(0);
        await expectNoHorizontalOverflow(page, `${role.username} ${viewport.width}px Calendar`);

        const dateButton = page.locator('main button[aria-label^="Select date"]').first();
        await dateButton.focus();
        await page.keyboard.press('ArrowRight');
        await expect(page.locator('main button[aria-current="date"]')).toBeFocused();

        await page.locator('[data-calendar-filter="overdue"]').click();
        await expect(page.locator('[data-calendar-filter="overdue"]')).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('[data-calendar-filter="all"]')).toHaveAttribute('aria-pressed', 'false');
        await page.locator('[data-calendar-filter="all"]').click();
        await expect(page.locator('[data-calendar-filter="all"]')).toHaveAttribute('aria-pressed', 'true');

        if (viewport.width < 768) {
          const selectedDayBox = await page.locator('#calendar-selected-day-title').boundingBox();
          const calendarGridBox = await page.locator('#calendar-grid-title').boundingBox();
          expect(selectedDayBox?.y ?? Infinity).toBeLessThan(calendarGridBox?.y ?? -Infinity);
        }

        const axeResults = await new AxeBuilder({ page }).include('main').analyze();
        expect(axeResults.violations, `${role.username} ${viewport.width}px Calendar: ${axeResults.violations.map(item => item.id).join(', ')}`).toEqual([]);
      }

      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto('/calendar');
      await page.getByRole('button', { name: 'Logout' }).click();
    }
  });

  test('localizes Calendar controls and keeps the dark reduced-motion surface accessible', async ({ page }) => {
    test.setTimeout(90_000);
    await signInAs(page, 'Staff Demo');
    await page.evaluate(() => {
      localStorage.setItem('aitask:locale', 'zh');
      localStorage.setItem('aitask-color-theme', 'dark');
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page.goto('/calendar');

    await expect(page.getByRole('heading', { name: '团队日历', level: 1 })).toBeVisible();
    await expect(page.locator('[data-calendar-filter="all"]')).toHaveAttribute('aria-label', /总体:/);
    await expect(page.getByRole('button', { name: '今天' })).toBeVisible();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expectNoHorizontalOverflow(page, 'Chinese dark reduced-motion Calendar');

    const axeResults = await new AxeBuilder({ page }).include('main').analyze();
    expect(axeResults.violations, `Chinese dark Calendar: ${axeResults.violations.map(item => item.id).join(', ')}`).toEqual([]);
  });
});
