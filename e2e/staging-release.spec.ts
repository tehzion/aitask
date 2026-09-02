import { expect, test, type Page } from '@playwright/test';

type QaRole = 'SUPER_ADMIN' | 'OPERATION' | 'PRODUCTION' | 'ACCOUNT' | 'CLIENT';

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for the authenticated staging release gate.`);
  return value;
};

const credentials = (role: QaRole) => ({
  email: required(`STAGING_QA_${role}_EMAIL`),
  password: required(`STAGING_QA_${role}_PASSWORD`),
});

const fixture = {
  clientId: 'CL-release-qa',
  clientName: 'Release QA Client',
  operationTaskId: 'TASK-release-qa-operation',
  productionTaskId: 'TASK-release-qa-client',
  approvalTaskId: 'TASK-release-qa-approval',
  accountTaskId: 'TASK-release-qa-account',
  foreignTaskId: 'TASK-release-qa-foreign',
};

const signIn = async (page: Page, role: QaRole) => {
  const account = credentials(role);
  await page.goto('/login');
  await page.getByLabel('Email or username').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByRole('button', { name: 'Access Dashboard' }).click();
  await page.waitForURL(url => !/\/login$/.test(url.pathname));
  if (/\/settings$/.test(page.url())) {
    throw new Error(`${role} staging account requires a password reset and cannot be used for release verification.`);
  }
};

const advanceClientWizard = async (page: Page, clientName: string) => {
  await page.goto('/clients');
  await page.getByRole('button', { name: 'New client' }).click();
  const dialog = page.getByRole('dialog', { name: 'Create client and service plan' });
  await dialog.getByLabel('Client / company name *').fill(clientName);
  await dialog.getByLabel('Email').fill('release-save-client@example.test');
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await dialog.getByRole('button', { name: /^Use standard package/ }).click();
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await expect(dialog.getByText('Ready to save as Draft')).toBeVisible();
  return dialog;
};

test('all five release roles can access their scoped staging workspace', async ({ browser }) => {
  const checks: Array<{ role: QaRole; expected: RegExp }> = [
    { role: 'SUPER_ADMIN', expected: /AiTask|Dashboard|Clients/ },
    { role: 'OPERATION', expected: /My work/ },
    { role: 'PRODUCTION', expected: /My work/ },
    { role: 'ACCOUNT', expected: /My work/ },
    { role: 'CLIENT', expected: /Home/ },
  ];

  for (const check of checks) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await signIn(page, check.role);
    await expect(page.locator('main')).toContainText(check.expected);
    await context.close();
  }
});

test('internal roles can follow the deterministic delivery task chain', async ({ browser }) => {
  const checks: Array<{ role: QaRole; taskId: string; title: string }> = [
    { role: 'OPERATION', taskId: fixture.operationTaskId, title: 'Release QA prepare content' },
    { role: 'PRODUCTION', taskId: fixture.productionTaskId, title: 'Release QA delivery ready' },
    { role: 'ACCOUNT', taskId: fixture.accountTaskId, title: 'Release QA account follow-up' },
  ];

  for (const check of checks) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await signIn(page, check.role);
    await page.goto(`/tasks?taskId=${encodeURIComponent(check.taskId)}`);
    await expect(page.getByText(check.title, { exact: true })).toBeVisible();
    await context.close();
  }
});

test('client workspace, review actions, isolation, and notification read state work', async ({ page }) => {
  await signIn(page, 'CLIENT');

  await page.goto(`/clients/${encodeURIComponent(fixture.clientId)}`);
  await expect(page.getByText(fixture.clientName, { exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Deliveries', exact: true })).toBeVisible();
  await expect(page.getByText(/linked task|internal monthly total/i)).toHaveCount(0);

  await page.goto(`/tasks?taskId=${encodeURIComponent(fixture.foreignTaskId)}`);
  await expect(page.getByText('This delivery is not available for your company.')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Delivery details' })).toHaveCount(0);

  await page.goto(`/tasks?taskId=${encodeURIComponent(fixture.productionTaskId)}`);
  const delivery = page.getByRole('dialog', { name: 'Delivery details' });
  await expect(delivery).toBeVisible();
  await delivery.getByPlaceholder('Optional approval or revision note...').fill('Please adjust the release QA delivery.');
  await delivery.getByRole('button', { name: 'Request changes' }).click();
  await expect(delivery.getByText('Changes requested', { exact: true })).toBeVisible();

  await page.goto(`/tasks?taskId=${encodeURIComponent(fixture.approvalTaskId)}`);
  const approval = page.getByRole('dialog', { name: 'Delivery details' });
  await expect(approval).toBeVisible();
  await approval.getByRole('button', { name: 'Approve' }).click();
  await expect(approval.getByText('Approved', { exact: true })).toBeVisible();

  await page.goto('/notifications');
  const notificationTitle = page.getByRole('heading', { name: 'Release QA delivery ready' });
  await expect(notificationTitle).toBeVisible();
  const notification = notificationTitle.locator('xpath=ancestor::article');
  await notification.getByRole('button', { name: 'Mark read' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Mark unread' })).toBeVisible();
});

test('client-plan save succeeds from the authenticated staging workspace', async ({ page }) => {
  await signIn(page, 'SUPER_ADMIN');
  const dialog = await advanceClientWizard(page, 'Release QA Saved Client');
  await dialog.getByRole('button', { name: 'Save draft plan' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Release QA Saved Client' })).toBeVisible();
});

test('an interrupted client-plan save retries the same change without a duplicate', async ({ page }) => {
  await signIn(page, 'SUPER_ADMIN');
  const dialog = await advanceClientWizard(page, 'Release QA Retry Client');
  const serviceCommand = '**/rest/v1/rpc/aitask_execute_service_command';
  await page.route(serviceCommand, route => route.abort('failed'), { times: 1 });
  await dialog.getByRole('button', { name: 'Save draft plan' }).click();
  await expect(dialog.getByRole('alert')).toContainText(/unable|failed|network|retry|save/i);
  await page.unroute(serviceCommand);
  await dialog.getByRole('button', { name: 'Retry save' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Release QA Retry Client' })).toBeVisible();

  await page.goto('/clients');
  await expect(page.getByText('Release QA Retry Client', { exact: true })).toHaveCount(1);
});
