import { expect, test, type Page } from '@playwright/test';

const rawTechnicalText = /\[object Object\]|row-level security|aitask_entities|PGRST\d+|Cannot read properties|Failed to fetch/;
const seed = async (page: Page, role: string, locale: 'en' | 'zh') => {
  await page.clock.install({ time: new Date('2026-10-19T12:00:00.000Z') });
  // Demo avatars point at a third-party image host; serve a local pixel so a
  // blocked or slow network cannot raise a photo-preview alert.
  await page.route('https://i.pravatar.cc/**', route => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64') }));
  await page.goto('/login');
  // Let the app finish its startup load so seeded state is not overwritten.
  await page.waitForFunction(() => Boolean(document.querySelector('form input, main')));
  return page.evaluate(async ({ role, locale }) => {
    const { useStore, stopBackendAutoSync } = await import('/src/store/index.ts');
    const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
    const { canAccessPath } = await import('/src/lib/access.ts');
    stopBackendAutoSync();
    const state = useStore.getState();
    const user = state.users.find(item => role === 'Boss' ? item.isSuperAdmin : item.role === role && !item.isSuperAdmin)!;
    const actor = { ...user, mustResetPassword: false };
    enablePasswordResetBypass(actor.id);
    localStorage.setItem('aitask:locale', locale);
    localStorage.setItem('aitask-color-theme', locale === 'zh' ? 'dark' : 'light');
    localStorage.setItem(`aitask:release-notice:2026-08-service-operations:${actor.id}`, 'acknowledged');
    const today = new Date().toISOString().slice(0, 10);
    useStore.setState({ currentUser: actor, tasks: [{ ...state.tasks[0], id: 'message-audit-task', title: 'Message audit artwork', clientId: 'message-audit-company', clientName: actor.companyName || 'Message audit company', department: actor.department === 'Client' ? 'Designer' : actor.department || 'Designer', assignedTo: actor.id, createdBy: actor.id, assignedBy: actor.id, startDate: today, dueDate: today, status: 'Pending', isCompleted: false, clientApprovalStatus: 'Pending', attachmentLink: undefined, visibility: 'client-visible', deliverableId: undefined, serviceCycleId: undefined, generatedFromDeliverable: undefined, workflowStepId: undefined, workflowStepKind: undefined, predecessorTaskIds: [], workState: {}, workHistory: [], comments: [], approvalHistory: [] }], backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0, error: undefined, conflict: undefined, upgradeRequired: false, hasRemoteUpdate: false } });
    return ['/', '/tasks', '/calendar', '/clients', '/projects', '/reports', '/approvals', '/notifications', '/settings'].filter(route => canAccessPath(actor, route, state.rolePermissions));
  }, { role, locale });
};

