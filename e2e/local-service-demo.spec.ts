import { expect, test } from '@playwright/test';

const urbanWorkspace = '/clients/demo-service-client-urban';

const setDemoUser = async (page: import('@playwright/test').Page, userId: string) => {
  await page.evaluate(async id => {
    const { useStore } = await import('/src/store/index.ts');
    const user = useStore.getState().users.find(candidate => candidate.id === id)!;
    localStorage.setItem(`aitask:release-notice:2026-08-service-operations:${id}`, 'acknowledged');
    useStore.setState({ currentUser: { ...user, mustResetPassword: false } });
  }, userId);
};

test('local service demo makes plans, delivery, files, roles, and price isolation explorable', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/login');

  await expect(page.getByRole('button', { name: 'Use Operation Demo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use Account Demo' })).toBeVisible();
  const seeded = await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const state = useStore.getState();
    return {
      clients: state.clients.map(client => client.clientName),
      plans: state.clientPlans.map(plan => ({ client: plan.clientName, origin: plan.origin, status: plan.status })),
      cycles: state.serviceCycles.length,
      tasks: state.tasks.filter(task => task.id.startsWith('demo-service-task-')).length,
    };
  });
  expect(seeded.clients).toEqual(expect.arrayContaining(['UrbanEats', 'TechNova', 'EcoLife']));
  expect(seeded.plans).toEqual(expect.arrayContaining([
    { client: 'UrbanEats', origin: 'standard', status: 'Active' },
    { client: 'TechNova', origin: 'customized', status: 'Active' },
    { client: 'EcoLife', origin: 'custom', status: 'Draft' },
  ]));
  expect(seeded.cycles).toBeGreaterThanOrEqual(3);
  expect(seeded.tasks).toBe(12);

  await setDemoUser(page, 'u-boss');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Explore the service demo' })).toBeVisible();
  await page.getByRole('link', { name: 'Open UrbanEats' }).click();
  await expect(page.getByRole('heading', { name: 'UrbanEats' })).toBeVisible();
  await page.getByRole('tab', { name: 'Plan', exact: true }).click();
  await expect(page.getByText('Internal monthly total')).toBeVisible();
  await expect(page.getByText('Short Video Production · rev 1 · 10 tasks')).toBeVisible();
  await page.getByRole('tab', { name: 'Cycles', exact: true }).click();
  await expect(page.getByText('10 linked task(s) · Short Video Production', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Activity / Files' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'UrbanEats-monthly-content-brief.txt' }).click();
  expect((await download).suggestedFilename()).toBe('UrbanEats-monthly-content-brief.txt');

  await page.goto('/settings');
  await expect(page.getByRole('button', { name: 'Reset sample workspace' })).toBeVisible();

  await setDemoUser(page, 'u-operation-demo-local');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Operation workbench' })).toBeVisible();
  await page.goto(urbanWorkspace);
  await page.getByRole('tab', { name: 'Plan', exact: true }).click();
  await expect(page.getByText('Internal monthly total')).toHaveCount(0);

  await setDemoUser(page, 'u-account-demo-local');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Account & Finance workbench' })).toBeVisible();
  await expect(page.getByText('Monthly management value')).toBeVisible();

  await setDemoUser(page, 'u-client-urban');
  await page.goto(urbanWorkspace);
  await page.getByRole('tab', { name: 'Activity / Files' }).click();
  await expect(page.getByText('The monthly content brief is ready.')).toBeVisible();
  await expect(page.getByText('hidden from the client portal')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Plan', exact: true }).click();
  await expect(page.getByText('Internal monthly total')).toHaveCount(0);
});
