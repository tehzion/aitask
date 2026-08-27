import { expect, test } from '@playwright/test';

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

const qaClientId = required('STAGING_QA_CLIENT_ID');
const qaClientName = required('STAGING_QA_CLIENT_NAME');
const qaClientTaskId = required('STAGING_QA_CLIENT_TASK_ID');
const qaForeignTaskId = required('STAGING_QA_FOREIGN_TASK_ID');

const signIn = async (page: import('@playwright/test').Page, role: QaRole) => {
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

test('release QA roles can access their scoped staging workspace', async ({ browser }) => {
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

test('service workspace is visible to internal roles and scoped for the client', async ({ browser }) => {
  for (const role of ['SUPER_ADMIN', 'OPERATION', 'ACCOUNT'] as const) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await signIn(page, role);
    await page.goto(`/clients/${encodeURIComponent(qaClientId)}`);
    await expect(page.getByText(qaClientName, { exact: true })).toBeVisible();
    await context.close();
  }

  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, 'CLIENT');
  await page.goto(`/clients/${encodeURIComponent(qaClientId)}`);
  await expect(page.getByRole('tab', { name: 'Deliveries', exact: true })).toBeVisible();
  await expect(page.getByText(/linked task|internal monthly total/i)).toHaveCount(0);
  await context.close();
});

test('client delivery focus is scoped to the QA company', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, 'CLIENT');

  await page.goto(`/tasks?taskId=${encodeURIComponent(qaClientTaskId)}`);
  await expect(page.getByRole('dialog', { name: 'Delivery details' })).toBeVisible();

  await page.goto(`/tasks?taskId=${encodeURIComponent(qaForeignTaskId)}`);
  await expect(page.getByText('This delivery is not available for your company.')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Delivery details' })).toHaveCount(0);
  await context.close();
});
