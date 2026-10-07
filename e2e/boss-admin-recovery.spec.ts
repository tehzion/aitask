import { expect, test, type Page } from '@playwright/test';

const seedBoss = async (page: Page) => {
  await page.goto('/login');
  await expect(page.getByLabel('Email or username')).toBeVisible();
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
    const state = useStore.getState();
    const boss = state.users.find(user => user.isSuperAdmin)!;
    enablePasswordResetBypass(boss.id);
    localStorage.setItem(`aitask:release-notice:2026-08-service-operations:${boss.id}`, 'acknowledged');
    useStore.setState({
      currentUser: { ...boss, mustResetPassword: false },
      users: [boss, { id: 'boss-audit-member', name: 'Audit Member', role: 'Staff', departments: ['Designer'], department: 'Designer' }],
      clients: [{ id: 'boss-audit-company', clientName: 'Audit Company', createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z' }],
      registrations: [
        { id: 'boss-audit-staff', name: 'Audit Applicant', email: 'applicant@example.test', phone: '+60120000001', jobPosition: 'Designer', requestedRole: 'Staff', status: 'Pending', createdAt: '2026-09-01T00:00:00Z' },
        { id: 'boss-audit-client', name: 'Audit Client', email: 'client@example.test', phone: '+60120000002', jobPosition: 'Client', requestedRole: 'Client', status: 'Pending', createdAt: '2026-09-02T00:00:00Z' },
      ],
      backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 },
    });
  });
};

const delayCommit = async (page: Page) => {
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    (window as unknown as { finishBossSave: () => void }).finishBossSave = () => {};
    useStore.setState({ commitPendingMutation: () => new Promise(resolve => {
      (window as unknown as { finishBossSave: () => void }).finishBossSave = () => resolve({ ok: true });
    }) });
  });
};

const finishCommit = (page: Page) => page.evaluate(() => (window as unknown as { finishBossSave: () => void }).finishBossSave());

for (const mobile of [false, true]) {
test(`${mobile ? 'mobile' : 'desktop'} restored client registration initializes its requested role`, async ({ page }) => {
  if (mobile) await page.setViewportSize({ width: 390, height: 844 });
  await seedBoss(page);
  await page.goto('/approvals?tab=registrations&registrationId=boss-audit-client');
  const review = page.locator('[aria-labelledby="approval-review-title-boss-audit-client"]');
  await expect(review).toHaveCount(1);
  await expect(review.getByLabel('System role')).toHaveValue('Client');
  await expect(review.getByLabel('Client company')).toBeVisible();
});

test(`${mobile ? 'mobile' : 'desktop'} failed approval keeps the selected review, department and error`, async ({ page }) => {
  if (mobile) await page.setViewportSize({ width: 390, height: 844 });
  await seedBoss(page);
  await page.goto('/approvals');
  await page.locator(mobile ? 'article' : 'tr').filter({ hasText: 'Audit Applicant' }).getByRole('button', { name: 'Approve', exact: true }).click();
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ commitPendingMutation: async () => ({ ok: false, error: 'Audit approval rejection' }) });
  });
  await page.getByRole('button', { name: 'Confirm & approve' }).click();
  const review = page.locator('[aria-labelledby="approval-review-title-boss-audit-staff"]');
  await expect(review).toBeVisible();
  await expect(review.getByRole('alert')).toHaveText('Audit approval rejection');
  await expect(page).toHaveURL(/registrationId=boss-audit-staff/);
});
}

test('bulk approval assigns Staff even when an applicant requested Project Manager', async ({ page }) => {
  await seedBoss(page);
  await page.goto('/approvals');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ registrations: useStore.getState().registrations.map(reg => reg.id === 'boss-audit-staff' ? { ...reg, requestedRole: 'Project Manager' } : reg) });
  });
  await page.getByRole('row').filter({ hasText: 'Audit Applicant' }).getByRole('checkbox').check();
  await page.getByRole('button', { name: /^Approve selected/ }).click();
  await page.getByRole('dialog', { name: 'Approve registrations' }).getByRole('button', { name: 'Approve registrations', exact: true }).click();
  await expect.poll(() => page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    return useStore.getState().users.find(user => user.name === 'Audit Applicant')?.role;
  })).toBe('Staff');
});