for (const locale of ['en', 'zh'] as const) {
  for (const role of ['Boss', 'HOD', 'Project Manager', 'Staff', 'Client']) {
    test(`${role} ${locale}: accessible pages render without unexpected errors`, async ({ page }) => {
      test.setTimeout(90_000);
      if (locale === 'zh') await page.setViewportSize({ width: 390, height: 844 });
      const crashes: string[] = [];
      page.on('pageerror', error => crashes.push(error.message));
      const routes = await seed(page, role, locale);
      expect(routes.length).toBeGreaterThan(2);
      for (const route of routes) {
        await page.goto(route);
        await expect(page.locator('main')).toBeVisible();
        await expect(page.locator('main h1, main h2').first()).toBeVisible();
        await expect(page.locator('[role="alert"]')).toHaveCount(0);
        await expect(page.locator('body')).not.toContainText(/useI18n must be|hit an unexpected error|Reload AiTask/);
        const systemFeedback = await page.locator('[role="status"]').allTextContents();
        expect(systemFeedback.join(' ')).not.toMatch(rawTechnicalText);
        expect(crashes, `${role} ${locale} ${route}`).toEqual([]);
      }
    });
  }

  for (const failure of ['network', 'permission'] as const) {
    test(`Calendar ${locale}: ${failure} failure explains recovery and preserves attempted dates`, async ({ page }, testInfo) => {
      await seed(page, 'Staff', locale);
      await page.goto('/calendar');
      await page.getByRole('button', { name: `${locale === 'zh' ? '编辑日期：' : 'Edit dates for'} Message audit artwork`, exact: false }).first().click();
      const dialog = page.getByRole('dialog', { name: locale === 'zh' ? '编辑任务日期' : 'Edit task dates' });
      await expect(dialog).toBeVisible();
      await page.evaluate(async failure => {
        const { useStore } = await import('/src/store/index.ts');
        useStore.setState({ commitPendingMutation: async () => {
          if (failure === 'network') throw new TypeError('Failed to fetch');
          return { ok: false, code: 'FORBIDDEN', error: 'new row violates row-level security policy for table "aitask_entities"' };
        } });
      }, failure);
      const attempted = '2026-12-20';
      await dialog.locator('input[type="date"]').last().fill(attempted);
      await dialog.getByRole('button', { name: locale === 'zh' ? '保存日期' : 'Save dates', exact: true }).click();
      await expect(dialog.getByRole('alert').first()).toContainText(failure === 'network' ? (locale === 'zh' ? '检查网络连接' : 'Check your connection') : (locale === 'zh' ? '访问权限' : 'check your access'));
      await expect(dialog).not.toContainText(rawTechnicalText);
      await expect(dialog.locator('input[type="date"]').last()).toHaveValue(attempted);
      await expect(dialog.getByRole('button', { name: locale === 'zh' ? '恢复已保存日期' : 'Restore saved dates', exact: true })).toBeEnabled();
      await expect(dialog).not.toContainText(locale === 'zh' ? '使用最新版本' : 'Use latest');
      if (failure === 'permission') await expect(dialog).toContainText(locale === 'zh' ? '任务负责人检查您的权限' : 'task owner to check your access');
      await page.screenshot({ path: testInfo.outputPath(`calendar-${locale}-${failure}.png`), fullPage: true });
    });
  }

  test(`Toast ${locale}: database rejection is localized`, async ({ page }) => {
    await seed(page, 'HOD', locale);
    await page.goto('/tasks');
    await page.evaluate(async () => {
      const { useToastStore } = await import('/src/store/useToastStore.ts');
      useToastStore.getState().addToast('duplicate key value violates unique constraint "aitask_entities_pkey"', 'error');
    });
    await expect(page.getByRole('alert')).toContainText(locale === 'zh' ? '已有相同的记录' : 'A matching record already exists');
    await expect(page.getByRole('alert')).not.toContainText(rawTechnicalText);
  });

  test(`Full edit ${locale}: raw save errors are localized while task content stays unchanged`, async ({ page }) => {
    await seed(page, 'Project Manager', locale);
    await page.goto('/tasks?taskId=message-audit-task');
    await page.getByRole('dialog', { name: 'Message audit artwork', exact: true }).getByRole('button', { name: locale === 'zh' ? '编辑任务' : 'Edit task', exact: true }).click();
    const dialog = page.getByRole('dialog').last();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: locale === 'zh' ? '编辑' : 'Edit', exact: true }).click();
    await dialog.getByLabel(locale === 'zh' ? '任务标题' : 'Task Title', { exact: true }).fill('Failed to fetch');
    await page.evaluate(async () => {
      const { useStore } = await import('/src/store/index.ts');
      useStore.setState({ commitPendingMutation: async () => ({ ok: false, error: 'invalid input syntax for type uuid: "bad-value"' }) });
    });
    await dialog.getByRole('button', { name: locale === 'zh' ? '保存更改' : 'Save Changes', exact: true }).click();
    await expect(dialog.getByRole('alert').first()).toContainText(locale === 'zh' ? '检查填写的内容' : 'Review the fields');
    await expect(dialog.getByLabel(locale === 'zh' ? '任务标题' : 'Task Title', { exact: true })).toHaveValue('Failed to fetch');
  });

  test(`App update ${locale}: software refresh is distinct from saved-data recovery`, async ({ page }) => {
    await seed(page, 'Staff', locale);
    await page.goto('/settings');
    await expect(page.locator('main h1').first()).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event('aitask:pwa-update-ready')));
    await expect(page.getByText(locale === 'zh' ? '应用有新版本' : 'App update available', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: locale === 'zh' ? '立即刷新' : 'Refresh now', exact: true })).toBeEnabled();
  });

  test(`Conflict ${locale}: field names are readable and recovery uses saved data`, async ({ page }) => {
    await seed(page, 'Staff', locale);
    await page.goto('/settings');
    await page.evaluate(async () => {
      const { useStore } = await import('/src/store/index.ts');
      const { mountMessageProbe } = await import('/e2e/fixtures/uiMessageProbe.tsx');
      useStore.setState(state => ({ backend: { ...state.backend, status: 'conflict', conflict: { entityType: 'task', entityId: 'private-internal-id', expectedVersion: 1, actualVersion: 2, changedFields: ['dueDate', 'attachmentLink', 'unknownInternalKey'] } } }));
      mountMessageProbe('conflict');
    });
    const panel = page.locator('#message-probe');
    await expect(panel).toContainText(locale === 'zh' ? '已保存的记录已在其他位置更改' : 'The saved record changed elsewhere');
    await expect(panel).toContainText(locale === 'zh' ? '截止日期' : 'Due date');
    await expect(panel).not.toContainText(/dueDate|attachmentLink|unknownInternalKey|private-internal-id/);
    await expect(panel.getByRole('button', { name: locale === 'zh' ? '恢复已保存数据' : 'Restore saved data', exact: true })).toBeEnabled();
  });

  test(`Render recovery ${locale}: a crash explains reload without showing a runtime stack`, async ({ page }) => {
    await seed(page, 'Staff', locale);
    await page.goto('/settings');
    await page.evaluate(async () => {
      const { mountMessageProbe } = await import('/e2e/fixtures/uiMessageProbe.tsx');
      mountMessageProbe('crash');
    });
    const panel = page.locator('#message-probe');
    await expect(panel.getByRole('alert')).toContainText(locale === 'zh' ? '未保存的更改可能需要重新填写' : 'Changes that were not saved may need to be re-entered');
    await expect(panel).not.toContainText(/Cannot read properties|privateToken/);
    await expect(panel.getByRole('button', { name: locale === 'zh' ? '重新加载 AiTask' : 'Reload AiTask', exact: true })).toBeVisible();
  });

}
