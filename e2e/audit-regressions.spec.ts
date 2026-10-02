import { expect, test, type Page } from '@playwright/test';

const seedPlan = async (page: Page) => {
  await page.goto('/login');
  const result = await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
    const state = useStore.getState();
    const boss = state.users.find(user => user.isSuperAdmin)!;
    enablePasswordResetBypass(boss.id);
    localStorage.setItem(`aitask:release-notice:2026-08-service-operations:${boss.id}`, 'acknowledged');
    useStore.setState({ currentUser: { ...boss, mustResetPassword: false }, clients: [], tasks: [], projects: [], clientPlans: [], serviceCycles: [], deliverables: [], cycleComments: [], addons: [], servicePricingSnapshots: [], backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 } });
    const created = useStore.getState().createClientWithPlan({ clientName: 'Audit Client', planName: 'Original', origin: 'custom', serviceItems: [{ id: 'audit-item', name: 'Design', platforms: [], unit: 'post', quantity: 1, unitPriceMinor: 100 }], startDate: '2026-08-15', billingDay: 15, discountType: 'none', discountValue: 0, taxRateBps: 0 });
    useStore.getState().activateClientPlan(created.planId!);
    const revision = useStore.getState().createClientPlanRevision(created.planId!);
    return { clientId: created.clientId!, draftId: revision.planId! };
  });
  await page.goto(`/clients/${result.clientId}`);
  await page.getByRole('tab', { name: 'Plan', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save revision' })).toBeVisible();
  return result;
};

test('saved drafts accept newer canonical data and dirty drafts require reconciliation', async ({ page }) => {
  const { draftId } = await seedPlan(page);
  const name = page.getByLabel('Plan name', { exact: true });
  await name.fill('Saved A');
  await page.getByRole('button', { name: 'Save revision' }).click();
  await expect(page.getByText('Draft revision saved.', { exact: true })).toBeVisible();
  await page.evaluate(async id => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState(state => ({ clientPlans: state.clientPlans.map(plan => plan.id === id ? { ...plan, name: 'Remote B', version: (plan.version || 0) + 1 } : plan) }));
  }, draftId);
  await expect(name).toHaveValue('Remote B');
  await name.fill('Local C');
  await page.evaluate(async id => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState(state => ({ clientPlans: state.clientPlans.map(plan => plan.id === id ? { ...plan, name: 'Remote D', taxRateBps: 900, version: (plan.version || 0) + 1 } : plan) }));
  }, draftId);
  await expect(page.getByRole('button', { name: 'Save revision' })).toBeDisabled();
  await expect(name).toHaveValue('Local C');
  await page.getByRole('button', { name: 'Keep my draft' }).click();
  await page.getByRole('button', { name: 'Use my value' }).click();
  await expect(page.getByLabel('Tax rate (%)', { exact: true })).toHaveValue('9');
  await page.getByRole('button', { name: 'Save revision' }).click();
  const saved = await page.evaluate(async id => { const { useStore } = await import('/src/store/index.ts'); return useStore.getState().clientPlans.find(plan => plan.id === id); }, draftId);
  expect(saved).toMatchObject({ name: 'Local C', taxRateBps: 900 });
});

test('typing during an in-flight save remains dirty and blocks PWA reload', async ({ page }) => {
  const { draftId } = await seedPlan(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const pending = window as unknown as { finishAuditSave?: () => void };
    useStore.setState({ commitPendingMutation: () => new Promise(resolve => { pending.finishAuditSave = () => resolve({ ok: true }); }) });
  });
  const name = page.getByLabel('Plan name', { exact: true });
  await name.fill('Submitted');
  await page.getByRole('button', { name: 'Save revision' }).click();
  await expect(page.getByRole('button', { name: 'Saving…', exact: true })).toBeVisible();
  await name.fill('Typed while saving');
  await page.evaluate(() => (window as unknown as { finishAuditSave: () => void }).finishAuditSave());
  await expect(page.getByRole('button', { name: 'Save revision' })).toBeEnabled();
  await expect(name).toHaveValue('Typed while saving');
  expect(await page.evaluate(async () => { const { hasUnsavedChanges } = await import('/src/lib/unsavedChanges.ts'); return hasUnsavedChanges(); })).toBe(true);
  expect(await page.evaluate(async id => { const { useStore } = await import('/src/store/index.ts'); return useStore.getState().clientPlans.find(plan => plan.id === id)?.name; }, draftId)).toBe('Submitted');
  await page.evaluate(async () => {
    const { PWA_UPDATE_READY_EVENT } = await import('/src/lib/pwaUpdates.ts');
    window.dispatchEvent(new Event(PWA_UPDATE_READY_EVENT));
  });
  await expect(page.getByRole('button', { name: 'Refresh now' })).toBeDisabled();
});

