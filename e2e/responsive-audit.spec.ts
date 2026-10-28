import { waitForWorkspaceBoot } from './fixtures/workspaceBoot';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

type AuditRole = {
  id: 'boss' | 'project-manager' | 'hod' | 'staff' | 'client';
  username: string;
  routes: string[];
};

const auditRoles: AuditRole[] = [
  {
    id: 'boss',
    username: 'Boss Koo',
    routes: ['/', '/tasks', '/calendar', '/clients', '/clients/demo-service-client-urban', '/projects', '/reports', '/approvals', '/notifications', '/settings', '/feedback'],
  },
  {
    id: 'project-manager',
    username: 'Project Manager Demo',
    routes: ['/', '/tasks', '/calendar', '/clients', '/projects', '/reports', '/approvals', '/notifications', '/settings', '/feedback'],
  },
  {
    id: 'hod',
    username: 'HOD Demo',
    routes: ['/', '/tasks', '/calendar', '/clients', '/projects', '/reports', '/notifications', '/settings'],
  },
  {
    id: 'staff',
    username: 'Staff Demo',
    routes: ['/', '/tasks', '/calendar', '/clients', '/projects', '/reports', '/notifications', '/settings'],
  },
  {
    id: 'client',
    username: 'UrbanEats Client Demo',
    routes: ['/', '/tasks', '/calendar', '/clients', '/clients/demo-service-client-urban', '/projects', '/reports', '/approvals', '/notifications', '/settings'],
  },
];

const auditViewports = [
  { name: '320', width: 320, height: 700 },
  { name: '390', width: 390, height: 844 },
  { name: '768', width: 768, height: 1024 },
  { name: '1024', width: 1024, height: 768 },
  { name: '1440', width: 1440, height: 900 },
] as const;

const expectNoHorizontalOverflow = async (page: Page, context: string) => {
  await expect.poll(
    () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    { message: `${context} should not overflow horizontally` },
  ).toBe(true);
};

const dismissTransientOverlays = async (page: Page) => {
  const continueButton = page.getByRole('button', { name: 'Continue for now' });
  await continueButton.waitFor({ state: 'visible', timeout: 1_500 }).then(() => continueButton.click()).catch(() => undefined);
  const releaseClose = page.getByRole('button', { name: 'Continue to AiTask' });
  await releaseClose.waitFor({ state: 'visible', timeout: 1_500 }).then(() => releaseClose.click()).catch(() => undefined);
};

const signInAs = async (page: Page, username: string) => {
  if (page.url() === 'about:blank') await page.goto('/login');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/login');
  await waitForWorkspaceBoot(page);
  const demoAccount = page.getByRole('button', { name: `Use ${username}` });
  if (await demoAccount.count()) {
    await demoAccount.click();
  } else {
    await page.getByLabel('Email or username').fill(username);
  }
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Access Dashboard' }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/login'));
  await dismissTransientOverlays(page);
};

const assertMobileNavigation = async (page: Page, context: string) => {
  const navigation = page.getByRole('navigation', { name: 'Mobile navigation' });
  if (await navigation.count() === 0) return;
  await expect(navigation).toBeVisible();
  const destinations = navigation.locator('a, button');
  expect(await destinations.count(), `${context} mobile navigation count`).toBeLessThanOrEqual(5);
  const more = navigation.getByRole('button', { name: 'Open more destinations' });
  await expect(more).toBeVisible();
};

const inspectMain = async (page: Page, label: string) => {
  const measurement = await page.locator('main').evaluate(main => ({
    clientWidth: main.clientWidth,
    scrollWidth: main.scrollWidth,
    offenders: Array.from(main.querySelectorAll('*'))
      .filter(element => {
        const style = getComputedStyle(element);
        return element.getBoundingClientRect().width > 0
          && element.scrollWidth > element.clientWidth + 1
          && !['auto', 'scroll'].includes(style.overflowX);
      })
      .slice(0, 12)
      .map(element => ({
        tag: element.tagName.toLowerCase(),
        className: typeof element.className === 'string' ? element.className : '',
        text: element.textContent?.trim().replace(/\s+/g, ' ').slice(0, 80) || '',
        rect: Math.round(element.getBoundingClientRect().width),
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        overflowX: getComputedStyle(element).overflowX,
      })),
  }));
  console.info(`[responsive spot check] ${label}: ${JSON.stringify(measurement)}`);
  return measurement;
};

