import { expect, test } from '@playwright/test';

const openOperationsWorkspace = async (page: import('@playwright/test').Page) => {
  await page.goto('/login');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const user = useStore.getState().users.find(candidate => candidate.id === 'u-boss');
    if (user) useStore.setState({ currentUser: { ...user, mustResetPassword: false } });
    localStorage.setItem('aitask:release-notice:2026-08-service-operations:u-boss', 'acknowledged');
  });
  await page.goto('/clients/demo-service-client-urban');
  await expect(page.getByRole('heading', { name: 'UrbanEats' })).toBeVisible();
}

test('service activity upload shows file context and preserves retry state when backend is unavailable', async ({ page }) => {
  await openOperationsWorkspace(page);
  await page.getByRole('tab', { name: 'Activity / Files' }).click();
  await page.getByRole('button', { name: 'Add activity', exact: true }).click();

  const sheet = page.getByRole('dialog', { name: 'Add activity' });
  await sheet.getByLabel('Update').fill('Upload recovery check');
  await sheet.locator('#activity-file').setInputFiles({
    name: 'brief.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('private service file'),
  });
  await expect(sheet.getByText('brief.pdf', { exact: true })).toBeVisible();
  await expect(sheet.getByText('20 B', { exact: true })).toBeVisible();

  await sheet.getByRole('button', { name: 'Add activity', exact: true }).click();
  await expect(sheet.getByRole('alert')).toContainText('Private file uploads require the Supabase backend.');
  await expect(sheet.getByText('brief.pdf', { exact: true })).toBeVisible();
});
