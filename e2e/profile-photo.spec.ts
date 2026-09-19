import { expect, test } from '@playwright/test';

const openProfileSettings = async (page: import('@playwright/test').Page) => {
  await page.goto('/login');
  await page.evaluate(() => localStorage.setItem('aitask:locale', 'en'));
  await page.reload();
  await page.getByRole('button', { name: 'Use Project Manager Demo' }).click();
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Access Dashboard' }).click();
  await page.waitForURL(url => ['/', '/settings'].includes(url.pathname));
  if (/\/settings$/.test(page.url())) await page.getByRole('button', { name: 'Continue for now' }).click();
  const releaseNotice = page.getByRole('button', { name: 'Happy working' });
  await releaseNotice.waitFor({ state: 'visible', timeout: 3_000 }).catch(() => undefined);
  if (await releaseNotice.isVisible().catch(() => false)) await releaseNotice.click();
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Account', exact: true })).toBeVisible();
};

test('profile photo upload validates, previews, saves, and remains usable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openProfileSettings(page);

  const fileInput = page.locator('#profile-avatar-file');
  const feedback = page.locator('#profile-avatar-feedback');

  await fileInput.setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('not an image'),
  });
  await expect(feedback).toHaveText('Choose a JPG, PNG, WebP, or GIF image.');

  await fileInput.setInputFiles({
    name: 'profile.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
  });
  await expect(feedback).toHaveText('Photo ready. Save profile to apply it.');
  await expect(page.getByRole('button', { name: 'Save profile' })).toBeEnabled();

  const uploadButton = page.getByRole('button', { name: 'Upload photo' });
  const uploadBox = await uploadButton.boundingBox();
  expect(uploadBox?.height).toBeGreaterThanOrEqual(44);

  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Profile updated.' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
