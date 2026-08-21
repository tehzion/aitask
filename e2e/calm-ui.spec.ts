import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const routes = [
  { path: '/', heading: 'Admin Dashboard' },
  { path: '/projects', heading: 'Companies' },
  { path: '/clients', heading: 'Clients' },
  { path: '/tasks', heading: 'Tasks Management' },
  { path: '/clients/demo-service-client-urban', heading: 'UrbanEats' },
  { path: '/settings', heading: /Settings|Account Setup/ },
] as const;

const openDemoWorkspace = async (page: import('@playwright/test').Page) => {
  await page.clock.install({ time: new Date('2026-08-16T00:00:00.000Z') });
  await page.goto('/login');
  await page.getByRole('button', { name: 'Use Admin Demo' }).click();
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Access Dashboard' }).click();
  if (/\/settings$/.test(page.url())) {
    await page.getByRole('button', { name: 'Continue for now' }).click();
  }
  await expect(page.getByRole('heading', { name: 'Admin Dashboard' })).toBeVisible();
};

const setTheme = async (page: import('@playwright/test').Page, theme: 'Light' | 'Dark') => {
  await page.getByRole('button', { name: 'Appearance settings' }).click();
  await page.getByRole('menuitemradio', { name: theme }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme.toLowerCase());
};

const expectNoHorizontalOverflow = async (page: import('@playwright/test').Page, context: string) => {
  await expect.poll(
    () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    { message: `${context} should not overflow horizontally` },
  ).toBe(true);
};

// The committed visual references were captured with the locally-installed
// Chrome renderer on macOS. Keep pixel comparisons on that renderer instead
// of treating platform font rasterisation as a product regression in Linux CI.
// Every CI run still exercises each route, theme, viewport, semantic heading,
// overflow check, and the Projects accessibility scan below.
const hasCommittedVisualBaseline = process.platform === 'darwin';

test('core operations screens keep their semantic layout in light and dark modes', async ({ page }) => {
  test.setTimeout(120_000);
  await openDemoWorkspace(page);

  const viewports = [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 390, height: 844 },
  ] as const;

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);

    for (const theme of ['Light', 'Dark'] as const) {
      await setTheme(page, theme);
      const expectedCanvas = theme === 'Dark' ? 'rgb(16, 22, 24)' : 'rgb(247, 248, 248)';
      await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(expectedCanvas);

      for (const route of routes) {
        await page.goto(route.path);
        await expect(page.getByRole('heading', { name: route.heading })).toBeVisible();
        await expectNoHorizontalOverflow(page, `${viewport.name} ${theme} ${route.path}`);
        const pageName = route.path === '/'
          ? 'dashboard'
          : route.path.slice(1).replaceAll('/', '-');
        if (hasCommittedVisualBaseline) {
          await expect(page).toHaveScreenshot(`calm-${pageName}-${viewport.name}-${theme.toLowerCase()}.png`, {
            animations: 'disabled',
            caret: 'hide',
            maxDiffPixelRatio: 0.01,
            scale: 'css',
          });
        }
      }

      await page.goto('/projects');
      const axeResults = await new AxeBuilder({ page }).include('main').analyze();
      expect(axeResults.violations, `${viewport.name} ${theme} Projects: ${axeResults.violations.map(item => item.id).join(', ')}`).toEqual([]);

    }
  }

  await page.goto('/clients');
  await page.getByRole('button', { name: '切换为中文' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expectNoHorizontalOverflow(page, 'Simplified Chinese Clients');
  if (hasCommittedVisualBaseline) {
    await expect(page).toHaveScreenshot('calm-clients-mobile-dark-zh.png', {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.01,
      scale: 'css',
    });
  }
  await page.getByRole('button', { name: 'Switch to English' }).click();
});
