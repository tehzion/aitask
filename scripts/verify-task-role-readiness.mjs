import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createServer } from 'vite';

const url = process.env.AITASK_LOCAL_TEST_URL;
const container = process.env.AITASK_LOCAL_TEST_DB;
if (!url || new URL(url).hostname !== '127.0.0.1' || new URL(url).protocol !== 'http:' || !container?.startsWith('supabase_db_aitask-supabase-validation-')) throw new Error('A disposable local release-test stack is required.');
const admin = createClient(url, process.env.AITASK_LOCAL_TEST_SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
const sql = query => execFileSync('docker', ['exec', '-i', container, 'psql', '-A', '-t', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'], { input: query, stdio: ['pipe', 'pipe', 'pipe'] }).toString();
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
  const baseTask = { id: 'task', clientId: 'client', clientName: 'Save QA', title: 'Assigned work', description: '', serviceType: 'Design', department: 'Designer', assignedTo: 'staff', assignedBy: 'pm', createdBy: 'pm', startDate: '2026-10-01', dueDate: '2026-10-30', status: 'Pending', priority: 'Medium', completionPercentage: 0, isCompleted: false, revisionCount: 0, clientApprovalStatus: 'Pending', isRecurring: false, recurrenceFrequency: 'None', visibility: 'client-visible', serviceCycleId: 'cycle', deliverableId: 'deliverable' };
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

  for (const actor of ['pm','hod','staff','customer']) {
    await login(actor);
    assert.equal((await secure.loadSecureBackendCapabilities()).compatible, true, actor+' backend is compatible');
  }
  await login('staff');
  await save('Staff starts work', useStore.getState().updateTaskStatus('task','In Progress'),'task.update');
  await save('Staff attaches output',useStore.getState().updateTaskAttachment('task','https://example.com/output.pdf','Output'),'task.update');
  await save('Staff submits',useStore.getState().updateTaskStatus('task','Waiting Approval'),'task.update');
  await login('hod');
  assert.equal(useStore.getState().notifications.some(n=>n.title==='Task Ready for Approval' && n.route?.entityId==='task'),true,'HOD receives the persisted handoff');
  await save('HOD approves',useStore.getState().updateTaskStatus('task','Approved'),'task.update');
  await login('customer');
  assert.equal(useStore.getState().notifications.some(n=>n.title==='Task Ready for Approval' && n.route?.entityId==='task'),true,'Client receives HOD-approved work');
  await save('Client accepts without completing',useStore.getState().reviewClientApproval('task','Approved','Customer OK'),'approval.review');
  await login('pm');
  assert.equal(useStore.getState().notifications.some(n=>n.title==='Client Approved Task' && n.route?.entityId==='task'),true,'PM receives the customer decision');
  assert.equal(useStore.getState().tasks.find(t=>t.id==='task').completionPercentage,80);
  await save('PM confirms completion',useStore.getState().updateTaskStatus('task','Completed'),'task.update');
  await save('PM returns work',useStore.getState().requestRevision('task','One more change'),'task.update');
  await login('staff');
  await save('Staff resubmits',useStore.getState().updateTaskStatus('task','Waiting Approval'),'task.update');
  sql("alter table public.aitask_members disable trigger aitask_00_guard_member_role_scope; update public.aitask_members set role='Staff',custom_role_id='builtin-hod' where workspace_id='aitask-main' and id='hod'; alter table public.aitask_members enable trigger aitask_00_guard_member_role_scope;");
  await login('hod');
  assert.ok(['HOD','Staff'].includes(useStore.getState().currentUser.role),'legacy membership is usable through the canonical HOD view');
  await save('Legacy HOD approves',useStore.getState().updateTaskStatus('task','Approved'),'task.update');
  assert.equal(useStore.getState().updateTaskStatus('task','Completed').ok,false);
  await login('pm');
  await save('PM finalizes after legacy HOD',useStore.getState().updateTaskStatus('task','Completed'),'task.update');

  // Generate the frozen review using the same authenticated PM identity.
  const pm=accounts.find(a=>a.id==='pm');
  const workflow={templateId:'role-template',templateRevision:1,steps:[{id:'role-review',kind:'internal_review',order:1,title:'Review',required:true,clientVisible:false,department:'Designer'}]};
  const cycle={id:'role-cycle',clientId:'client',clientName:'Save QA',planId:'plan',planRevision:1,periodStart:'2026-11-01',periodEnd:'2026-11-30',status:'Published',currency:'MYR',serviceItems:[{id:'role-service',name:'Review',platforms:[],unit:'review',quantity:1,unitPriceMinor:0,workflow}],addonSnapshots:[],discountType:'none',discountValue:0,taxRateBps:0};
  const output={id:'role-output',clientId:'client',clientName:'Save QA',cycleId:'role-cycle',planId:'plan',serviceItemId:'role-service',title:'Review output',sequence:1,status:'Planned',taskIds:[],attachments:[]};
  const frozen={id:'role-task',clientId:'client',clientName:'Save QA',title:'Signed artwork review',description:'',serviceType:'Design',department:'Designer',assignedTo:'staff',createdBy:'pm',assignedBy:'pm',startDate:'2026-11-01',dueDate:'',priority:'Medium',status:'Pending',isCompleted:false,completionPercentage:20,revisionCount:0,clientApprovalStatus:'Pending',visibility:'internal',isRecurring:false,generatedFromDeliverable:true,serviceCycleId:'role-cycle',deliverableId:'role-output',workflowTemplateId:'role-template',workflowTemplateRevision:1,workflowStepId:'role-review',workflowStepOrder:1,workflowStepRequired:true,predecessorTaskIds:[],attachmentLink:'https://example.com/review.pdf'};
  sql(`select set_config('request.jwt.claim.sub','${pm.authId}',false); insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values ('aitask-main','service_cycle','role-cycle','${JSON.stringify(cycle)}'::jsonb),('aitask-main','deliverable','role-output','${JSON.stringify(output)}'::jsonb),('aitask-main','task','role-task','${JSON.stringify(frozen)}'::jsonb);`);
  await login('staff');
  await save('Staff sends frozen review',useStore.getState().updateTaskStatus('role-task','Waiting Approval'),'task.update');
  await login('hod');
  await save('Legacy HOD signs frozen approval',useStore.getState().updateTaskStatus('role-task','Approved'),'task.update');
  const approved=JSON.parse(sql("select data from public.aitask_entities where workspace_id='aitask-main' and entity_id='role-task';").trim());
  assert.equal(approved.internalReview.reviewedBy,'hod');
  await login('pm');
  await save('PM completes signed review',useStore.getState().updateTaskStatus('role-task','Completed'),'task.update');
  const completed=JSON.parse(sql("select data from public.aitask_entities where workspace_id='aitask-main' and entity_id='role-task';").trim());
  assert.equal(completed.completionPercentage,100);
  assert.deepEqual(completed.internalReview,approved.internalReview,'PM finalization preserves the HOD decision');
  assert.equal(completed.workflowOutputVersion,approved.workflowOutputVersion);
  console.log('[role-readiness] Real Auth/REST PM, HOD, legacy HOD, Staff and Client saves passed, including notification delivery and signed frozen review completion.');
} finally {
  globalThis.fetch = originalFetch;
  if (supabase) await supabase.auth.signOut();
  if (server) await server.close();
  if (accounts.length) sql("delete from public.aitask_entities where workspace_id='aitask-main' and entity_type <> 'custom_role'; delete from public.aitask_members where workspace_id='aitask-main';");
  for (const account of accounts) await admin.auth.admin.deleteUser(account.authId);
}
