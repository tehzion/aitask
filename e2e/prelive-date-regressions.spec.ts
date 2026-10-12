import { expect, test } from '@playwright/test';

const login = async (page: import('@playwright/test').Page, time: string) => {
  await page.clock.install({ time: new Date(time) });
  await page.clock.pauseAt(new Date(new Date(time).getTime() + 1000));
  await page.goto('/login');
  await page.getByLabel('Email or username').fill('Boss Koo');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Access Dashboard' }).click();
  await page.waitForURL(url => ['/', '/settings'].includes(url.pathname));
  if (page.url().endsWith('/settings')) await page.getByRole('button', { name: 'Continue for now' }).click();
  await page.getByRole('button', { name: 'Happy working' }).click();
  await expect(page.getByRole('heading', { name: 'Agency operations' })).toBeVisible();
};

const setSingleTask = async (page: import('@playwright/test').Page) => {
  await page.evaluate(async () => {
    const { useStore, stopBackendAutoSync } = await import('/src/store/index.ts');
    stopBackendAutoSync();
    const state = useStore.getState();
    const template = state.tasks[0];
    useStore.setState({ tasks: [{ ...template, id:'audit-delivery-midnight', title:'Delivery midnight fixture', clientId:'audit-date-client', clientName:'Audit date client', startDate:'2026-10-07',dueDate:'2026-10-07',status:'Pending',isCompleted:false,completionPercentage:0,assignedTo:state.currentUser!.id,createdBy:state.currentUser!.id }], clients:[{id:'audit-date-client',clientName:'Audit date client',createdBy:state.currentUser!.id,createdAt:'2026-10-07T16:00:00Z',updatedAt:'2026-10-07T16:00:00Z'}],projects:[],clientPlans:[],serviceCycles:[],deliverables:[] });
  });
};

test.use({ timezoneId: 'Asia/Jakarta' });

for (const resume of [false, true]) test(`Delivery tracker refreshes at ${resume ? 'resume' : 'midnight'}`, async ({page}) => {
  await login(page, '2026-10-07T16:59:50Z');
  await setSingleTask(page);
  await page.goto('/clients');
  const overdue = page.locator('[aria-label="Delivery tracker summary"] > span').filter({hasText:'Overdue'});
  await expect(overdue).toContainText('0');
  if (resume) await page.clock.setSystemTime(new Date('2026-10-07T17:00:01Z'));
  else await page.clock.fastForward(10000);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(overdue).toContainText('1');
});

for (const [timezoneId, time] of [['Asia/Jakarta', '2026-10-07T17:30:00Z'], ['America/New_York', '2026-10-09T00:30:00Z']]) test.describe(timezoneId, () => {
 test.use({ timezoneId });
 test('New plan wizard defaults to local today', async ({page}) => {
  await login(page, time);
  await setSingleTask(page);
  await page.goto('/clients/audit-date-client');
  await page.getByRole('tab', {name:'Plan',exact:true}).click();
  await page.getByRole('button', {name:'Add service plan'}).click();
  const summary = page.getByRole('complementary', {name:'Draft summary'});
  await expect(summary).toContainText('2026-10-08');
  await expect(summary).toContainText('Day 8');
 });
});

test('Calendar does not render a seventh Sunday task column', async ({page}) => {
  await login(page,'2026-10-07T17:30:00Z');
  await setSingleTask(page);
  await page.evaluate(async () => {
    const {useStore}=await import('/src/store/index.ts');
    const template=useStore.getState().tasks[0];
    useStore.setState({tasks:[{...template,id:'audit-sunday',title:'Sunday-only fixture',startDate:'2026-10-11',dueDate:'2026-10-11'},{...template,id:'audit-mon-sun',title:'Full week fixture',startDate:'2026-10-05',dueDate:'2026-10-11'}]});
  });
  await page.goto('/calendar');
  const bars=page.getByRole('group',{name:/^(Sunday-only|Full week) fixture\./});
  await expect(bars).toHaveCount(1);
  await expect(bars).toHaveAttribute('style', /span 6/);
  await expect(page.locator('[data-calendar-date="2026-10-11"]')).toHaveCount(0);
  await expect(page.getByRole('button',{name:/Edit dates for Sunday-only fixture/})).toHaveCount(0);
});
