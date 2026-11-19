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
const evidencePath = 'aitask-main/file-client/file-cycle/department-output.pdf';
globalThis.fetch = async (...args) => {
  const response = await originalFetch(...args);
  if (String(args[0]).includes('/rpc/aitask_execute_command')) {
    const error = await response.clone().json().catch(() => ({}));
    if (!response.ok || error.ok === false) console.error('[staff-saves] Local RPC rejection:', JSON.stringify({ status: response.status, code: error.code, error: error.error, message: error.message, details: error.details, hint: error.hint }));
  }
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
  for (const [id, role, department, isBoss] of [['boss', 'Project Manager', 'Management', true], ['pm', 'Project Manager', 'Management', false], ['outside-pm', 'Project Manager', 'Management', false], ['hod', 'HOD', 'Designer', false], ['staff', 'Staff', 'Designer', false], ['other', 'Staff', 'Designer', false], ['customer', 'Client', 'Client', false]]) {
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
  insert('project', { id: 'curated', clientId: 'client', clientName: 'Save QA', projectName: 'Curated', createdBy: 'boss', projectManagerIds: ['pm'], hodMemberIds: ['hod'], staffMemberIds: ['staff', 'other'], departments: ['Designer'], createdAt: '2026-10-01', updatedAt: '2026-10-01' });
  insert('task', baseTask);
  insert('task', { ...baseTask, id: 'delegate', title: 'HOD assigned work', assignedTo: 'hod', serviceCycleId: undefined, deliverableId: undefined });
  insert('service_cycle', { id: 'cycle', clientId: 'client', clientName: 'Save QA', planId: 'plan', planRevision: 1, periodStart: '2026-10-01', periodEnd: '2026-10-31', status: 'Published', publishedAt: '2026-10-01', currency: 'MYR', serviceItems: [], discountType: 'none', discountValue: 0, taxRateBps: 0, createdAt: '2026-10-01', updatedAt: '2026-10-01' });
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
  assert.equal(useStore.getState().projects.some(project => project.id === 'curated' && project.projectManagerIds.includes('pm')), true, 'PM completion fixture must belong to the assigned portfolio');
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
  const rejectedId = useStore.getState().addTask({ ...baseTask, projectId: 'curated', createdBy: 'staff', assignedBy: undefined, serviceCycleId: undefined, deliverableId: undefined, title: 'Staff-created work' });
  assert.equal(Boolean(rejectedId), false, 'ordinary Staff task creation is disabled');
  // Existing Staff-created tasks remain independently eligible for deletion.
  const newId = 'legacy-staff-created';
  insert('task', { ...baseTask, id: newId, projectId: 'curated', createdBy: 'staff', serviceCycleId: undefined, deliverableId: undefined, title: 'Legacy Staff-created work' });
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

  // File-only review through the real frontend store, with the HOD having
  // department oversight but no service-client assignment.
  insert('client', { id: 'file-client', clientName: 'File Review QA', createdBy: 'pm', createdAt: '2026-10-01', updatedAt: '2026-10-01' });
  insert('service_cycle', { id: 'file-cycle', clientId: 'file-client', clientName: 'File Review QA', planId: 'file-plan', status: 'Published', periodStart: '2026-10-01', periodEnd: '2026-10-31', serviceItems: [], createdAt: '2026-10-01', updatedAt: '2026-10-01' });
  assert.ifError((await admin.storage.from('client-service-files').upload(evidencePath, Buffer.from('%PDF-1.4\nReviewer output\n%%EOF'), { contentType: 'application/pdf' })).error);
  const fileRef = { id: 'department-output', bucket: 'client-service-files', path: evidencePath, fileName: 'department-output.pdf', mimeType: 'application/pdf', sizeBytes: 32, uploadedBy: 'staff', uploadedAt: new Date().toISOString() };
  insert('deliverable', { id: 'file-output', clientId: 'file-client', clientName: 'File Review QA', cycleId: 'file-cycle', planId: 'file-plan', serviceItemId: 'file-service', title: 'File-only output', sequence: 1, status: 'In Progress', taskIds: ['file-review'], attachments: [fileRef], createdAt: '2026-10-01', updatedAt: '2026-10-01' });
  insert('task', { ...baseTask, id: 'file-review', clientId: 'file-client', clientName: 'File Review QA', serviceCycleId: 'file-cycle', deliverableId: 'file-output', status: 'Waiting Approval', completionPercentage: 60 });
  await login('hod');
  const fileTask = useStore.getState().tasks.find(task => task.id === 'file-review');
  assert.equal(useStore.getState().deliverables.some(item => item.id === 'file-output'), false, 'HOD does not acquire general service access');
  assert.equal(fileTask.reviewEvidence.actorId, 'hod');
  assert.deepEqual(fileTask.reviewEvidence.attachments, [fileRef]);
  assert.ifError((await supabase.storage.from('client-service-files').download(evidencePath)).error);
  await save('File-only department HOD approval', useStore.getState().updateTaskStatus('file-review', 'Approved'), 'task.update');
  await login('pm');
  assert.equal(useStore.getState().tasks.find(task => task.id === 'file-review').completionPercentage, 80);
  await save('PM completion after file-only HOD review', useStore.getState().updateTaskStatus('file-review', 'Completed'), 'task.update');
  await login('boss');
  assert.equal(useStore.getState().tasks.find(task => task.id === 'file-review').completionPercentage, 100);
  console.log('[staff-saves] File-only HOD oversight review, actual private download and PM completion passed through the real frontend store and native saves.');

  // PM task company edits and direct delegation use the same store/REST path.
  insert('client', { id: 'pm-second', clientName: 'Second PM QA', createdBy: 'pm' });
  insert('client', { id: 'pm-foreign', clientName: 'Foreign PM QA', createdBy: 'boss' });
  insert('client', { id: 'pm-assigned-company', clientName: 'Assigned PM QA', createdBy: 'boss' });
  insert('task', { ...baseTask, id: 'pm-move', serviceCycleId: undefined, deliverableId: undefined });
  insert('task', { ...baseTask, id: 'pm-direct', clientId: 'pm-assigned-company', clientName: 'Assigned PM QA', createdBy: 'boss', assignedTo: 'pm', serviceCycleId: undefined, deliverableId: undefined });
  await login('pm');
  assert.equal(useStore.getState().updateTask('pm-move', { clientName: 'Foreign PM QA' }).ok, false, 'local PM action rejects a foreign destination');
  await save('PM moves work to an accessible company', useStore.getState().updateTask('pm-move', { clientName: 'Second PM QA' }), 'task.update');
  await login('pm');
  assert.equal(useStore.getState().tasks.find(task => task.id === 'pm-move').clientId, 'pm-second', 'company ID persists with the new name');
  await save('Directly assigned PM delegates work directly to Staff', useStore.getState().updateTaskAssignee('pm-direct', 'staff'), 'task.update');
  await login('pm');
  assert.equal(useStore.getState().tasks.some(task => task.id === 'pm-direct'), false, 'delegation does not retain unrelated task access');
  assert.equal(useStore.getState().clients.some(client => client.id === 'pm-assigned-company'), false, 'delegation does not retain unrelated company access');
  console.log('[staff-saves] PM company identity edits and directly assigned delegation persisted through authenticated REST and reload.');

  insert('project', { id: 'direct-project', clientId: 'client', clientName: 'Save QA', projectName: 'Direct assignment', projectManagerIds: ['pm'], hodMemberIds: [], staffMemberIds: [], departments: ['Video Editor'] });
  insert('task', { ...baseTask, id: 'cross-department', projectId: 'direct-project', department: 'Video Editor', assignedTo: 'pm', serviceCycleId: undefined, deliverableId: undefined });
  await login('pm');
  await save('PM assigns outside-project and department HOD', useStore.getState().updateTaskAssignee('cross-department', 'hod'), 'task.update');
  await login('hod');
  assert.equal(useStore.getState().tasks.some(task => task.id === 'cross-department'), true);
  await save('Outside HOD accepts assignment', useStore.getState().updateTaskWork('cross-department', { kind: 'accept' }), 'task.update');
  await login('hod');
  await save('Outside HOD edits assigned task', useStore.getState().updateTask('cross-department', { notes: 'Accepted outside department' }), 'task.update');
  await login('pm');
  await save('PM assigns another PM outside project', useStore.getState().updateTaskAssignee('cross-department', 'outside-pm'), 'task.update');
  await login('outside-pm');
  await save('Outside PM accepts assignment', useStore.getState().updateTaskWork('cross-department', { kind: 'accept' }), 'task.update');
  await login('outside-pm');
  await save('Outside PM edits assigned task', useStore.getState().updateTask('cross-department', { notes: 'Accepted by outside PM' }), 'task.update');
  assert.equal(useStore.getState().updateTaskAssignee('cross-department', 'staff').ok, false, 'outsider PM cannot reassign a project they do not manage');
  console.log('[staff-saves] Cross-department HOD and outsider PM assignment, acceptance and editing passed through authenticated REST.');
  insert('project', { id: 'hod-department-project', clientId: 'client', clientName: 'Save QA', projectName: 'Department delegation', projectManagerIds: ['pm'], hodMemberIds: ['hod'], staffMemberIds: [], departments: ['Designer'] });
  insert('task', { ...baseTask, id: 'department-delegate', projectId: 'hod-department-project', assignedTo: 'hod', responsibleHodId: 'hod', assignmentState: 'pending_hod', serviceCycleId: undefined, deliverableId: undefined });
  await login('hod');
  await save('HOD delegates to department Staff absent from project', useStore.getState().updateTaskAssignee('department-delegate', 'staff'), 'task.update');
  await login('staff');
  assert.equal(useStore.getState().tasks.find(task => task.id === 'department-delegate')?.assignedTo, 'staff');
  console.log('[staff-saves] Department HOD delegation outside project Staff membership persisted through authenticated REST.');


  // Manage work, date reasons, client ratings and role notifications use the same real
  // Auth/REST save path. Exercise them as the people who use them, including the
  // failure paths (lost confirmation and a stale record) that must never lose a change.
  const featureTask = (id, extra = {}) => ({ ...baseTask, id, projectId: 'curated', serviceCycleId: undefined, deliverableId: undefined, ...extra });
  const taskOf = id => useStore.getState().tasks.find(task => task.id === id);
  const feedTitles = async () => (await secure.loadSecureNotificationPage({})).items.map(item => `${item.title}|${item.route?.entityId || ''}`);
  insert('task', featureTask('reason-pm', { dueDate: '2026-10-30' }));
  insert('task', featureTask('reason-hod', { dueDate: '2026-10-30', assignedTo: 'staff', responsibleHodId: 'hod', assignmentState: 'assigned_staff' }));
  await login('pm');
  await save('PM moves a date with a reason', useStore.getState().updateTaskDueDate('reason-pm', '2026-11-06', 'Client sent new copy'), 'task.update');
  await login('pm');
  assert.equal(taskOf('reason-pm').dueDate, '2026-11-06');
  assert.equal(taskOf('reason-pm').dateChange?.reason, 'Client sent new copy', 'the reason persists after reload');
  assert.equal(taskOf('reason-pm').dateChange?.from, '2026-10-30');
  await login('hod');
  await save('HOD moves a department date with a reason', useStore.getState().updateTaskDueDate('reason-hod', '2026-11-04', 'Waiting on assets'), 'task.update');
  await login('boss');
  await save('Boss moves a date with a reason', useStore.getState().updateTaskDueDate('reason-pm', '2026-11-09', 'Boss re-planned'), 'task.update');
  await login('boss');
  assert.equal(taskOf('reason-pm').dateChange?.from, '2026-11-06', 'the previous date is kept as the "from" date');
  console.log('[feature-saves] PM, HOD and Boss date changes with a reason persisted through authenticated REST and reload.');

  // Manage work bulk save: several tasks, one at a time, then a reassignment.
  insert('task', featureTask('bulk-a', { dueDate: '2026-10-30' }));
  insert('task', featureTask('bulk-b', { dueDate: '2026-10-30' }));
  await login('pm');
  for (const id of ['bulk-a', 'bulk-b']) {
    await save(`PM bulk due date for ${id}`, useStore.getState().updateTask(id, { dueDate: '2026-11-12', dateChangeReason: 'Shifted together' }), 'task.update');
  }
  await login('pm');
  assert.deepEqual(['bulk-a', 'bulk-b'].map(id => taskOf(id).dueDate), ['2026-11-12', '2026-11-12']);
  await save('PM reassigns bulk work', useStore.getState().updateTaskAssignee('bulk-a', 'other'), 'task.update');
  await login('other');
  assert.equal(taskOf('bulk-a')?.assignedTo, 'other', 'the new assignee sees the work after reload');
  console.log('[feature-saves] Manage work bulk due date and reassignment persisted through authenticated REST.');

  // A lost confirmation on a reasoned date change: retry must apply it exactly once.
  await login('pm');
  assert.equal(useStore.getState().updateTaskDueDate('bulk-b', '2026-11-20', 'Lost acknowledgement').ok, true);
  loseConfirmation = true;
  const uncertainDate = await secure.saveSecureWorkspace(snapshot(), 'task.update', undefined, { actorMemberId: 'pm', excludeSuperAdminEntities: true });
  assert.equal(uncertainDate.ok, false, 'a lost acknowledgement keeps the change as uncertain');
  const retriedDate = await secure.retrySecureWorkspaceCommand();
  assert.equal(retriedDate.ok, true, `retry failed: ${retriedDate.error}`);
  await login('pm');
  assert.equal(taskOf('bulk-b').dueDate, '2026-11-20');
  assert.equal(taskOf('bulk-b').dateChange?.from, '2026-11-12', 'the retry did not apply the change twice');
  assert.equal(taskOf('bulk-b').dateChange?.reason, 'Lost acknowledgement');

  // A stale record: someone else changed it first. The save reports a conflict instead of
  // overwriting, and re-applying on fresh data succeeds.
  await login('pm');
  assert.equal(useStore.getState().updateTaskDueDate('bulk-a', '2026-11-25', 'Second thoughts').ok, true);
  sql("update public.aitask_entities set data = data || '{\"notes\":\"changed elsewhere\"}'::jsonb where workspace_id='aitask-main' and entity_type='task' and entity_id='bulk-a';");
  const stale = await secure.saveSecureWorkspace(snapshot(), 'task.update', undefined, { actorMemberId: 'pm', excludeSuperAdminEntities: true });
  assert.equal(stale.ok, false, 'a stale record must not be overwritten');
  assert.equal(stale.code, 'CONFLICT', `expected a conflict, got ${stale.code}: ${stale.error}`);
  secure.discardSecureWorkspaceCommand();
  await login('pm');
  assert.equal(taskOf('bulk-a').notes, 'changed elsewhere', 'the other change is kept');
  await save('PM re-applies after the conflict', useStore.getState().updateTaskDueDate('bulk-a', '2026-11-25', 'Second thoughts'), 'task.update');
  await login('pm');
  assert.equal(taskOf('bulk-a').notes, 'changed elsewhere');
  assert.equal(taskOf('bulk-a').dueDate, '2026-11-25');
  console.log('[feature-saves] Lost-confirmation retry applied once, and a stale record conflicted cleanly then saved after refresh.');

  // Client ratings and the notices each role gets.
  for (const id of ['rate-low', 'rate-good', 'rate-change']) {
    insert('task', featureTask(id, { visibility: 'client-visible', status: 'Approved', isCompleted: false, completionPercentage: 80, clientApprovalStatus: 'Pending', assignedTo: 'staff', responsibleHodId: 'hod', assignmentState: 'assigned_staff' }));
  }
  await login('customer');
  await save('Client rates low', useStore.getState().reviewClientApproval('rate-low', 'Approved', '', { stars: 2, comment: 'Not what we asked' }), 'approval.review');
  await login('customer');
  await save('Client rates high', useStore.getState().reviewClientApproval('rate-good', 'Approved', '', { stars: 5 }), 'approval.review');
  await login('customer');
  await save('Client asks for changes', useStore.getState().reviewClientApproval('rate-change', 'Rejected', 'Please redo the colours'), 'approval.review');
  const customerFeed = await feedTitles();
  assert.equal(customerFeed.some(item => item.startsWith('Low Client Rating')), false, 'clients never see internal rating alerts');
  await login('pm');
  assert.equal(taskOf('rate-low').clientRating?.stars, 2);
  assert.equal(taskOf('rate-low').clientRating?.ratedBy, 'customer', 'the server stamps who rated');
  const pmFeed = await feedTitles();
  for (const expected of ['Low Client Rating|rate-low', 'Client Approved Task|rate-good', 'Client Requested Revision|rate-change']) assert.equal(pmFeed.includes(expected), true, `PM is told: ${expected}`);
  assert.equal(pmFeed.includes('Low Client Rating|rate-good'), false, 'a good rating is not a low-rating alert');
  await login('hod');
  const hodFeed = await feedTitles();
  for (const expected of ['Low Client Rating|rate-low', 'Client Requested Revision|rate-change']) assert.equal(hodFeed.includes(expected), true, `HOD is told: ${expected}`);
  await login('staff');
  const staffFeed = await feedTitles();
  assert.equal(staffFeed.includes('Low Client Rating|rate-low'), true, 'the assignee is told about a low rating');
  assert.equal(staffFeed.filter(item => item === 'Client Approved Task|rate-good').length, 1, 'the assignee gets one approval notice, not two');
  await login('boss');
  const bossFeed = await feedTitles();
  assert.equal(bossFeed.includes('Low Client Rating|rate-low'), true, 'Boss Koo is told about a low rating');
  assert.equal(bossFeed.filter(item => item === 'Client Approved Task|rate-good').length <= 1, true, 'Boss Koo is not told twice about a plain approval');
  console.log('[feature-saves] Client ratings persisted with a server-stamped rater, and each role received the right notices.');

  // Overdue notices: once per task, to the people who run it, never to Boss Koo.
  insert('task', featureTask('overdue-task', { status: 'In Progress', assignedTo: 'staff', responsibleHodId: 'hod', assignmentState: 'assigned_staff', dueDate: '2026-10-30' }));
  sql("update public.aitask_entities set data = data || jsonb_build_object('dueDate', to_char((now() at time zone 'Asia/Kuala_Lumpur')::date - 3, 'YYYY-MM-DD')) where workspace_id='aitask-main' and entity_type='task' and entity_id='overdue-task';");
  sql("select private.aitask_generate_overdue_task_notices('aitask-main', now());");
  sql("select private.aitask_generate_overdue_task_notices('aitask-main', now());");
  for (const [who, expected] of [['staff', 1], ['hod', 1], ['pm', 1], ['boss', 0]]) {
    await login(who);
    assert.equal((await feedTitles()).filter(item => item === 'Task Overdue|overdue-task').length, expected, `${who} overdue notices`);
  }
  console.log('[feature-saves] Overdue work was announced once to the assignee, HOD and PM, and not to Boss Koo.');

  // New companies, then the assignment chain and acceptance, as each role really does them.
  const clientNamed = name => useStore.getState().clients.find(client => client.clientName === name);
  await login('pm');
  const pmCompany = useStore.getState().createClientProfile({ clientName: 'PM Created Co', email: 'hello@pm-created.example', phone: '+60123456789' });
  await save('PM adds a company', pmCompany, 'client.upsert');
  assert.equal(useStore.getState().createClientProfile({ clientName: 'pm created co' }).ok, false, 'a duplicate company name is refused, whatever its case');
  await login('pm');
  assert.equal(clientNamed('PM Created Co')?.createdBy, 'pm', 'the PM owns the company they added');
  await login('boss');
  assert.equal(Boolean(clientNamed('PM Created Co')), true, 'Boss Koo sees a company a PM added');
  const bossCompany = useStore.getState().createClientProfile({ clientName: 'Boss Created Co' });
  await save('Boss adds a company', bossCompany, 'client.upsert');
  await save('Boss hands the company to a PM', useStore.getState().assignClientOwner(bossCompany.id, 'pm'), 'client.upsert');
  await login('pm');
  assert.equal(clientNamed('Boss Created Co')?.createdBy, 'pm', 'the PM now owns the company Boss Koo handed over');
  await login('hod');
  const hodCompany = useStore.getState().createClientProfile({ clientName: 'HOD Created Co' });
  await save('HOD adds a company', hodCompany, 'client.upsert');
  await login('hod');
  assert.equal(Boolean(clientNamed('HOD Created Co')), true, 'the HOD sees the company they added');
  await login('staff');
  assert.equal(useStore.getState().createClientProfile({ clientName: 'Staff Created Co' }).ok, false, 'Staff cannot add companies');
  await login('boss');
  const planned = useStore.getState().createClientWithPlan({ clientName: 'Planned Co', planName: 'Monthly', origin: 'custom', startDate: '2026-11-01', billingDay: 1,
    serviceItems: [{ id: 'planned-item', name: 'Design', platforms: [], unit: 'output', quantity: 1, unitPriceMinor: 100000 }], discountType: 'none', discountValue: 0, taxRateBps: 0 });
  await save('Boss adds a company with a plan', planned, 'client_plan.manage');
  await login('boss');
  assert.equal(useStore.getState().clientPlans.some(plan => plan.clientId === planned.clientId), true, 'the plan persists with the company');
  console.log('[assign-saves] Companies added by PM, Boss and HOD (and Boss with a plan) persisted; duplicates and Staff were refused.');

  const chainTask = (extra = {}) => ({ clientId: 'client', clientName: 'Save QA', projectId: 'curated', projectName: 'Curated', title: 'Chain work', description: 'Created by the PM', serviceType: 'Design', department: 'Designer',
    assignedTo: 'hod', createdBy: 'pm', assignedBy: 'pm', startDate: '2026-10-01', dueDate: '2026-11-30', status: 'Pending', priority: 'Medium', completionPercentage: 0, isRecurring: false, recurrenceFrequency: 'None', visibility: 'internal', ...extra });
  await login('pm');
  const chainId = useStore.getState().addTask(chainTask());
  assert.equal(Boolean(chainId), true, 'the PM can create work for a department HOD');
  await save('PM creates work for the HOD', { ok: Boolean(chainId) }, 'task.create');
  await login('hod');
  assert.equal(taskOf(chainId)?.assignedTo, 'hod', 'the HOD sees the work assigned to them');
  assert.equal((await feedTitles()).some(item => /^(New Task Assigned|Task Assigned To You)\|/.test(item) && item.endsWith(`|${chainId}`)), true, 'the HOD is told about the new assignment');
  await save('HOD accepts the assignment', useStore.getState().updateTaskWork(chainId, { kind: 'accept' }), 'task.update');
  await login('hod');
  assert.equal(taskOf(chainId).workState?.acceptedBy, 'hod', 'the HOD acceptance persists');
  await save('HOD hands the work to Staff', useStore.getState().updateTaskAssignee(chainId, 'staff'), 'task.update');
  await login('staff');
  assert.equal(taskOf(chainId)?.assignedTo, 'staff', 'Staff sees work handed to them');
  assert.equal((await feedTitles()).some(item => /^(New Task Assigned|Task Assigned To You)\|/.test(item) && item.endsWith(`|${chainId}`)), true, 'Staff is told about the assignment');
  await save('Staff accepts the assignment', useStore.getState().updateTaskWork(chainId, { kind: 'accept' }), 'task.update');
  await save('Staff starts the work', useStore.getState().updateTaskStatus(chainId, 'In Progress'), 'task.update');
  await login('pm');
  assert.equal(taskOf(chainId).workState?.acceptedBy, 'staff', 'the PM sees who accepted');
  assert.equal(taskOf(chainId).status, 'In Progress');
  await login('hod');
  assert.equal(taskOf(chainId).status, 'In Progress', 'the HOD sees the work moving');
  // Work created without an owner, then assigned later.
  await login('pm');
  const laterId = useStore.getState().addTask(chainTask({ title: 'Assigned later', assignedTo: '' }));
  assert.equal(Boolean(laterId), true, 'work can be created before anyone owns it');
  await save('PM creates unassigned work', { ok: Boolean(laterId) }, 'task.create');
  await save('PM assigns it later', useStore.getState().updateTaskAssignee(laterId, 'hod'), 'task.update');
  await login('hod');
  assert.equal(taskOf(laterId)?.assignedTo, 'hod', 'the HOD sees work assigned after creation');
  await save('HOD accepts the later assignment', useStore.getState().updateTaskWork(laterId, { kind: 'accept' }), 'task.update');
  // Staff who is not the assignee cannot accept someone else's work.
  await login('other');
  assert.equal(taskOf(chainId), undefined, 'other Staff cannot even see the work');
  console.log('[assign-saves] PM -> HOD -> Staff assignment, acceptance by each, later assignment and the notices persisted through authenticated REST.');

  console.log('[staff-saves] Actual frontend actions persisted through authenticated REST: creation rejection/legacy deletion, edits, status, priority, dates, comments, derived delivery/reopening, HOD delegation, reload and lost-confirmation retry.');
} finally {
  globalThis.fetch = originalFetch;
  if (supabase) await supabase.auth.signOut();
  if (server) await server.close();
  if (accounts.length) sql("delete from public.aitask_entities where workspace_id='aitask-main' and entity_type <> 'custom_role'; delete from public.aitask_members where workspace_id='aitask-main';");
  await admin.storage.from('client-service-files').remove([evidencePath]);
  for (const account of accounts) await admin.auth.admin.deleteUser(account.authId);
}
