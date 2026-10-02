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
  for (const [id, role, department, isBoss] of [['boss', 'Project Manager', 'Management', true], ['pm', 'Project Manager', 'Management', false], ['hod', 'HOD', 'Designer', false], ['staff', 'Staff', 'Designer', false], ['other', 'Staff', 'Designer', false]]) {
    const email = `${id}-${suffix}@aitask.local`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(created.error);
    accounts.push({ id, role, department, isBoss, email, authId: created.data.user.id });
  }
  sql("insert into public.aitask_workspaces(id,name) values('aitask-main','Isolated Staff save QA') on conflict (id) do nothing;");
  for (const account of accounts) sql(`insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,is_super_admin) values('${account.id}','aitask-main','${account.authId}','${account.id}','${account.email}','${account.role}','${account.department}',array['${account.department}'],${account.isBoss});`);
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
    useStore.setState({ ...initial, ...loaded.state, currentUser: loaded.state.users.find(user => user.id === id), backend: { ...initial.backend, mode: 'local', status: 'local', pendingMutations: 0 } }, true);
  };
  const snapshot = () => Object.fromEntries(Object.keys(loaded.state).map(key => [key, useStore.getState()[key]]));
  const save = async (label, result, type) => {
    assert.equal(result.ok, true, `${label}: local action rejected: ${result.error}`);
    const saved = await secure.saveSecureWorkspace(snapshot(), type, undefined, { actorMemberId: useStore.getState().currentUser.id, excludeSuperAdminEntities: true });
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
  await save('Staff completion and derived progress', useStore.getState().updateTaskStatus('task', 'Completed'), 'task.update');
  await login('staff');
  await save('Staff deliverable completion', useStore.getState().updateDeliverableStatus('deliverable', 'Delivered'), 'deliverable.manage');
  await login('staff');
  assert.equal(useStore.getState().deliverables.find(item => item.id === 'deliverable').status, 'Delivered');
  assert.equal(useStore.getState().serviceCycles.find(item => item.id === 'cycle').status, 'Completed');
  await save('Staff cycle comment', useStore.getState().addCycleComment('cycle', 'Delivered for review', 'internal'), 'cycle_comment.manage');
  await login('staff');
  await save('Staff reopen and derived cycle', useStore.getState().updateTaskStatus('task', 'In Progress'), 'task.update');
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
  console.log('[staff-saves] Actual frontend actions persisted through authenticated REST: creation/deletion, edits, status, priority, dates, comments, derived delivery/reopening, HOD delegation, reload and lost-confirmation retry.');
} finally {
  globalThis.fetch = originalFetch;
  if (supabase) await supabase.auth.signOut();
  if (server) await server.close();
  if (accounts.length) sql("delete from public.aitask_entities where workspace_id='aitask-main' and entity_type <> 'custom_role'; delete from public.aitask_members where workspace_id='aitask-main';");
  for (const account of accounts) await admin.auth.admin.deleteUser(account.authId);
}
