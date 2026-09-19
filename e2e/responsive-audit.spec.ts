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

const mobileViewports = [
  { name: '320', width: 320, height: 700 },
  { name: '375', width: 375, height: 812 },
  { name: '390', width: 390, height: 844 },
  { name: '414', width: 414, height: 896 },
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
  const releaseClose = page.getByRole('button', { name: 'Happy working' });
  await releaseClose.waitFor({ state: 'visible', timeout: 1_500 }).then(() => releaseClose.click()).catch(() => undefined);
};

const signInAs = async (page: Page, username: string) => {
  await page.goto('/login');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
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

test.describe('responsive role and route audit', () => {
  test.describe.configure({ mode: 'serial' });

  test('covers every role fixture across the responsive route matrix', async ({ page }) => {
    test.setTimeout(180_000);
    for (const role of auditRoles) {
      await signInAs(page, role.username);
      for (const viewport of mobileViewports) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        for (const route of role.routes) {
          await page.goto(route, { waitUntil: 'domcontentloaded' });
          await expect(page.locator('main'), `${role.id} ${viewport.name}px ${route} should render a main region`).toBeVisible();
          await expectNoHorizontalOverflow(page, `${role.id} ${viewport.name}px ${route}`);
          await assertMobileNavigation(page, `${role.id} ${viewport.name}px ${route}`);
          if (viewport.width === 390 && route === '/tasks') {
            const mainAxe = await new AxeBuilder({ page }).include('main').analyze();
            expect(mainAxe.violations, `${role.id} mobile tasks: ${mainAxe.violations.map(item => item.id).join(', ')}`).toEqual([]);
            const navigationAxe = await new AxeBuilder({ page }).include('[aria-label="Mobile navigation"]').analyze();
            expect(navigationAxe.violations, `${role.id} mobile navigation: ${navigationAxe.violations.map(item => item.id).join(', ')}`).toEqual([]);
          }
        }
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

  test('keeps approvals Boss-only and exposes the HOD workbench copy', async ({ page }) => {
    await signInAs(page, 'Project Manager Demo');
    await page.goto('/approvals', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Access Denied' })).toBeVisible();
    await expect(page.getByText('Approvals are restricted to Boss Koo')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Member' })).toHaveCount(0);

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

    for (const scenario of scenarios) {
      await page.setViewportSize({ width: scenario.width, height: scenario.height });
      await page.goto('/login');
      await page.evaluate(({ locale, theme }) => {
        localStorage.clear();
        localStorage.setItem('aitask:locale', locale);
        localStorage.setItem('aitask-color-theme', theme);
      }, scenario);
      await page.reload();
      await page.getByRole('button', { name: 'Use Staff Demo' }).click();
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
