import { expect, test } from '@playwright/test';

test('PM assignees follow the selected department and assigned HODs can accept work outside project membership', async ({ page }) => {
  await page.goto('/login');
  await page.waitForFunction(() => Boolean(document.querySelector('form input, main')));
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
    const state = useStore.getState();
    const base = state.users.find(user => user.name === 'Staff Demo')!;
    const users = [
      { ...base, id: 'policy-pm', name: 'Policy PM', role: 'Project Manager' as const, departments: ['Management' as const] },
      { ...base, id: 'policy-hod', name: 'Outside HOD', role: 'HOD' as const, departments: ['Video Editor' as const] },
      { ...base, id: 'policy-staff', name: 'Outside Staff', role: 'Staff' as const, departments: ['Video Editor' as const] },
    ].map(user => ({ ...user, department: user.departments[0], username: user.id, email: `${user.id}@aitask.local`, hasLogin: true, customRoleId: undefined, permissions: undefined, isSuperAdmin: false, mustResetPassword: false }));
    for (const user of users) {
      enablePasswordResetBypass(user.id);
      localStorage.setItem(`aitask:release-notice:2026-11-start-wording:${user.id}`, 'acknowledged');
    }
    localStorage.setItem('aitask:onboarding:v1', JSON.stringify(Object.fromEntries(users.map(user => [user.id, {status: 'skipped', updatedAt: new Date().toISOString()}]))));
    localStorage.setItem('aitask:locale', 'en');
    useStore.setState({ currentUser: users[0], users, rolePermissions: [], clients: [{ id:'policy-company', clientName:'Policy Co', createdBy:users[0].id,createdAt:'',updatedAt:'' }], projects: [{id:'policy-project',projectName:'Policy project',clientId:'policy-company',clientName:'Policy Co',projectManagerIds:[users[0].id],hodMemberIds:[],staffMemberIds:[],services:['Design'],startDate:'2026-11-01',deadline:''}], notifications:[],deliverables:[],serviceCycles:[],clientPlans:[], tasks:[{...state.tasks[0],id:'policy-task',title:'Policy assignment',clientName:'Policy Co',clientId:'policy-company',projectId:'policy-project',department:'Designer',createdBy:users[0].id,assignedBy:users[0].id,assignedTo:users[0].id,status:'Pending',isCompleted:false,workState:{},workHistory:[],comments:[],approvalHistory:[],generatedFromDeliverable:false,workflowStepId:undefined,deliverableId:undefined,serviceCycleId:undefined,responsibleHodId:undefined,assignmentState:undefined}], backend:{...state.backend,mode:'local',status:'local',hasLocalChanges:false,pendingMutations:0} });
  });
  await page.goto('/tasks?taskId=policy-task');
  await page.getByRole('button', {name:'Edit task',exact:true}).click();
  await page.getByRole('button', {name:'Edit',exact:true}).click();
  const assignee = page.getByRole('combobox', { name: 'Assignee', exact: true });
  await expect(assignee.getByRole('option', {name:'Outside HOD (HOD)',exact:true})).toHaveCount(0);
  await expect(assignee.getByRole('option', {name:'Outside Staff',exact:true})).toHaveCount(0);
  await page.getByRole('combobox', {name:'Department',exact:true}).selectOption({label:'Video Editor'});
  await expect(assignee.getByRole('option', {name:'Outside HOD (HOD)',exact:true})).toBeAttached();
  await expect(assignee.getByRole('option', {name:'Outside Staff',exact:true})).toBeAttached();
  await assignee.selectOption('policy-hod');
  await page.getByRole('button',{name:'Save Changes',exact:true}).click();
  await page.evaluate(async () => { const {useStore}=await import('/src/store/index.ts');useStore.setState({currentUser:useStore.getState().users.find(user=>user.id==='policy-hod')!}); });
  await page.goto('/tasks?taskId=policy-task');
  await page.getByRole('button',{name:'Accept assignment',exact:true}).click();
  await expect.poll(()=>page.evaluate(async()=>{const {useStore}=await import('/src/store/index.ts');return useStore.getState().tasks.find(task=>task.id==='policy-task')?.workState?.acceptedBy;})).toBe('policy-hod');
  await page.evaluate(async()=>{const {useStore}=await import('/src/store/index.ts');useStore.setState({currentUser:useStore.getState().users.find(user=>user.id==='policy-staff')!});});
  await page.goto('/tasks');
  await expect(page.getByRole('button',{name:'New task',exact:true})).toHaveCount(0);
});

test('new-task assignee options follow department and changing it clears the previous assignee', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Password', { exact: true }).waitFor();
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const { enablePasswordResetBypass } = await import('/src/lib/auth.ts');
    const state = useStore.getState();
    const base = state.users.find(user => user.role === 'Project Manager' && !user.isSuperAdmin)!;
    const pm = { ...base, mustResetPassword: false, permissions: undefined };
    const hod = { ...base, id: 'department-hod', name: 'Department HOD', role: 'HOD', department: 'Video Shooting', departments: ['Video Shooting', 'Video Editor'], customRoleId: undefined, permissions: undefined, hasLogin: true };
    const staff = { ...base, id: 'department-staff', name: 'Design Staff', role: 'Staff', department: 'Designer', departments: ['Designer'], customRoleId: undefined, permissions: undefined, hasLogin: true };
    enablePasswordResetBypass(pm.id);
    localStorage.setItem(`aitask:release-notice:2026-11-start-wording:${pm.id}`, 'acknowledged');
    useStore.setState({ currentUser: pm, users: [pm, hod, staff], rolePermissions: [], tasks: [], projects: [], notifications: [], backend: { ...state.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 } });
  });
  await page.goto('/tasks');
  // PMs open tasks from inside a project; this test covers the form's assignee rules.
  await expect(page.getByRole('button', { name: 'New task', exact: true })).toHaveCount(0);
  await page.evaluate(async () => { const { useStore } = await import('/src/store/index.ts'); useStore.getState().setCreateTaskModalOpen(true); });
  const department = page.getByRole('combobox', { name: 'Assign to Position/Department *', exact: true });
  const assignee = page.getByRole('combobox', { name: 'Assignee', exact: true });
  await department.selectOption({ label: 'Video Shooting' });
  await expect(assignee.locator('option')).toHaveText(['Unassigned', 'Department HOD (HOD)']);
  await assignee.selectOption({ label: 'Department HOD (HOD)' });
  await department.selectOption({ label: 'Designer' });
  await expect(assignee).toHaveValue('');
  await expect(assignee.locator('option')).toContainText(['Unassigned', 'Design Staff']);
  await expect(assignee.getByRole('option', {name:'Department HOD (HOD)',exact:true})).toHaveCount(0);
  await department.selectOption({ label: 'Video Editor' });
  await expect(assignee.locator('option')).toHaveText(['Unassigned', 'Department HOD (HOD)']);
});
