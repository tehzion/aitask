import type { Page } from '@playwright/test';
import { waitForWorkspaceHydration } from '../helpers/workspaceHydration';

/**
 * Local fixture writes must follow the lazy app lifecycle's initial commit.
 * Both the login screen and authenticated shell render main after boot starts;
 * the loading fallback does not. Waiting here prevents boot from replacing a
 * fixture's backend state or adding demo records after counts were captured.
 */
export const waitForWorkspaceBoot = async (page: Page) => {
  await waitForWorkspaceHydration(page);
};
