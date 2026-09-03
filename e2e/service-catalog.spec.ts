import { expect, test } from '@playwright/test';

const setBoss = async (page: import('@playwright/test').Page) => {
  await page.goto('/login');
  await page.evaluate(() => localStorage.setItem('aitask:locale', 'en'));
  await page.reload();
  await page.getByRole('button', { name: 'Use Admin Demo' }).click();
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Access Dashboard' }).click();
  await page.waitForURL(url => ['/', '/settings'].includes(url.pathname));
  if (/\/settings$/.test(page.url())) await page.getByRole('button', { name: 'Continue for now' }).click();
  const releaseNotice = page.getByRole('button', { name: 'Happy working' });
  await releaseNotice.waitFor({ state: 'visible', timeout: 3_000 }).catch(() => undefined);
  if (await releaseNotice.isVisible().catch(() => false)) await releaseNotice.click();
};

test('service catalog: template and package creation, frozen plan and delete guard', async ({ page }) => {
  test.setTimeout(90_000);
  await setBoss(page);
  await page.goto('/settings');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ servicePackages: [], serviceWorkflowTemplates: [] });
  });

  // Create a workflow template with two steps.
  await page.getByRole('button', { name: 'New workflow' }).click();
  await page.getByLabel('Template name').fill('QA Video Chain');
  await page.getByLabel('Service types').fill('Short Video');
  await page.getByLabel('Step 1 title').fill('Script');
  await page.getByRole('button', { name: 'Add step' }).click();
  await page.getByLabel('Step 2 title').fill('Edit');
  await page.getByRole('button', { name: 'Save workflow' }).click();
  await expect(page.getByText('QA Video Chain', { exact: true })).toBeVisible();
  await expect(page.getByText(/Revision 1 · 2 steps/)).toBeVisible();

  // Create a package referencing the workflow template.
  await page.getByRole('button', { name: 'New package' }).click();
  await page.getByLabel('Package name').fill('QA Growth Package');
  await page.getByLabel('Service name').first().fill('Short Video');
  await page.getByLabel('Platforms').first().fill('TikTok');
  await page.getByLabel('Unit').first().fill('video');
  await page.getByLabel('Quantity').first().fill('4');
  await page.getByLabel('Unit price').first().fill('500');
  await page.getByLabel('Task workflow').first().selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Save package' }).click();
  await expect(page.getByText('QA Growth Package', { exact: true })).toBeVisible();
  await expect(page.getByText(/Revision 1 · 1 services/)).toBeVisible();

  // Deleting a workflow template that is frozen into a package is blocked.
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Delete workflow QA Video Chain' }).click();
  await expect(page.getByText(/Deactivate it instead of deleting./)).toBeVisible();
});