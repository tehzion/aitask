import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createServer } from 'vite';

const url = process.env.AITASK_LOCAL_TEST_URL;
const container = process.env.AITASK_LOCAL_TEST_DB;
if (!url || new URL(url).hostname !== '127.0.0.1' || new URL(url).protocol !== 'http:' || !container?.startsWith('supabase_db_aitask-supabase-validation-')) throw new Error('A disposable local release-test stack is required.');
const admin = createClient(url, process.env.AITASK_LOCAL_TEST_SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
const sql = query => execFileSync('docker', ['exec', '-i', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'], { input: query, stdio: ['pipe', 'pipe', 'pipe'] }).toString();
const suffix = randomUUID();
const password = `Local-${randomUUID()}!`;
const accounts = [];
let server;
let supabase;
const originalFetch = globalThis.fetch;
let loseConfirmation = false;
globalThis.fetch = async (...args) => {
  const response = await originalFetch(...args);
  if (loseConfirmation && String(args[0]).includes('/rpc/aitask_execute_command')) {
    loseConfirmation = false;
    await response.arrayBuffer();
    throw new Error('Injected lost save confirmation');
  }
  return response;
};
try {
  // This fixed workspace is required by the real frontend module. Refuse to
  // replace existing data even inside the isolated validation container.
  assert.equal(sql("select count(*) from public.aitask_members where workspace_id='aitask-main';").trim().split('\n').map(x => x.trim()).includes('0'), true, 'validation workspace must have no existing members');
  for (const [id, role, department, isBoss] of [['boss', 'Project Manager', 'Management', true], ['pm', 'Project Manager', 'Management', false], ['hod', 'HOD', 'Designer', false], ['staff', 'Staff', 'Designer', false], ['other', 'Staff', 'Designer', false], ['customer', 'Client', 'Client', false]]) {
    const email = `${id}-${suffix}@aitask.local`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(created.error);
    accounts.push({ id, role, department, isBoss, email, authId: created.data.user.id });
  }
  sql("insert into public.aitask_workspaces(id,name) values('aitask-main','Isolated Staff save QA') on conflict (id) do nothing;");
  for (const account of accounts) sql(`insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,is_super_admin,client_name) values('${account.id}','aitask-main','${account.authId}','${account.id}','${account.email}','${account.role}','${account.department}',array['${account.department}'],${account.isBoss},${account.id === 'customer' ? "'Save QA'" : 'null'});`);
  const insert = (type, data) => sql(`insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values('aitask-main','${type}','${data.id}','${JSON.stringify(data).replaceAll("'", "''")}'::jsonb);`);
  for (const status of ['Pending', 'In Progress', 'Waiting Approval', 'Completed', 'Cancelled']) insert('task_status', { id: status, status });
  insert('client', { id: 'client', clientName: 'Save QA', createdBy: 'pm', createdAt: '2026-10-01', updatedAt: '2026-10-01' });
  const baseTask = { id: 'task', clientId: 'client', clientName: 'Save QA', title: 'Assigned work', description: '', serviceType: 'Design', department: 'Designer', assignedTo: 'staff', assignedBy: 'pm', createdBy: 'pm', startDate: '2026-10-01', dueDate: '2026-10-30', status: 'Pending', priority: 'Medium', completionPercentage: 0, isCompleted: false, revisionCount: 0, clientApprovalStatus: 'Pending', isRecurring: false, recurrenceFrequency: 'None', visibility: 'internal', serviceCycleId: 'cycle', deliverableId: 'deliverable' };
  insert('project', { id: 'curated', clientName: 'Save QA', projectName: 'Curated', createdBy: 'boss', departments: ['Designer'], createdAt: '2026-10-01', updatedAt: '2026-10-01' });
  insert('task', baseTask);
  insert('task', { ...baseTask, id: 'delegate', title: 'HOD assigned work', assignedTo: 'hod', serviceCycleId: undefined, deliverableId: undefined });
  insert('service_cycle', { id: 'cycle', clientId: 'client', clientName: 'Save QA', planId: 'plan', planRevision: 1, periodStart: '2026-10-01', periodEnd: '2026-10-31', status: 'Published', publishedAt: '2026-10-01', currency: 'MYR', serviceItems: [], addonSnapshots: [], discountType: 'none', discountValue: 0, taxRateBps: 0, createdAt: '2026-10-01', updatedAt: '2026-10-01' });
  insert('deliverable', { id: 'deliverable', clientId: 'client', clientName: 'Save QA', planId: 'plan', cycleId: 'cycle', serviceItemId: 'service', title: 'Artwork', sequence: 1, status: 'Planned', taskIds: ['task'], attachments: [], createdAt: '2026-10-01', updatedAt: '2026-10-01' });
  process.env.VITE_SUPABASE_URL = url;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = process.env.AITASK_LOCAL_TEST_PUBLIC;
  process.env.VITE_AITASK_BACKEND = 'supabase';
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
  ({ supabase } = await server.ssrLoadModule('/src/lib/supabaseClient.ts'));
  const secure = await server.ssrLoadModule('/src/lib/secureWorkspace.ts');
  const { useStore, clearWorkspaceSession } = await server.ssrLoadModule('/src/store/index.ts');
  const initial = useStore.getState();
  let loaded;
  const login = async id => {
    clearWorkspaceSession({ discardPending: true });
    secure.discardSecureWorkspaceCommand();
    const account = accounts.find(item => item.id === id);
    const signed = await supabase.auth.signInWithPassword({ email: account.email, password });
    assert.ifError(signed.error);
    loaded = await secure.loadSecureWorkspace(signed.data.user);
    useStore.setState({ ...initial, ...loaded.state, currentUser: loaded.state.users.find(user => user.id === id), backend: { ...initial.backend, mode: 'supabase', status: 'live', pendingMutations: 0 } }, true);
  };
  const snapshot = () => Object.fromEntries(Object.keys(loaded.state).map(key => [key, useStore.getState()[key]]));
  const save = async (label, result, type) => {
    assert.equal(result.ok, true, `${label}: local action rejected: ${result.error}`);
    const saved = await secure.saveSecureWorkspace(snapshot(), type, undefined, { actorMemberId: useStore.getState().currentUser.id, excludeSuperAdminEntities: true });
    if (!saved.ok && saved.conflict) console.log('[staff-saves] Conflict diagnostic:', JSON.stringify({ label, entityType: saved.conflict.entityType, entityId: saved.conflict.entityId, expected: saved.conflict.expectedVersion, actual: saved.conflict.actualVersion }));
    assert.equal(saved.ok, true, `${label}: save rejected: ${saved.code} ${saved.error}`);
  };
  await login('staff');
  await save('Staff status', useStore.getState().updateTaskStatus('task', 'In Progress'), 'task.update');
  await save('Staff priority without reload', useStore.getState().updateTaskPriority('task', 'High'), 'task.update');
  await login('staff');
  await save('Staff full edit', useStore.getState().updateTask('task', { title: 'Updated artwork', notes: 'Ready soon' }), 'task.update');
  await login('staff');
  await save('Staff due date', useStore.getState().updateTaskDueDate('task', '2026-10-29'), 'task.update');
  await login('staff');
  await save('Staff comment', useStore.getState().addComment('task', 'Progress update'), 'comment.add');
  await login('staff');
  assert.equal(useStore.getState().updateTaskStatus('task', 'Completed').ok, false, 'linked work needs evidence');
  await save('Staff output evidence', useStore.getState().updateTaskAttachment('task', 'https://example.com/confirmed-artwork.pdf', 'Artwork'), 'task.update');
  await login('staff');
  await save('Staff assignment acceptance', useStore.getState().updateTaskWork('task', { kind: 'accept' }), 'task.update');
  await login('staff');
  assert.equal(useStore.getState().tasks.find(item => item.id === 'task').workState.acceptedBy, 'staff');
  await save('Staff help request', useStore.getState().updateTaskWork('task', { kind: 'block', reason: 'Need final client assets' }), 'task.update');
  await login('staff');
  assert.equal(useStore.getState().tasks.find(item => item.id === 'task').workState.blocker.reason, 'Need final client assets');
  await save('Staff blocker resolution', useStore.getState().updateTaskWork('task', { kind: 'unblock' }), 'task.update');
  await login('staff');
  assert.equal(useStore.getState().updateTaskStatus('task', 'Completed').ok, false, 'Staff cannot bypass review and PM completion');
  await save('Staff review submission', useStore.getState().updateTaskStatus('task', 'Waiting Approval'), 'task.update');
  await login('hod');
  assert.equal(useStore.getState().tasks.find(item => item.id === 'task').completionPercentage, 60);
  await save('HOD approval', useStore.getState().updateTaskStatus('task', 'Approved'), 'task.update');
  await login('pm');
  assert.equal(useStore.getState().tasks.find(item => item.id === 'task').completionPercentage, 80);
  await save('PM final completion and derived progress', useStore.getState().updateTaskStatus('task', 'Completed'), 'task.update');
  await login('staff');
  await save('Staff deliverable completion', useStore.getState().updateDeliverableStatus('deliverable', 'Delivered'), 'deliverable.manage');
  await login('staff');
  assert.equal(useStore.getState().deliverables.find(item => item.id === 'deliverable').status, 'Delivered');
  assert.equal(useStore.getState().serviceCycles.find(item => item.id === 'cycle').status, 'Completed');
  await save('Staff cycle comment', useStore.getState().addCycleComment('cycle', 'Delivered for review', 'internal'), 'cycle_comment.manage');
  await login('pm');
  await save('PM revision and derived cycle', useStore.getState().updateTaskStatus('task', 'In Progress'), 'task.update');
  await login('staff');
  assert.equal(useStore.getState().deliverables.find(item => item.id === 'deliverable').status, 'In Progress');
  assert.equal(useStore.getState().deliverables.find(item => item.id === 'deliverable').deliveredAt, undefined);
  assert.equal(useStore.getState().serviceCycles.find(item => item.id === 'cycle').status, 'Published');
  const newId = useStore.getState().addTask({ ...baseTask, projectId: 'curated', createdBy: 'staff', assignedBy: undefined, serviceCycleId: undefined, deliverableId: undefined, title: 'Staff-created work' });
  await save('Staff task creation', { ok: Boolean(newId) }, 'task.create');
  await login('staff');
  assert.equal(useStore.getState().tasks.find(item => item.id === newId).createdBy, 'staff');
  await save('Staff task deletion', useStore.getState().deleteTask(newId), 'task.delete');
  await login('staff');
  assert.equal(useStore.getState().tasks.some(item => item.id === newId), false);
  await login('hod');
  await save('HOD department comment', useStore.getState().addComment('task', 'Reviewed by HOD'), 'comment.add');
  await login('hod');
  await save('HOD delegation', useStore.getState().updateTaskAssignee('delegate', 'staff'), 'task.update');
  await login('staff');
  assert.equal(useStore.getState().tasks.find(item => item.id === 'delegate').assignedTo, 'staff');
  assert.equal(useStore.getState().tasks.find(item => item.id === 'delegate').createdBy, 'pm');
  assert.equal(useStore.getState().updateTaskDueDate('task', '2026-10-28').ok, true);
  loseConfirmation = true;
  const uncertain = await secure.saveSecureWorkspace(snapshot(), 'task.update', undefined, { actorMemberId: 'staff', excludeSuperAdminEntities: true });
  assert.equal(uncertain.ok, false, 'lost acknowledgement must retain an uncertain save');
  const retried = await secure.retrySecureWorkspaceCommand();
  assert.equal(retried.ok, true, `retry failed: ${retried.error}`);
  await login('staff');
  assert.equal(useStore.getState().tasks.find(item => item.id === 'task').dueDate, '2026-10-28');
  // Real Auth/REST must accept legacy reverse-only links as the frontend does.
  sql("update public.aitask_entities set data=(data - 'deliverableId') || '{\"status\":\"Completed\",\"isCompleted\":true}'::jsonb where workspace_id='aitask-main' and entity_type='task' and entity_id='task'; update public.aitask_entities set data=(data - 'deliveredAt') || '{\"status\":\"Ready\"}'::jsonb where workspace_id='aitask-main' and entity_type='deliverable' and entity_id='deliverable';");
  await login('staff');
  await save('Reverse-linked Staff delivery confirmation', useStore.getState().updateDeliverableStatus('deliverable', 'Delivered'), 'deliverable.manage');
  await login('staff');
  assert.equal(useStore.getState().deliverables.find(item => item.id === 'deliverable').status, 'Delivered');
  console.log('[staff-saves] Reverse-linked assigned Staff delivery persisted through real authenticated REST.');
  sql("update public.aitask_entities set data=data || '{\"assignedTo\":\"hod\"}'::jsonb where workspace_id='aitask-main' and entity_type='task' and entity_id='task'; update public.aitask_entities set data=(data - 'deliveredAt') || '{\"status\":\"Ready\"}'::jsonb where workspace_id='aitask-main' and entity_type='deliverable' and entity_id='deliverable'; update public.aitask_entities set data=data || '{\"status\":\"Published\"}'::jsonb where workspace_id='aitask-main' and entity_type='service_cycle' and entity_id='cycle';");
  await login('hod');
  await save('Reverse-linked HOD delivery confirmation', useStore.getState().updateDeliverableStatus('deliverable', 'Delivered'), 'deliverable.manage');
  await login('hod');
  assert.equal(useStore.getState().deliverables.find(item => item.id === 'deliverable').status, 'Delivered');
  console.log('[staff-saves] Reverse-linked assigned HOD delivery persisted through real authenticated REST.');

  // Model the legacy cross-company task link without changing production data.
  // The destination deliverable remains a valid record in its original company.
  insert('client', { id: 'repair-client', clientName: 'Repair QA', createdBy: 'boss', createdAt: '2026-10-01', updatedAt: '2026-10-01' });
  insert('task', { ...baseTask, id: 'repair-task', clientId: 'repair-client', clientName: 'Repair QA', deliverableId: 'deliverable', serviceCycleId: 'cycle', status: 'Completed', isCompleted: true });
  sql("update public.aitask_entities set data=data || '{\"taskIds\":[\"task\",\"repair-task\"]}'::jsonb where workspace_id='aitask-main' and entity_type='deliverable' and entity_id='deliverable';");
  await login('boss');
  await save('Explicit invalid-link removal', useStore.getState().unlinkInvalidTaskDelivery('repair-task'), 'task.update');
  await login('boss');
  assert.equal(useStore.getState().tasks.find(task => task.id === 'repair-task').deliverableId, undefined);
  assert.equal(useStore.getState().tasks.find(task => task.id === 'repair-task').isCompleted, true);
  assert.equal(useStore.getState().deliverables.find(item => item.id === 'deliverable').taskIds.includes('repair-task'), false);
  assert.equal(useStore.getState().deliverables.find(item => item.id === 'deliverable').status, 'Delivered');
  console.log('[staff-saves] Explicit legacy cross-company link repair persisted through real authenticated REST without moving or deleting the task.');

  sql("update public.aitask_entities set data=data || '{\"visibility\":\"client-visible\",\"status\":\"Approved\",\"isCompleted\":false,\"completionPercentage\":80,\"clientApprovalStatus\":\"Pending\"}'::jsonb where workspace_id='aitask-main' and entity_type='task' and entity_id='task';");
  await login('customer');
  assert.deepEqual(useStore.getState().users.map(user => user.id), ['customer']);
  await save('Client feedback without staff directory', useStore.getState().addComment('task', 'Private contact metadata is not needed to share feedback.'), 'comment.add');
  await login('customer');
  assert.equal(useStore.getState().tasks.find(task => task.id === 'task').comments.some(comment => comment.text === 'Private contact metadata is not needed to share feedback.'), true);
  await save('Client approval without staff directory', useStore.getState().reviewClientApproval('task', 'Approved', 'Approved after privacy update.'), 'approval.review');
  await login('customer');
  assert.equal(useStore.getState().tasks.find(task => task.id === 'task').clientApprovalStatus, 'Approved');
  assert.equal(useStore.getState().tasks.find(task => task.id === 'task').completionPercentage, 80);
  assert.equal(useStore.getState().tasks.find(task => task.id === 'task').isCompleted, false);
  console.log('[staff-saves] Client feedback and approval persisted through real Auth/REST without an internal staff directory.');
  // Counters, assignments and unknown historical completion dates stay server-owned.
  sql("update public.aitask_entities set data=(data - 'completedAt') || '{\"status\":\"Approved\",\"isCompleted\":false,\"completionPercentage\":80,\"clientApprovalStatus\":\"Pending\",\"revisionCount\":7}'::jsonb where workspace_id='aitask-main' and entity_type='task' and entity_id='task';");
  await login('customer');
  await save('Client rejection without internal counter', useStore.getState().reviewClientApproval('task', 'Rejected', 'Please revise.'), 'approval.review');
  await login('boss');
  const rejectedTask = useStore.getState().tasks.find(task => task.id === 'task');
  assert.equal(rejectedTask.revisionCount, 8);
  assert.equal(rejectedTask.assignedTo, 'hod');
  assert.equal(rejectedTask.completedAt, undefined);
  assert.equal(useStore.getState().deliverables.find(item => item.id === 'deliverable').status, 'In Progress');
  // Seed a historical undated task only inside this disposable validation DB.
  sql("begin; alter table public.aitask_entities disable trigger aitask_enforce_task_completed_at; update public.aitask_entities set data=(data - 'completedAt') || '{\"status\":\"Approved\",\"isCompleted\":false,\"completionPercentage\":80,\"clientApprovalStatus\":\"Pending\"}'::jsonb where workspace_id='aitask-main' and entity_type='task' and entity_id='task'; alter table public.aitask_entities enable trigger aitask_enforce_task_completed_at; commit;");
  await login('customer');
  await save('Client approval preserves unknown completion date', useStore.getState().reviewClientApproval('task', 'Approved', 'Approved.'), 'approval.review');
  await login('boss');
  const approvedTask = useStore.getState().tasks.find(task => task.id === 'task');
  assert.equal(approvedTask.revisionCount, 8);
  assert.equal(approvedTask.assignedTo, 'hod');
  assert.equal(approvedTask.completedAt, undefined);
  assert.equal(useStore.getState().deliverables.find(item => item.id === 'deliverable').status, 'In Progress');
  console.log('[staff-saves] Client feedback, approval and rejection persisted through real Auth/REST without an internal staff directory; canonical assignments/counters and unknown completion dates were preserved.');

  console.log('[staff-saves] Actual frontend actions persisted through authenticated REST: creation/deletion, edits, status, priority, dates, comments, derived delivery/reopening, HOD delegation, reload and lost-confirmation retry.');
} finally {
  globalThis.fetch = originalFetch;
  if (supabase) await supabase.auth.signOut();
  if (server) await server.close();
  if (accounts.length) sql("delete from public.aitask_entities where workspace_id='aitask-main' and entity_type <> 'custom_role'; delete from public.aitask_members where workspace_id='aitask-main';");
  for (const account of accounts) await admin.auth.admin.deleteUser(account.authId);
}
