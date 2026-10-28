// Connected synthetic business journey. The parent rollout runner owns the
// uniquely named disposable stack; this script refuses hosted databases.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createServer } from 'vite';
import { chromium, expect } from '@playwright/test';

const url = process.env.AITASK_LOCAL_TEST_URL;
const container = process.env.AITASK_LOCAL_TEST_DB;
if (!url || new URL(url).hostname !== '127.0.0.1' || new URL(url).protocol !== 'http:'
  || !container?.startsWith('supabase_db_aitask-supabase-validation-')) throw new Error('A disposable local release-test stack is required.');
const admin = createClient(url, process.env.AITASK_LOCAL_TEST_SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
const sql = query => execFileSync('docker', ['exec', '-i', container, 'psql', '-X', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'], { input: query, stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const entity = id => JSON.parse(sql(`select data from public.aitask_entities where workspace_id='aitask-main' and entity_id=${quote(id)}`));
const password = `Local-${randomUUID()}!`;
const accounts = [];
let server, browser, supabase;
let assertions = 0;
const check = (condition, message) => { assertions++; assert.ok(condition, message); };
const originalFetch = globalThis.fetch;
let loseAck = false;
globalThis.fetch = async (...args) => {
  const response = await originalFetch(...args);
  if (loseAck && String(args[0]).includes('/rpc/aitask_execute_command')) {
    loseAck = false; await response.arrayBuffer(); throw new Error('Synthetic lost acknowledgement');
  }
  return response;
};

try {
  assert.equal(sql("select count(*) from public.aitask_members where workspace_id='aitask-main'"), '0', 'Refuse to replace existing members');
  for (const [id, name, role, department, boss] of [
    ['uat-boss', 'Boss Koo QA', 'Project Manager', 'Management', true],
    ['uat-pm-a', 'PM A', 'Project Manager', 'Management', false],
    ['uat-pm-b', 'PM B', 'Project Manager', 'Management', false],
    ['uat-hod', 'HOD A', 'HOD', 'Designer', false],
    ['uat-staff-a', 'Staff A Designer', 'Staff', 'Designer', false],
    ['uat-staff-b', 'Staff B Content Creator', 'Staff', 'Designer', false],
    ['uat-staff-c', 'Staff C Developer', 'Staff', 'Designer', false],
    ['uat-client', 'Client A', 'Client', 'Client', false],
  ]) {
    const email = `${id}-${randomUUID()}@aitask.local`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(created.error);
    accounts.push({ id, name, role, department, boss, email, authId: created.data.user.id });
  }
  sql("insert into public.aitask_workspaces(id,name) values('aitask-main','Isolated Phase 5 UAT') on conflict(id) do nothing");
  for (const a of accounts) sql(`insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,is_super_admin,must_reset_password,client_name) values(${quote(a.id)},'aitask-main',${quote(a.authId)},${quote(a.name)},${quote(a.email)},${quote(a.role)},${quote(a.department)},array[${quote(a.department)}],${a.boss},false,${a.role === 'Client' ? quote('ABC Digital Sdn. Bhd.') : 'null'})`);
  for (const status of ['Pending', 'In Progress', 'Waiting Approval', 'Approved', 'Completed', 'Cancelled']) sql(`insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values('aitask-main','task_status',${quote(status)},${quote(JSON.stringify({ id: status, status }))}::jsonb)`);
  process.env.VITE_AITASK_BACKEND = 'supabase';
  process.env.VITE_AITASK_SHOW_DEMO_LOGIN = 'false';
  process.env.VITE_SUPABASE_URL = url;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = process.env.AITASK_LOCAL_TEST_PUBLIC;
  server = await createServer({ server: { host: '127.0.0.1', port: 58000 + process.pid % 200, strictPort: true, ws: false, hmr: false }, logLevel: 'error' });
  await server.listen();
  ({ supabase } = await server.ssrLoadModule('/src/lib/supabaseClient.ts'));
  const secure = await server.ssrLoadModule('/src/lib/secureWorkspace.ts');
  const { useStore, clearWorkspaceSession } = await server.ssrLoadModule('/src/store/index.ts');
  const { getManagementSnapshot } = await server.ssrLoadModule('/src/lib/managementIntelligence.ts');
  const initial = useStore.getState();
  const login = async id => {
    clearWorkspaceSession({ discardPending: true });
    const a = accounts.find(item => item.id === id);
    const signed = await supabase.auth.signInWithPassword({ email: a.email, password });
    assert.ifError(signed.error);
    const loaded = await secure.loadSecureWorkspace(signed.data.user);
    useStore.setState({ ...initial, ...loaded.state, currentUser: loaded.currentUser,
      backend: { ...initial.backend, mode: 'supabase', status: 'live', isConfigured: true, isLoading: false, isSaving: false, isPulling: false, isRestoring: false, hasLocalChanges: false, pendingMutations: 0, workspaceVersion: loaded.revision.version } }, true);
  };
  const save = async (label, result, type = 'task.update') => {
    check(result.ok, `${label}: action rejected: ${result.error}`);
    const saved = await useStore.getState().commitPendingMutation(type);
    check(saved.ok, `${label}: persistence rejected: ${saved.error}`);
    return result;
  };
  await login('uat-boss');
  const setup = await save('Company and service plan', useStore.getState().createClientWithPlan({ clientName: 'ABC Digital Sdn. Bhd.', planName: 'September Plan', origin: 'custom', startDate: '2026-09-30', billingDay: 30,
    serviceItems: [{ id: 'uat-scope', name: 'Design', platforms: [], unit: 'output', quantity: 1, unitPriceMinor: 918000 }], discountType: 'none', discountValue: 0, taxRateBps: 0 }), 'client_plan.manage');
  const projectIds = [];
  for (const [name, pm] of [['Social Media Management', 'uat-pm-a'], ['Website Development', 'uat-pm-b'], ['Marketing Campaign', 'uat-pm-a']]) {
    const id = useStore.getState().addProject({ clientId: setup.clientId, clientName: 'ABC Digital Sdn. Bhd.', projectName: name, services: ['Design'], startDate: '2026-09-30', deadline: '2026-12-31', projectManagerIds: [pm], hodMemberIds: ['uat-hod'], staffMemberIds: ['uat-staff-a', 'uat-staff-b', 'uat-staff-c'], defaultApprovalMode: 'hod' });
    await save(`Create ${name}`, { ok: Boolean(id) }, 'project.create'); projectIds.push(id);
  }
  const activated = await save('Activate September cycle', useStore.getState().activateClientPlan(setup.planId), 'client_plan.manage');
  check(entity(activated.cycleId).periodEnd === '2026-10-29', 'Inclusive September billing period');
  const deliveryId = useStore.getState().deliverables.find(item => item.cycleId === activated.cycleId).id;
  const taskIds = [];
  for (const [index, assignedTo] of [[0, 'uat-hod'], [1, 'uat-staff-a'], [2, 'uat-staff-b']]) {
    const id = useStore.getState().addTask({ clientId: setup.clientId, clientName: 'ABC Digital Sdn. Bhd.', projectId: projectIds[index], projectName: useStore.getState().projects.find(p => p.id === projectIds[index]).projectName,
      title: `UAT work ${index}`, description: 'Synthetic acceptance work', serviceType: 'Design', department: 'Designer', assignedTo, createdBy: 'uat-boss', startDate: '2026-09-30', dueDate: '2026-10-29', status: 'Pending', priority: 'Medium', completionPercentage: 0, isRecurring: false, visibility: index === 0 ? 'client-visible' : 'internal',
      ...(index === 0 ? { serviceCycleId: activated.cycleId, deliverableId: deliveryId } : {}) });
    await save('Create project work', { ok: Boolean(id) }, 'task.create'); taskIds.push(id);
  }
  console.log('[phase5] A: Super Admin created the company, three projects, explicit assignments, plan, cycle and tasks through frontend store + Auth/RPC.');

  await login('uat-pm-a');
  check(useStore.getState().projects.length === 2 && !useStore.getState().projects.some(p => p.id === projectIds[1]), 'PM A sees only assigned projects');
  const forbidden = await supabase.rpc('aitask_execute_command', { p_workspace_id: 'aitask-main', p_command_id: randomUUID(), p_command_type: 'project.update', p_operations: [{ kind: 'entity', action: 'update', entityType: 'project', entityId: projectIds[1], expectedVersion: Number(sql(`select version from public.aitask_entities where entity_id=${quote(projectIds[1])}`)), data: { ...entity(projectIds[1]), staffMemberIds: [] } }] });
  check(Boolean(forbidden.error) || forbidden.data?.ok === false, 'Backend rejects PM A modifying PM B project');
  await save('PM milestone', useStore.getState().saveProjectMilestone(projectIds[0], { name: 'Client launch', targetDate: '2026-10-29', status: 'In Progress' }), 'project.update');
  console.log('[phase5] B: PM assignment scope, crafted cross-project RPC denial and persisted milestone passed.');

  await login('uat-hod');
  await save('HOD delegates assigned work', useStore.getState().updateTaskAssignee(taskIds[0], 'uat-staff-a'));
  await login('uat-staff-a');
  check(taskIds.slice(0, 2).every(id => useStore.getState().tasks.some(task => task.id === id)), 'One Staff account sees work under both PMs');
  check(!useStore.getState().tasks.some(task => task.id === taskIds[2]), 'Staff cannot see another employee task');
  check(sql("select count(*) from public.aitask_members where id='uat-staff-a'") === '1', 'Shared employee has one profile');
  await save('Staff starts work', useStore.getState().updateTaskStatus(taskIds[0], 'In Progress'));
  await save('Staff output evidence', useStore.getState().updateTaskAttachment(taskIds[0], 'https://example.com/phase5-output.pdf'));
  await save('Staff submits', useStore.getState().updateTaskStatus(taskIds[0], 'Waiting Approval'));
  await login('uat-hod');
  await save('HOD requests revision', useStore.getState().updateTaskStatus(taskIds[0], 'In Progress'));
  await login('uat-staff-a');
  await save('Staff resubmits', useStore.getState().updateTaskStatus(taskIds[0], 'Waiting Approval'));
  await login('uat-hod');
  await save('HOD approves', useStore.getState().updateTaskStatus(taskIds[0], 'Approved'));
  console.log('[phase5] C/D: HOD delegation, one Staff account across two PMs, revision/resubmission and approval persisted.');

  await login('uat-pm-a');
  await save('PM completes before client acceptance', useStore.getState().updateTaskStatus(taskIds[0], 'Completed'));
  check(entity(taskIds[0]).isCompleted === true && entity(taskIds[0]).clientApprovalStatus === 'Pending', 'PM completion is independent of acceptance');
  await login('uat-client');
  check(useStore.getState().users.every(member => member.id === 'uat-client'), 'Client receives no internal employee directory');
  check(useStore.getState().tasks.some(task => task.id === taskIds[0]) && !useStore.getState().tasks.some(task => taskIds.slice(1).includes(task.id)), 'Client sees only client-visible work');
  const rawRead = await supabase.from('aitask_entities').select('entity_id').eq('entity_type', 'task');
  check(Boolean(rawRead.error) || rawRead.data.length === 0, 'Client cannot bypass its sanitized portal with raw task reads');
  await save('Client feedback', useStore.getState().addComment(taskIds[0], 'Accepted synthetic output.'), 'comment.add');
  await save('Client acceptance', useStore.getState().reviewClientApproval(taskIds[0], 'Approved', 'Accepted by Client A.'), 'approval.review');
  check(entity(taskIds[0]).clientApprovalStatus === 'Approved' && entity(taskIds[0]).isCompleted === true, 'Audited acceptance preserves PM completion');
  console.log('[phase5] E: Client privacy, feedback and separate acceptance passed.');

  await login('uat-boss');
  const snapshot = getManagementSnapshot(useStore.getState());
  check(snapshot.activeProjects === 3, 'Dashboard active projects match three canonical rows');
  check(snapshot.projectManagers.find(row => row.member.id === 'uat-pm-a').projects === 2, 'Dashboard PM A workload is scoped');
  const previousCycle = entity(activated.cycleId);
  const previousPricing = entity(previousCycle.pricingSnapshotId);
  await save('End source plan', useStore.getState().setClientPlanStatus(setup.planId, 'Ended'), 'client_plan.manage');
  const renewal = await save('Create manual renewal', useStore.getState().createClientPlanRevision(setup.planId), 'client_plan.manage');
  await save('Review next-month price/scope', useStore.getState().updateDraftClientPlan(renewal.planId, { name: 'October Plan', serviceItems: [{ id: 'uat-next-scope', name: 'Design and campaign', platforms: [], unit: 'output', quantity: 2, unitPriceMinor: 500000 }] }), 'client_plan.manage');
  const next = await save('Activate reviewed renewal', useStore.getState().activateClientPlan(renewal.planId), 'client_plan.manage');
  check(entity(next.cycleId).periodStart === '2026-10-30' && entity(next.cycleId).periodEnd === '2026-11-29', 'Next cycle retains billing Day 30');
  assert.deepEqual(entity(activated.cycleId), previousCycle); assertions++;
  assert.deepEqual(entity(previousCycle.pricingSnapshotId), previousPricing); assertions++;
  await login('uat-pm-a');
  await save('Complete project', useStore.getState().setProjectStatus(projectIds[0], 'Completed'), 'project.update');
  await save('Close project', useStore.getState().setProjectStatus(projectIds[0], 'Closed', true), 'project.update');
  await save('Reopen project', useStore.getState().setProjectStatus(projectIds[0], 'Active'), 'project.update');
  check(entity(projectIds[0]).reopenedBy === 'uat-pm-a', 'Lifecycle audit metadata persists');
  console.log('[phase5] F: Manual renewal with changed scope/pricing, immutable monthly history, dashboard totals, project closure/reopening passed.');

  browser = await chromium.launch({ channel: process.env.CI ? undefined : 'chrome' });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  const base = server.resolvedUrls.local[0];
  const worker = accounts.find(a => a.id === 'uat-staff-a');
  await page.goto(`${base}login`);
  await page.getByLabel('Email', { exact: true }).fill(worker.email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Happy working', exact: true }).click();
  await expect.poll(() => page.evaluate(async id => (await import('/src/store/index.ts')).useStore.getState().tasks.some(task => task.id === id), taskIds[1]), { timeout: 15000 }).toBe(true);
  await expect.poll(() => page.evaluate(async () => (await import('/src/lib/supabaseClient.ts')).supabase.getChannels().some(channel => channel.state === 'joined')), { timeout: 15000 }).toBe(true);
  await login('uat-boss');
  const started = performance.now();
  await save('Concurrent boss edit', useStore.getState().updateTask(taskIds[1], { title: 'Synchronized across PMs and shared Staff' }));
  await expect.poll(() => page.evaluate(async id => (await import('/src/store/index.ts')).useStore.getState().tasks.find(task => task.id === id)?.title, taskIds[1]), { timeout: 15000 }).toBe('Synchronized across PMs and shared Staff');
  const syncMs = Math.round(performance.now() - started);
  check(syncMs <= 15000, `Synchronization target: ${syncMs}ms`);
  await context.setOffline(true);
  await save('Edit during receiver interruption', useStore.getState().updateTask(taskIds[1], { title: 'Reconnected canonical task' }));
  await context.setOffline(false);
  await expect.poll(() => page.evaluate(async id => (await import('/src/store/index.ts')).useStore.getState().tasks.find(task => task.id === id)?.title, taskIds[1]), { timeout: 15000 }).toBe('Reconnected canonical task');
  assertions++;
  console.log(`[phase5] G: Independent real browser/Auth session synchronized in ${syncMs}ms and recovered after network interruption.`);
  await context.close();

  const before = Number(sql(`select count(*) from public.aitask_audit_events where entity_id=${quote(projectIds[0])}`));
  loseAck = true;
  const staged = useStore.getState().saveProjectMilestone(projectIds[0], { name: 'Lost-ACK milestone', targetDate: '2026-11-30', status: 'Not Started' });
  check(staged.ok, 'Stage lost-ACK milestone');
  const uncertain = await useStore.getState().commitPendingMutation('project.update');
  check(!uncertain.ok && Boolean(secure.getRetainedSecureCommand()), 'Lost acknowledgement must retain command identity');
  check((await useStore.getState().retryPendingSave('project.update')).ok, 'Original command retry confirms persistence');
  check(entity(projectIds[0]).milestones.filter(item => item.id === staged.id).length === 1, 'Retry creates one milestone');
  check(Number(sql(`select count(*) from public.aitask_audit_events where entity_id=${quote(projectIds[0])}`)) === before + 1, 'Retry creates one audited update');
  console.log(`[phase5] H: Lost committed acknowledgement retried idempotently. Connected UAT completed: 8 scenario groups, ${assertions} assertions.`);
} finally {
  globalThis.fetch = originalFetch;
  if (browser) await browser.close();
  if (supabase) await supabase.auth.signOut();
  if (server) await server.close();
  if (accounts.length) sql("delete from public.aitask_entities where workspace_id='aitask-main' and entity_type <> 'custom_role'; delete from public.aitask_members where workspace_id='aitask-main'");
  for (const account of accounts) await admin.auth.admin.deleteUser(account.authId);
}