test('a remote revision arriving during save still reconciles edits typed while saving', async ({ page }) => {
  const { draftId } = await seedPlan(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ commitPendingMutation: () => new Promise(resolve => {
      (window as unknown as { finishAuditSave: () => void }).finishAuditSave = () => resolve({ ok: true });
    }) });
  });
  const name = page.getByLabel('Plan name', { exact: true });
  await name.fill('Submitted');
  await page.getByRole('button', { name: 'Save revision' }).click();
  await expect(page.getByRole('button', { name: 'Saving…', exact: true })).toBeVisible();
  await name.fill('Typed during save');
  await page.evaluate(async id => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState(state => ({ clientPlans: state.clientPlans.map(plan => plan.id === id
      ? { ...plan, name: 'Remote after submission', taxRateBps: 900, version: (plan.version || 0) + 1 }
      : plan) }));
    (window as unknown as { finishAuditSave: () => void }).finishAuditSave();
  }, draftId);
  await expect(name).toHaveValue('Typed during save');
  await expect(page.getByRole('button', { name: 'Save revision' })).toBeDisabled();
  await page.getByRole('button', { name: 'Keep my draft' }).click();
  await page.getByRole('button', { name: 'Use my value' }).click();
  await expect(page.getByLabel('Tax rate (%)', { exact: true })).toHaveValue('9');
  await expect(page.getByRole('button', { name: 'Save revision' })).toBeEnabled();
});

