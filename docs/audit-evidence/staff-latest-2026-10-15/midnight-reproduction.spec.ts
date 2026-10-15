import { test, expect } from '@playwright/test';
test.use({ timezoneId:'Asia/Kuala_Lumpur' });
test('Staff All work refreshes its action queue at local midnight', async ({ page }) => {
  await page.clock.install({ time:new Date('2026-10-14T15:59:50Z') });
  await page.clock.pauseAt(new Date('2026-10-14T15:59:59Z'));
  await page.goto('/login');
  await page.evaluate(async () => {
    const { useStore, stopBackendAutoSync } = await import('/src/store/index.ts');
    const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
    stopBackendAutoSync(); const old=useStore.getState();
    const user={ id:'midnight-worker', name:'Midnight Worker', role:'Staff', departments:['Designer'], mustResetPassword:false };
    enablePasswordResetBypass(user.id); localStorage.setItem('aitask:locale','en'); localStorage.setItem(`aitask:release-notice:2026-08-service-operations:${user.id}`,'acknowledged');
    const task={id:'midnight-work',title:'Tomorrow artwork',clientName:'Audit Company',serviceType:'Design',description:'',department:'Designer',assignedTo:user.id,createdBy:'audit-pm',startDate:'2026-10-01',dueDate:'2026-10-15',priority:'Medium',status:'Pending',isCompleted:false,completionPercentage:0,revisionCount:0,clientApprovalStatus:'Pending',isRecurring:false};
    useStore.setState({currentUser:user,users:[user],tasks:[task],clients:[],projects:[],notifications:[],rolePermissions:[],serviceCycles:[],deliverables:[],clientPlans:[],backend:{...old.backend,mode:'local',status:'local',hasLocalChanges:false,pendingMutations:0}});
  });
  await page.goto('/tasks');
  await expect(page.getByRole('tab',{name:/Up next/})).toContainText('1');
  await page.clock.runFor(2000);
  console.log('Clock after midnight:',await page.evaluate(()=>new Date().toISOString()));
  await expect(page.getByRole('tab',{name:/Needs action/})).toContainText('1');
});