test.describe('responsive role and route audit', () => {
  test('keeps the Project list within the viewport at tablet width', async ({ page }) => {
    await signInAs(page, 'Project Manager Demo');
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/projects');
    await expect(page.locator('main')).toBeVisible();
    const projectList = await inspectMain(page, 'PM /projects at 768px');
    await page.screenshot({ path: 'audit-evidence/2026-10-25/responsive-after-projects-tablet.png', fullPage: true });
    expect(projectList.scrollWidth).toBeLessThanOrEqual(projectList.clientWidth + 1);
  });

  test('keeps HOD dashboard content within the phone viewport', async ({ page }) => {
    await signInAs(page, 'HOD Demo');
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Department work' }).first()).toBeVisible();
    const hodDashboard = await inspectMain(page, 'HOD dashboard at 320px');
    await page.screenshot({ path: 'audit-evidence/2026-10-25/responsive-after-hod-phone.png', fullPage: true });
    expect(hodDashboard.scrollWidth).toBeLessThanOrEqual(hodDashboard.clientWidth + 1);
  });

  for (const viewport of [{ width: 320, height: 700 }, { width: 768, height: 1024 }]) {
    test(`keeps Boss dashboard table keyboard-scrollable at ${viewport.width}px`, async ({ page }) => {
    await signInAs(page, 'Boss Koo');
      await page.setViewportSize(viewport);
      await page.goto('/');
      await expect(page.locator('main')).toBeVisible();
      await expect.poll(() => page.locator('main header').first().evaluate(header => header.scrollWidth <= header.clientWidth + 1)).toBe(true);
      const clientTable = page.getByRole('region', { name: 'Client and project data' });
      await expect(clientTable).toBeVisible();
      expect(await clientTable.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
      await expect(clientTable).toHaveAttribute('tabindex', '0');
      await page.screenshot({ path: `audit-evidence/2026-10-25/responsive-after-boss-${viewport.width}.png`, fullPage: true });
      await clientTable.focus();
      await page.keyboard.press('ArrowRight');
      expect(await clientTable.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
      const axeResults = await new AxeBuilder({ page }).include('main').analyze();
      expect(axeResults.violations, `Boss dashboard at ${viewport.width}px: ${axeResults.violations.map(item => item.id).join(', ')}`).toEqual([]);
    });
  }

  for (const role of auditRoles) {
    test(`covers ${role.id} across the responsive route matrix`, async ({ page }) => {
      // Keep the original per-case budget while giving each role an independent
      // run. The full matrix exceeded 180 seconds before reaching all roles.
      test.setTimeout(180_000);
      const mainOverflowCases: Array<{ viewport: string; route: string; main: string; scrollableDescendants: unknown[] }> = [];
      await signInAs(page, role.username);
      for (const viewport of auditViewports) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        for (const route of role.routes) {
          await page.goto(route, { waitUntil: 'domcontentloaded' });
          await expect(page.locator('main'), `${role.id} ${viewport.name}px ${route} should render a main region`).toBeVisible({ timeout: 15_000 });
          await expectNoHorizontalOverflow(page, `${role.id} ${viewport.name}px ${route}`);
          const mainMeasurement = await page.locator('main').evaluate(main => {
            const describe = (element: Element) => {
              const style = getComputedStyle(element);
              const attributes = [element.getAttribute('aria-label'), element.getAttribute('aria-labelledby'), element.getAttribute('role')].filter(Boolean).join(' ');
              return {
                tag: element.tagName.toLowerCase(),
                label: attributes || element.getAttribute('title') || '',
                overflowX: style.overflowX,
                tabIndex: (element as HTMLElement).tabIndex,
                clientWidth: element.clientWidth,
                scrollWidth: element.scrollWidth,
              };
            };
            const scrollableDescendants = Array.from(main.querySelectorAll('*'))
              .filter(element => element.scrollWidth > element.clientWidth + 1 && ['auto', 'scroll'].includes(getComputedStyle(element).overflowX))
              .map(describe);
            return {
              clientWidth: main.clientWidth,
              scrollWidth: main.scrollWidth,
              scrollableDescendants,
            };
          });
          if (mainMeasurement.scrollWidth > mainMeasurement.clientWidth + 1) {
            mainOverflowCases.push({ viewport: viewport.name, route, main: `${mainMeasurement.scrollWidth}/${mainMeasurement.clientWidth}`, scrollableDescendants: mainMeasurement.scrollableDescendants });
          }
          await assertMobileNavigation(page, `${role.id} ${viewport.name}px ${route}`);
          if (viewport.width === 390 && route === '/tasks') {
            const mainAxe = await new AxeBuilder({ page }).include('main').analyze();
            expect(mainAxe.violations, `${role.id} mobile tasks: ${mainAxe.violations.map(item => item.id).join(', ')}`).toEqual([]);
            const navigationAxe = await new AxeBuilder({ page }).include('[aria-label="Mobile navigation"]').analyze();
            expect(navigationAxe.violations, `${role.id} mobile navigation: ${navigationAxe.violations.map(item => item.id).join(', ')}`).toEqual([]);
          }
        }
      }
      console.info(`[responsive audit] ${role.id} main-content overflow cases: ${JSON.stringify(mainOverflowCases)}`);
      const uncontainedOverflow = mainOverflowCases.filter(item => {
        const surfaces = item.scrollableDescendants as Array<{ overflowX: string; tabIndex: number; label: string }>;
        return !surfaces.some(surface => ['auto', 'scroll'].includes(surface.overflowX) && surface.tabIndex >= 0 && Boolean(surface.label));
      });
      expect(uncontainedOverflow, `${role.id} main-content overflow must stay inside a labelled, keyboard-accessible scroller.`).toEqual([]);
    });
  }

  test('audits representative changed surfaces for accessibility across roles', async ({ page }) => {
    test.setTimeout(180_000);
    const representativeRoutes = [
      { username: 'Boss Koo', routes: ['/', '/approvals', '/settings'] },
      { username: 'Project Manager Demo', routes: ['/', '/tasks', '/reports'] },
      { username: 'HOD Demo', routes: ['/', '/tasks', '/calendar'] },
      { username: 'Staff Demo', routes: ['/', '/tasks', '/notifications'] },
      { username: 'UrbanEats Client Demo', routes: ['/', '/clients', '/clients/demo-service-client-urban'] },
    ];

    await page.setViewportSize({ width: 1440, height: 900 });
    for (const role of representativeRoutes) {
      await signInAs(page, role.username);
      for (const route of role.routes) {
        await page.goto(route, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('main'), `${role.username} ${route} should render a main region`).toBeVisible({ timeout: 15_000 });
        const axeResults = await new AxeBuilder({ page }).include('main').analyze();
        expect(axeResults.violations, `${role.username} ${route}: ${axeResults.violations.map(item => item.id).join(', ')}`).toEqual([]);
      }
    }
  });

  test('covers desktop, landscape, Chinese, dark mode and reduced motion without overflow', async ({ page }) => {
    test.setTimeout(120_000);
    await signInAs(page, 'Project Manager Demo');
    const scenarios = [
      { name: 'desktop', width: 1440, height: 900, locale: 'en', theme: 'light' },
      { name: 'tablet-landscape', width: 1024, height: 768, locale: 'en', theme: 'dark' },
      { name: 'phone-landscape', width: 844, height: 390, locale: 'zh', theme: 'dark' },
      { name: 'tablet-portrait', width: 768, height: 1024, locale: 'zh', theme: 'light' },
    ] as const;

    for (const scenario of scenarios) {
      await page.setViewportSize({ width: scenario.width, height: scenario.height });
      await page.evaluate(({ locale, theme }) => {
        localStorage.setItem('aitask:locale', locale);
        localStorage.setItem('aitask-color-theme', theme);
      }, scenario);
      await page.reload();
      await page.emulateMedia({ reducedMotion: 'reduce' });
      for (const route of ['/','/tasks','/calendar','/clients','/projects','/reports','/approvals','/notifications','/settings','/feedback']) {
        await page.goto(route, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('main')).toBeVisible();
        await expectNoHorizontalOverflow(page, `${scenario.name} ${scenario.locale} ${scenario.theme} ${route}`);
      }
      const axeResults = await new AxeBuilder({ page }).include('main').analyze();
      expect(axeResults.violations, `${scenario.name}: ${axeResults.violations.map(item => item.id).join(', ')}`).toEqual([]);
    }
  });

  test('keeps registration and role controls Boss-only while PM team management stays scoped', async ({ page }) => {
    await signInAs(page, 'Project Manager Demo');
    await page.goto('/approvals', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Approvals', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Manage team', exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Registrations' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Roles' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Members' })).toBeVisible();
    await page.getByRole('button', { name: 'Add Member' }).click();
    const memberDialog = page.getByRole('dialog', { name: 'Add new member' });
    const roleOptions = await memberDialog.getByLabel('System Role').locator('option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value));
    expect(roleOptions).toEqual(['HOD', 'Staff']);
    await memberDialog.getByRole('button', { name: 'Cancel' }).click();

    await signInAs(page, 'HOD Demo');
    await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Department work' }).first()).toBeVisible();
    await expect(page.getByLabel('Search visible work')).toBeVisible();
  });

  test('keeps the password setup gate usable across narrow and rotated layouts', async ({ page }) => {
    const scenarios = [
      { name: '320px', width: 320, height: 700, locale: 'en', theme: 'light' },
      { name: '390px-dark-zh', width: 390, height: 844, locale: 'zh', theme: 'dark' },
      { name: 'phone-landscape', width: 844, height: 390, locale: 'en', theme: 'dark' },
    ] as const;

    await page.goto('/login');
    await waitForWorkspaceBoot(page);
    for (const scenario of scenarios) {
      await page.setViewportSize({ width: scenario.width, height: scenario.height });
      await page.evaluate(async ({ locale, theme }) => {
        const { useStore } = await import('/src/app/store/workspaceStore.ts');
        useStore.setState({ currentUser: null });
        localStorage.setItem('aitask:locale', locale);
        localStorage.setItem('aitask-color-theme', theme);
      }, scenario);
      await page.goto('/login');
      await page.reload();
      await waitForWorkspaceBoot(page);
      await page.getByRole('button', { name: /(?:Use|使用) Staff Demo/ }).click();
      await page.locator('#password').fill('password123');
      await page.getByRole('button', { name: /Access Dashboard|进入仪表板/ }).click();
      await page.waitForURL(url => url.pathname === '/settings');
      await expect(page.getByRole('heading', { name: /Account Setup|账号设置/ })).toBeVisible();
      await expect(page.locator('#current-password')).toBeVisible();
      await expect(page.locator('#new-password')).toBeVisible();
      await expect(page.locator('#confirm-password')).toBeVisible();
      await expect(page.locator('#current-password').locator('xpath=ancestor::form').locator('button[type="submit"]')).toBeVisible();
      await expectNoHorizontalOverflow(page, `password setup ${scenario.name}`);
      const axeResults = await new AxeBuilder({ page }).include('main').analyze();
      expect(axeResults.violations, `password setup ${scenario.name}: ${axeResults.violations.map(item => item.id).join(', ')}`).toEqual([]);
    }
  });
});