test('modified shortcuts open the palette without hijacking browser commands', async ({ page }) => {
  await seedPlan(page);
  await page.keyboard.press('Meta+k');
  await expect(page.getByRole('heading', { name: 'Command palette' })).toBeAttached();
  await page.getByRole('textbox', { name: 'Search pages and actions...' }).fill('Notifications');
  await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/notifications$/);
  await page.goto('/tasks');
  await page.getByRole('button', { name: 'Table', exact: true }).click();
  await page.keyboard.press('Control+b');
  await expect(page.getByRole('button', { name: 'Table', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('unknown links show a localized recovery page', async ({ page }) => {
  await page.goto('/missing-audit-route');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await page.getByRole('link', { name: 'Return to workspace' }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test('a delayed All pagination response cannot contaminate the Unread filter', async ({ page }) => {
  // Substitute only the feed transport to deterministically order its responses.
  await page.route('**/src/lib/notificationFeed.ts', route => route.fulfill({ contentType: 'application/javascript', body: `
    import { loadNotificationFeedPage as original } from '/src/lib/notificationFeed.ts?audit-original';
    export const loadNotificationFeedPage = (...args) => window.auditFeed ? window.auditFeed(...args) : original(...args);
  ` }));
  await seedPlan(page);
  await page.evaluate(() => {
    const runtime = window as unknown as { auditFeed: (...args: unknown[]) => Promise<unknown>; resolveOldFeed?: () => void };
    const item = (id: string, title: string, isRead: boolean) => ({ id, title, message: title, targetUserId: 'u-boss', isRead, category: 'system', iconType: 'status', createdAt: '2026-09-30T00:00:00Z', route: { page: 'tasks' } });
    runtime.auditFeed = async (_user, _notifications, options: unknown) => {
      const query = options as { cursor?: unknown; unreadOnly?: boolean };
      if (query.cursor) return new Promise(resolve => { runtime.resolveOldFeed = () => resolve({ items: [item('stale', 'Stale read item', true)], unreadCount: 9 }); });
      return { items: [item(query.unreadOnly ? 'unread' : 'all', query.unreadOnly ? 'Current unread item' : 'All first page', false)], unreadCount: 1, nextCursor: query.unreadOnly ? undefined : { createdAt: '2026-09-30T00:00:00Z', id: 'all' } };
    };
  });
  await page.keyboard.press('Meta+k');
  await page.getByRole('textbox', { name: 'Search pages and actions...' }).fill('Notifications');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Load more' })).toBeVisible();
  await page.getByRole('button', { name: 'Load more' }).click();
  await page.getByRole('button', { name: /^Unread/ }).click();
  await expect(page.getByText('Current unread item').first()).toBeVisible();
  await page.evaluate(() => (window as unknown as { resolveOldFeed: () => void }).resolveOldFeed());
  await expect(page.getByText('Stale read item')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Unread (1)', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('sidebar logout and same-tab login restart synchronization listeners', async ({ page }) => {
  await seedPlan(page);
  await page.getByRole('button', { name: 'Logout', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Email or username').fill('Boss Koo');
  await page.getByLabel('Password', { exact: true }).fill('password123');
  await page.getByRole('button', { name: 'Access Dashboard' }).click();
  await expect(page).not.toHaveURL(/\/login$/);
  const continueButton = page.getByRole('button', { name: 'Continue for now' });
  if (await continueButton.isVisible()) await continueButton.click();
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  expect(await page.evaluate(async () => { const { useStore } = await import('/src/store/index.ts'); return useStore.getState().backend.status; })).toBe('offline');
});

test('a dirty revision requires confirmation before changing tabs', async ({ page }) => {
  await seedPlan(page);
  await page.getByLabel('Plan name', { exact: true }).fill('Unsaved draft');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('tab', { name: 'Overview', exact: true }).click();
  await expect(page.getByLabel('Plan name', { exact: true })).toHaveValue('Unsaved draft');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('tab', { name: 'Overview', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Overview', exact: true })).toHaveAttribute('aria-selected', 'true');
});

test('a failed save does not mistake its own optimistic draft for a remote conflict', async ({ page }) => {
  await seedPlan(page);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ commitPendingMutation: async () => ({ ok: false, error: 'The revision is waiting to be saved.' }) });
  });
  await page.getByLabel('Plan name', { exact: true }).fill('Pending own draft');
  await page.getByRole('button', { name: 'Save revision' }).click();
  await expect(page.getByText('The revision is waiting to be saved.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reload latest' })).toHaveCount(0);
  await expect(page.getByLabel('Plan name', { exact: true })).toHaveValue('Pending own draft');
});


test('browser back and programmatic palette navigation preserve a declined draft', async ({ page }) => {
  const { clientId } = await seedPlan(page);
  await page.getByLabel('Plan name', { exact: true }).fill('Protected draft');
  let prompts = 0;
  page.on('dialog', async dialog => { prompts += 1; await dialog.dismiss(); });
  await page.evaluate(() => history.back());
  await expect.poll(() => prompts).toBe(1);
  await expect(page).toHaveURL(new RegExp(`/clients/${clientId}$`));
  await expect(page.getByLabel('Plan name', { exact: true })).toHaveValue('Protected draft');
  await page.keyboard.press('Escape');
  await page.getByLabel('Plan name', { exact: true }).blur();
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await expect(palette).toBeVisible();
  await palette.getByRole('textbox').fill('Notifications');
  await page.keyboard.press('Enter');
  await expect.poll(() => prompts).toBe(2);
  await expect(page).toHaveURL(new RegExp(`/clients/${clientId}$`));
});

test('recoverable drafts survive reload and reconcile against the latest baseline', async ({ page }) => {
  await seedPlan(page);
  await page.getByLabel('Plan name', { exact: true }).fill('Recovered draft');
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('aitask:draft-recovery:v1:')).length)).toBe(1);
  page.on('dialog', dialog => dialog.accept());
  await page.reload();
  await page.getByRole('tab', { name: 'Plan', exact: true }).click();
  await page.getByRole('button', { name: 'Restore recovered draft' }).click();
  await expect(page.getByLabel('Plan name', { exact: true })).toHaveValue('Recovered draft');
  await expect(page.getByRole('button', { name: 'Save revision' })).toBeDisabled();
  await page.getByRole('button', { name: 'Keep my draft' }).click();
  await page.getByRole('button', { name: 'Save revision' }).click();
  await expect(page.getByText('Draft revision saved.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('aitask:draft-recovery:v1:')).length)).toBe(0);
});

test('field-level service reconciliation preserves independent remote changes', async ({ page }) => {
  const { draftId } = await seedPlan(page);
  await page.getByRole('textbox', { name: 'Service name', exact: true }).fill('Local design');
  await page.evaluate(async id => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState(state => ({ clientPlans: state.clientPlans.map(plan => plan.id === id ? { ...plan, serviceItems: plan.serviceItems.map(item => ({ ...item, quantity: 4 })), version: (plan.version || 0) + 1 } : plan) }));
  }, draftId);
  await page.getByRole('button', { name: 'Keep my draft' }).click();
  await expect(page.getByRole('textbox', { name: 'Service name', exact: true })).toHaveValue('Local design');
  await expect(page.getByLabel('Quantity', { exact: true })).toHaveValue('4');
  await expect(page.getByRole('button', { name: 'Use my value' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Save revision' }).click();
});

test('two tabs retain independent recovery copies and account changes clear owned drafts', async ({ page, context }) => {
  const { clientId } = await seedPlan(page);
  await page.getByLabel('Plan name', { exact: true }).fill('Tab A');
  const second = await context.newPage();
  await second.goto('/login');
  await second.evaluate(async () => { const { useStore } = await import('/src/store/index.ts'); const { enablePasswordResetBypass } = await import('/src/lib/auth.ts'); const actor = useStore.getState().currentUser; if (actor) enablePasswordResetBypass(actor.id); });
  await second.goto(`/clients/${clientId}`);
  await second.getByRole('tab', { name: 'Plan', exact: true }).click();
  await second.getByLabel('Plan name', { exact: true }).fill('Tab B');
  const values = await second.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('aitask:draft-recovery:v1:')).map(key => JSON.parse(localStorage.getItem(key)!).value.name).sort());
  expect(values).toEqual(['Tab A', 'Tab B']);
  await page.evaluate(async () => { const { clearWorkspaceSession } = await import('/src/store/index.ts'); clearWorkspaceSession({ discardPending: true }); });
  expect(await second.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('aitask:draft-recovery:v1:')).length)).toBe(0);
  await second.close();
});

test('upload recovery observes command ownership and acknowledgements from another tab', async ({ page, context }) => {
  await seedPlan(page);
  const file = { id: 'cross-tab-upload', bucket: 'client-service-files', path: 'workspace/client/cycle/cross-tab.pdf', uploadedBy: 'audit-actor', fileName: 'cross-tab.pdf', mimeType: 'application/pdf', sizeBytes: 10, uploadedAt: '2026-10-02T00:00:00Z' };
  await page.evaluate(async attachment => {
    const files = await import('/src/lib/serviceFiles.ts');
    files.trackPendingServiceFile(attachment);
  }, file);
  const second = await context.newPage();
  await second.goto('/login');
  await second.evaluate(async attachment => {
    const files = await import('/src/lib/serviceFiles.ts');
    files.bindPendingServiceFiles('cross-tab-command', [{ attachments: [attachment] }]);
  }, file);
  const pending = await page.evaluate(async () => (await import('/src/lib/serviceFiles.ts')).listPendingServiceFiles('audit-actor'));
  expect(pending).toEqual([expect.objectContaining({ commandId: 'cross-tab-command' })]);
  await second.evaluate(async () => (await import('/src/lib/serviceFiles.ts')).acknowledgePendingServiceFiles('cross-tab-command'));
  expect(await page.evaluate(async () => (await import('/src/lib/serviceFiles.ts')).listPendingServiceFiles('audit-actor'))).toEqual([]);
  await second.close();
});
