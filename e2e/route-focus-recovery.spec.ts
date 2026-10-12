import { expect, test } from '@playwright/test';

test('deferred navigation focus preserves a control the user already selected', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email or username').fill('Boss Koo');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Access Dashboard' }).click();
  await page.waitForURL(url => url.pathname !== '/login');
  if (page.url().endsWith('/settings')) await page.getByRole('button', { name: 'Continue for now' }).click();
  await page.getByRole('button', { name: 'Happy working' }).click();
  await page.goto('/calendar');
  await expect(page.getByRole('heading', { name: 'Calendar', exact: true })).toBeVisible();

  // Hold animation-frame work to model a delayed frame after navigation.
  await page.evaluate(() => {
    const request = window.requestAnimationFrame;
    const cancel = window.cancelAnimationFrame;
    const callbacks = new Map<number, FrameRequestCallback>();
    let next = 1;
    window.requestAnimationFrame = callback => { const id = next++; callbacks.set(id, callback); return id; };
    window.cancelAnimationFrame = id => { callbacks.delete(id); };
    window.__flushRouteFocus = () => {
      window.requestAnimationFrame = request;
      window.cancelAnimationFrame = cancel;
      for (const callback of callbacks.values()) callback(performance.now());
      callbacks.clear();
    };
    document.querySelector<HTMLAnchorElement>('nav a[href="/"]')!.click();
  });
  const tabs = page.getByRole('tablist', { name: 'Boss dashboard views' });
  const overview = tabs.getByRole('tab', { name: 'Overview' });
  await overview.focus();
  await page.evaluate(() => window.__flushRouteFocus());
  await expect(overview).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(tabs.getByRole('tab', { name: 'Agency pulse' })).toHaveAttribute('aria-selected', 'true');
  await expect(tabs.getByRole('tab', { name: 'Agency pulse' })).toBeFocused();
});

declare global {
  interface Window {
    __flushRouteFocus: () => void;
  }
}
