import { expect, test } from '@playwright/test';

for (const width of [320, 375, 390, 414, 768, 1024]) {
  test(`first-login onboarding leaves navigation usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await loginWithDemo(page, 'Project Manager Demo');
    await promoteDemoToFreshMember(page, `navigation-${width}`);
    await expect(page.getByRole('heading', { name: 'Welcome to AiTask' })).toBeVisible();
    if (width < 768) {
      const nav = page.getByRole('navigation', { name: 'Mobile navigation' });
      const card = await page.locator('.onboarding-tour-card').boundingBox();
      const bar = await nav.boundingBox();
      expect(card!.y + card!.height).toBeLessThan(bar!.y);
      await nav.getByRole('link').first().click();
      await expect(page.getByRole('heading', { name: 'Welcome to AiTask' })).toBeVisible();
    }
    await page.getByRole('button', { name: 'Start tutorial' }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText('Step 2 of 6', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.onboarding-tour-card')).toHaveCount(0);
  });
}

const loginWithDemo = async (page: import('@playwright/test').Page, username: string) => {
  await page.goto('/login');
  await page.getByRole('button', { name: `Use ${username}` }).click();
  await page.getByRole('button', { name: 'Access Dashboard' }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/login'));
  if (/\/settings$/.test(page.url())) await page.getByRole('button', { name: 'Continue for now' }).click();
  const releaseNotice = page.getByRole('button', { name: 'Happy working' });
  await releaseNotice.waitFor({ state: 'visible', timeout: 3_000 }).catch(() => undefined);
  if (await releaseNotice.isVisible().catch(() => false)) await releaseNotice.click();
};

const promoteDemoToFreshMember = async (page: import('@playwright/test').Page, id: string) => {
  await page.evaluate(async freshId => {
    const { useStore } = await import('/src/store/index.ts');
    const currentUser = useStore.getState().currentUser;
    if (currentUser) useStore.setState({ currentUser: { ...currentUser, id: freshId, name: `Fresh ${currentUser.name}`, mustResetPassword: false } });
  }, id);
  // The release notice is keyed by user id, so changing the demo identity
  // creates a fresh notice as well. Dismiss that app-level modal before
  // asserting the onboarding experience.
  const releaseNotice = page.getByRole('button', { name: 'Happy working' });
  await releaseNotice.waitFor({ state: 'visible', timeout: 3_000 }).catch(() => undefined);
  if (await releaseNotice.isVisible().catch(() => false)) await releaseNotice.click();
};

test('role onboarding can be started, skipped, restarted, and persisted per user', async ({ page }) => {
  await page.goto('/login');
  // Let the app finish its startup load so seeded state is not overwritten.
  await page.waitForFunction(() => Boolean(document.querySelector('form input, main')));
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(() => localStorage.setItem('aitask:locale', 'en'));
  await loginWithDemo(page, 'Project Manager Demo');
  await promoteDemoToFreshMember(page, 'fresh-project-manager');

  await expect(page.getByRole('heading', { name: 'Welcome to AiTask' })).toBeVisible();
  await page.getByRole('button', { name: 'Start tutorial' }).click();
  await expect(page.getByText('Step 1 of 6', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back' })).toBeDisabled();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Step 2 of 6', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome to AiTask' })).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Welcome to AiTask' })).toHaveCount(0);

  await page.goto('/help');
  await expect(page.getByRole('heading', { name: 'Help & tutorials' })).toBeVisible();
  await page.getByRole('button', { name: 'Restart tutorial' }).click();
  await expect(page.getByText('Step 1 of 6', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close tutorial' }).click();

  await page.goto('/help');
  await page.getByRole('button', { name: '切换为中文' }).click();
  await expect(page.getByRole('heading', { name: '帮助与教程' })).toBeVisible();
});

test('role onboarding supports Back and Finish, then remains completed after refresh', async ({ page }) => {
  await page.goto('/login');
  // Let the app finish its startup load so seeded state is not overwritten.
  await page.waitForFunction(() => Boolean(document.querySelector('form input, main')));
  await page.evaluate(() => localStorage.clear());
  await loginWithDemo(page, 'Project Manager Demo');
  await promoteDemoToFreshMember(page, 'finished-project-manager');

  await page.getByRole('button', { name: 'Start tutorial' }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByText('Step 2 of 6', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByText('Step 1 of 6', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);

  const expectedPaths = ['/projects', '/', '/tasks', '/reports', '/help'];
  for (const [index, step] of [2, 3, 4, 5, 6].entries()) {
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByText(`Step ${step} of 6`, { exact: true })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${expectedPaths[index].replace('/', '\\/')}$$`));
  }
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome to AiTask' })).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Welcome to AiTask' })).toHaveCount(0);
});

test('client onboarding stays scoped to client-visible guidance', async ({ page }) => {
  await page.goto('/login');
  // Let the app finish its startup load so seeded state is not overwritten.
  await page.waitForFunction(() => Boolean(document.querySelector('form input, main')));
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(() => localStorage.setItem('aitask:locale', 'en'));
  await loginWithDemo(page, 'UrbanEats Client Demo');
  await promoteDemoToFreshMember(page, 'fresh-client');

  await expect(page.getByRole('heading', { name: 'Welcome to AiTask' })).toBeVisible();
  await page.getByRole('button', { name: 'Start tutorial' }).click();
  await expect(page.getByRole('heading', { name: 'Start from your client workspace' })).toBeVisible();
  await expect(page.getByText(/Internal notes, assignments, and team-only workflow details stay with the operations team/)).toHaveCount(0);
  await page.getByRole('button', { name: /Next/ }).click();
  await expect(page).toHaveURL(/\/clients$/);
  await page.getByRole('button', { name: 'Skip' }).click();

  await page.goto('/help');
  await expect(page.getByRole('heading', { name: 'Client guide' })).toBeVisible();
  await expect(page.getByText(/Internal notes, team assignments, and internal workflow stay private/)).toBeVisible();
});
