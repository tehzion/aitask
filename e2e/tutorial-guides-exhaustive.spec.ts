import { expect, test } from '@playwright/test';
import { getVisibleTutorials, type Tutorial } from '../src/lib/tutorials';

const profiles = [
  { persona: 'admin' as const, username: 'Boss Koo' },
  { persona: 'projectManager' as const, username: 'Project Manager Demo' },
  { persona: 'hod' as const, username: 'HOD Demo' },
  { persona: 'staff' as const, username: 'Staff Demo' },
  { persona: 'client' as const, username: 'UrbanEats Client Demo' },
] as const;

const loginWithDemo = async (page: import('@playwright/test').Page, username: string) => {
  await page.goto('/login');
  // Let the app finish its startup load so seeded state is not overwritten.
  await page.waitForFunction(() => Boolean(document.querySelector('form input, main')));
  await page.evaluate(() => localStorage.clear());
  const demoAccount = page.getByRole('button', { name: `Use ${username}` });
  if (await demoAccount.count()) {
    await demoAccount.click();
  } else {
    // The Super Admin remains deliberately absent from the public demo-account list.
    await page.getByLabel('Email or username').fill(username);
    await page.getByLabel('Password').fill('password123');
  }
  await page.getByRole('button', { name: 'Access Dashboard' }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/login'));
  if (/\/settings$/.test(page.url())) await page.getByRole('button', { name: 'Continue for now' }).click();
  const releaseNotice = page.getByRole('button', { name: 'Happy working' });
  await releaseNotice.waitFor({ state: 'visible', timeout: 3_000 }).catch(() => undefined);
  if (await releaseNotice.isVisible().catch(() => false)) await releaseNotice.click();
};

const logout = async (page: import('@playwright/test').Page) => {
  await page.getByRole('button', { name: 'Logout', exact: true }).click();
  await page.waitForURL(/\/login$/);
};

const guideForProfile = (tutorial: Tutorial, persona: typeof profiles[number]['persona']) => {
  if (!tutorial.guide?.length) return false;
  if (tutorial.roles.includes('all')) return persona === 'projectManager';
  return tutorial.roles.includes(persona);
};

test('every live guide completes safely or explains an unavailable record-specific target', async ({ page }) => {
  test.setTimeout(180_000);
  let checkedGuides = 0;
  const expectedGuideExecutions = profiles.reduce((total, profile) => (
    total + getVisibleTutorials(profile.persona).filter(tutorial => guideForProfile(tutorial, profile.persona)).length
  ), 0);
  const uniqueGuides = new Set(profiles.flatMap(profile => (
    getVisibleTutorials(profile.persona)
      .filter(tutorial => guideForProfile(tutorial, profile.persona))
      .map(tutorial => tutorial.id)
  )));

  for (const [profileIndex, profile] of profiles.entries()) {
    if (profileIndex > 0) await logout(page);
    await loginWithDemo(page, profile.username);
    const guides = getVisibleTutorials(profile.persona).filter(tutorial => guideForProfile(tutorial, profile.persona));
    expect(guides.length, `${profile.persona} should have at least one assigned guide`).toBeGreaterThan(0);

    for (const tutorial of guides) {
      await test.step(`${profile.persona}: ${tutorial.id}`, async () => {
        await page.goto(`/help?tutorial=${tutorial.id}`);
        const detail = page.locator('aside[aria-labelledby="selected-tutorial-title"]');
        await expect(detail.getByRole('heading', { name: tutorial.title.en, level: 3 })).toBeVisible();
        await detail.getByRole('button', { name: 'Guide me' }).click();
        const tutorialDialog = page.getByRole('dialog', { name: /^Tutorial progress:/ });

        for (const [index, step] of (tutorial.guide || []).entries()) {
          await expect(tutorialDialog.getByText(`Step ${index + 1} of ${tutorial.guide?.length}`, { exact: true })).toBeVisible();
          if (step.path) {
            await expect.poll(() => {
              const current = new URL(page.url());
              return `${current.pathname}${current.search}`;
            }, { message: `${tutorial.id} should navigate to ${step.path}` }).toBe(step.path);
          }

          await page.waitForTimeout(100);
          const highlightedTarget = page.locator(`[data-onboarding-target="${step.target}"]:visible`).first();
          const unavailableNotice = tutorialDialog.getByText('This interface element is not available right now. You can continue the guide or restart it later from Help.', { exact: true });
          await expect.poll(async () => {
            if (await highlightedTarget.isVisible().catch(() => false)) return 'highlighted';
            if (await unavailableNotice.isVisible().catch(() => false)) return 'fallback';
            return 'pending';
          }, { message: `${tutorial.id} should highlight ${step.target} or show its safe fallback` }).not.toBe('pending');

          if (index === (tutorial.guide?.length || 0) - 1) {
            await tutorialDialog.getByRole('button', { name: 'Finish', exact: true }).click();
          } else {
            await tutorialDialog.getByRole('button', { name: 'Next', exact: true }).click();
          }
        }

        await expect(tutorialDialog).toHaveCount(0);
        checkedGuides += 1;
      });
    }
  }

  expect(uniqueGuides.size).toBe(27);
  expect(checkedGuides).toBe(expectedGuideExecutions);
});