test('bulk approval assigns Staff and reports only confirmed approvals', async ({ page }) => {
  await seedBoss(page);
  await page.goto('/approvals');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ registrations: useStore.getState().registrations.map(reg => reg.id === 'boss-audit-client' ? { ...reg, name: 'Audit Member', email: 'duplicate@example.test', jobPosition: 'Designer', requestedRole: 'Staff' } : reg) });
    const { useToastStore } = await import('/src/store/useToastStore.ts');
    const originalAddToast = useToastStore.getState().addToast;
    const messages: unknown[] = [];
    (window as unknown as { bossApprovalMessages: unknown[] }).bossApprovalMessages = messages;
    useToastStore.setState({ addToast: (message, type) => {
      messages.push(message);
      originalAddToast(message, type);
    } });
  });
  await page.getByRole('row').filter({ hasText: 'Audit Applicant' }).getByRole('checkbox').check();
  await page.getByRole('row').filter({ hasText: 'duplicate@example.test' }).getByRole('checkbox').check();
  await page.getByRole('button', { name: /^Approve selected/ }).click();
  await page.getByRole('dialog', { name: 'Approve registrations' }).getByRole('button', { name: 'Approve registrations', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { bossApprovalMessages: unknown[] }).bossApprovalMessages))
    .toContainEqual(expect.objectContaining({ id: 'approval.bulkApproveFailed', values: expect.objectContaining({ approved: 1, failed: 1 }) }));
  await expect(page.getByText(/Unable to approve: Audit Member/)).toBeVisible();
});

test('bulk approval follows its Staff confirmation for Client applicants', async ({ page }) => {
  await seedBoss(page);
  await page.goto('/approvals');
  await page.getByRole('row').filter({ hasText: 'Audit Client' }).getByRole('checkbox').check();
  await page.getByRole('button', { name: /^Approve selected/ }).click();
  await page.getByRole('dialog', { name: 'Approve registrations' }).getByRole('button', { name: 'Approve registrations', exact: true }).click();
  await expect.poll(() => page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    return useStore.getState().registrations.find(reg => reg.id === 'boss-audit-client')?.status;
  })).toBe('Pending');
  await expect(page.getByText(/Unable to approve: Audit Client/)).toBeVisible();
});

test('role save locks edits and repeated submissions while awaiting persistence', async ({ page }) => {
  await seedBoss(page);
  await page.goto('/approvals?tab=roles');
  await delayCommit(page);
  const name = page.getByPlaceholder('e.g. Account Manager');
  await name.fill('Audit Custom Role');
  await page.getByRole('button', { name: 'Create Role', exact: true }).click();
  await expect(name).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Saving…', exact: true })).toBeDisabled();
  await finishCommit(page);
  await expect(name).toBeEnabled();
  await expect(name).toHaveValue('');
});

test('failed role creation retries persistence without creating the role twice', async ({ page }) => {
  await seedBoss(page);
  await page.goto('/approvals?tab=roles');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    let calls = 0;
    useStore.setState({ commitPendingMutation: async () => ++calls === 1 ? { ok: false, error: 'Audit role save rejection' } : { ok: true } });
  });
  const name = page.getByPlaceholder('e.g. Account Manager');
  await name.fill('Audit Retry Role');
  await page.getByRole('button', { name: 'Create Role', exact: true }).click();
  await expect(page.getByText('Audit role save rejection', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Retry save', exact: true }).click();
  await expect(name).toHaveValue('');
  await expect.poll(() => page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    return useStore.getState().rolePermissions.filter(role => role.name === 'Audit Retry Role').length;
  })).toBe(1);
});

test('failed Client role assignment preserves the company draft for retry', async ({ page }) => {
  await seedBoss(page);
  await page.goto('/approvals?tab=members');
  const member = page.getByRole('row').filter({ hasText: 'Audit Member' });
  await member.getByRole('combobox').selectOption('role:client');
  const company = member.getByLabel('Company', { exact: true });
  await company.selectOption('Audit Company');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.setState({ changeMemberRole: async () => ({ ok: false, error: 'Audit role assignment rejection' }) });
  });
  await member.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(company).toHaveValue('Audit Company');
  await expect(page.getByText('Audit role assignment rejection', { exact: true })).toBeVisible();
});
