import { expect, test, type Page } from '@playwright/test';

const openClient = async (page: Page) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Use UrbanEats Client Demo' }).click();
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const continueButton = page.getByRole('button', { name: 'Continue for now' });
  await expect(continueButton).toBeVisible();
  await continueButton.click();
  const notice = page.getByRole('button', { name: 'Happy working' });
  await expect(notice).toBeVisible();
  await notice.click();
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
};

// Navigate inside the app: a full page load would reset the in-memory state.
const openServices = async (page: Page) => {
  const link = page.getByRole('link', { name: 'Services', exact: true });
  if (!(await link.isVisible().catch(() => false))) await page.getByRole('button', { name: 'More' }).click();
  await link.click();
  await expect(page.locator('main')).toContainText('UrbanEats');
};

for (const [status, label] of [['unpaid', 'Awaiting payment'], ['partial', 'Partly paid'], ['paid', 'Paid']] as const) {
  test(`a client sees "${label}" for a ${status} month, with no amounts`, async ({ page }) => {
    await openClient(page);
    await page.evaluate(async value => {
      const { useStore } = await import('/src/store/index.ts');
      const state = useStore.getState();
      useStore.setState({ serviceCycles: state.serviceCycles.map(cycle => ({ ...cycle, paymentStatus: value })) });
    }, status);
    await openServices(page);
    await expect(page.locator('main').getByText(label, { exact: true }).first()).toBeVisible();
    await expect(page.locator('main')).not.toContainText(/RM\s?\d/);
  });
}

test('without server status no payment chip is shown', async ({ page }) => {
  await openClient(page);
  await openServices(page);
  await expect(page.locator('main').getByText(/^(Paid|Partly paid|Awaiting payment)$/)).toHaveCount(0);
});
