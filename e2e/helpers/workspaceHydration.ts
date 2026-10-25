import type { Page } from '@playwright/test';

/** Wait until the browser store has merged persisted local workspace state. */
export const waitForWorkspaceHydration = async (page: Page) => {
  await page.locator('main').waitFor({ state: 'visible' });
  await page.waitForFunction(async () => {
    const { useStore } = await import('/src/app/store/workspaceStore.ts');
    return useStore.persist.hasHydrated();
  });
  // The local E2E server seeds its demo workspace from the app lifecycle after
  // the first render. Waiting for its version marker prevents fixtures from
  // copying an empty task list and then being discarded by persisted parsing
  // on the next full-page navigation. Do not call rehydrate again here: a
  // second merge can replace deliberate in-memory fixture state.
  await page.waitForFunction(() => Boolean(localStorage.getItem('aitask:local-service-demo-version')));
};
