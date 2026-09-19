import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const dismissPasswordSetup = async (page: Page) => {
  if (!page.url().includes('/settings')) return;
  const continueButton = page.getByRole('button', { name: 'Continue for now' });
  await expect(continueButton).toBeVisible({ timeout: 15_000 });
  await continueButton.click();
  await expect.poll(() => page.url()).not.toMatch(/\/settings(?:$|\?)/);
};

const signInAsBoss = async (page: Page) => {
  await page.goto('/login');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const demo = page.getByRole('button', { name: 'Use Boss Koo' });
  if (await demo.count()) await demo.click();
  else await page.getByLabel('Email or username').fill('Boss Koo');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Access Dashboard' }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/login'));
  await dismissPasswordSetup(page);
  await dismissReleaseNotice(page);
};

const seedRegistrations = async (page: Page) => {
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const current = useStore.getState();
    const keep = current.registrations.filter(registration => !registration.id.startsWith('e2e-approval-'));
    const now = Date.now();
    useStore.setState({
      registrations: [
        {
          id: 'e2e-approval-old',
          name: 'Older Applicant',
          email: 'older@example.com',
          phone: '+60120000001',
          jobPosition: 'Designer',
          requestedRole: 'Staff',
          status: 'Pending',
          onboardingMode: 'self_signup',
          createdAt: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(),
          updatedAt: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: 'e2e-approval-new',
          name: 'Newer Applicant',
          email: 'newer@example.com',
          phone: '+60120000002',
          jobPosition: 'Video Editor',
          requestedRole: 'Staff',
          status: 'Pending',
          onboardingMode: 'legacy_invite',
          createdAt: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
          updatedAt: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
        },
        ...keep,
      ],
    });
  });
};

const expectNoOverflow = async (page: Page) => {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
};

const dismissReleaseNotice = async (page: Page) => {
  const releaseNotice = page.getByRole('button', { name: 'Happy working' });
  await releaseNotice.waitFor({ state: 'visible', timeout: 5_000 }).then(() => releaseNotice.click()).catch(() => undefined);
};

test.describe('approvals responsive workspace', () => {
  test.describe.configure({ timeout: 120_000 });

  test('prioritizes the queue and restores the selected review', async ({ page }) => {
    await signInAsBoss(page);
    await seedRegistrations(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/approvals?tab=registrations');
    await dismissPasswordSetup(page);
    await dismissReleaseNotice(page);

    await expect(page.getByRole('heading', { name: 'Approvals' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pending registrations' })).toBeVisible();
    const oldRow = page.locator('tr').filter({ hasText: 'Older Applicant' });
    await expect(oldRow).toBeVisible();
    await expect(oldRow.getByText(/10d pending/)).toBeVisible();
    await expect(page.getByRole('tab', { name: /Registrations/ })).toHaveAttribute('aria-selected', 'true');
    await expectNoOverflow(page);

    await oldRow.getByRole('button', { name: 'Approve' }).click();
    await expect(page).toHaveURL(/registrationId=e2e-approval-old/);
    const desktopReview = page.locator('section[aria-labelledby="approval-review-title-e2e-approval-old"]');
    await expect(desktopReview.getByText('Older Applicant', { exact: true })).toBeVisible();
    await expect(desktopReview.getByLabel('System role')).toHaveValue('Staff');

    await page.reload();
    await expect(page.locator('section[aria-labelledby="approval-review-title-e2e-approval-old"]').getByText('Older Applicant', { exact: true })).toBeVisible();

    await desktopReview.getByLabel('System role').selectOption('Client');
    const confirmApproval = desktopReview.locator('button[type="submit"]');
    await expect(confirmApproval).toHaveText(/Confirm & approve/);
    await confirmApproval.scrollIntoViewIfNeeded();
    await confirmApproval.click();
    await expect(desktopReview.getByRole('alert')).toContainText('Choose a client company');
    await expect(desktopReview.getByLabel('System role')).toHaveValue('Client');
    await page.getByRole('button', { name: 'Back to queue' }).click();
    await expect(page).not.toHaveURL(/registrationId=/);

    await page.getByRole('tab', { name: /Roles/ }).click();
    await expect(page.getByRole('heading', { name: 'Roles & Permissions' })).toBeVisible();
    await page.getByRole('tab', { name: /Members/ }).click();
    await expect(page.getByRole('heading', { name: 'Active System Users' })).toBeVisible();
    await page.getByRole('tab', { name: /History/ }).click();
    await expect(page.getByRole('heading', { name: 'Decision history' })).toBeVisible();
  });

  test('uses a mobile sheet with a sticky action footer and no overflow', async ({ page }) => {
    await signInAsBoss(page);
    await seedRegistrations(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/approvals?tab=registrations');
    await dismissPasswordSetup(page);
    await dismissReleaseNotice(page);

    const newerCard = page.locator('article').filter({ hasText: 'Newer Applicant' });
    await newerCard.getByRole('button', { name: 'Approve' }).click();
    const reviewSheet = page.getByRole('dialog', { name: 'Newer Applicant' });
    await expect(reviewSheet).toBeVisible();
    await expect(reviewSheet.getByRole('button', { name: 'Confirm & approve' })).toBeVisible();
    await expect(reviewSheet.getByRole('button', { name: 'Back to queue' })).toBeVisible();
    await expectNoOverflow(page);

    const axe = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
    expect(axe.violations, axe.violations.map(item => item.id).join(', ')).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(reviewSheet).toBeHidden();
    await expect(page).not.toHaveURL(/registrationId=/);
  });
});
