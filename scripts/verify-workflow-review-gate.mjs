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
const password = `Local-${randomUUID()}!`;
const accounts = [];
let server;
let supabase;
try {
  assert.match(sql("select count(*) from public.aitask_members where workspace_id='aitask-main';"), /\n\s*0\s*\n/, 'validation workspace must be empty');
  for (const [id, role, departments, isBoss] of [['review-boss', 'Project Manager', ['Management'], true], ['review-worker', 'Staff', ['Video Editor', 'Designer'], false], ['review-hod', 'HOD', ['Video Editor'], false]]) {
    const email = `${id}-${randomUUID()}@aitask.local`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(created.error);
    assert.match(created.data.user.id, /^[0-9a-f-]{36}$/i);
    accounts.push({ id, role, departments, isBoss, email, authId: created.data.user.id });
  }
  sql("insert into public.aitask_workspaces(id,name) values('aitask-main','Isolated review QA') on conflict (id) do nothing;");
  for (const account of accounts) sql(`insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,is_super_admin) values('${account.id}','aitask-main','${account.authId}','${account.id}','${account.email}','${account.role}','${account.departments[0]}',array[${account.departments.map(value => `'${value}'`).join(',')}],${account.isBoss});`);
  const insert = (type, data) => sql(`insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values('aitask-main','${type}','${data.id}','${JSON.stringify(data).replaceAll("'", "''")}'::jsonb);`);
  const workflow = { templateId: 'review-template', templateRevision: 1, templateName: 'Reviewed production', name: 'Reviewed production', steps: [
    { id: 'work-step', order: 1, title: 'Create output', department: 'Designer', kind: 'work', clientVisible: false, required: true },
    { id: 'review-step', order: 2, title: 'Review output', department: 'Video Editor', kind: 'internal_review', clientVisible: false, required: true },
    { id: 'publish-step', order: 3, title: 'Publish output', department: 'Designer', kind: 'publishing', clientVisible: true, required: true },
  ] };
  insert('client', { id: 'review-company', clientName: 'Review QA', createdBy: 'review-boss', createdAt: '2026-10-01', updatedAt: '2026-10-01' });
  insert('service_cycle', { id: 'review-cycle', clientId: 'review-company', clientName: 'Review QA', planId: 'review-plan', planRevision: 1, periodStart: '2026-10-01', periodEnd: '2026-10-31', status: 'Published', currency: 'MYR', serviceItems: [{ id: 'review-service', name: 'Design', unit: 'output', quantity: 1, platforms: [], unitPriceMinor: 0, workflow }], addonSnapshots: [], discountType: 'none', discountValue: 0, taxRateBps: 0, createdAt: '2026-10-01', updatedAt: '2026-10-01' });
  insert('deliverable', { id: 'review-output', clientId: 'review-company', clientName: 'Review QA', planId: 'review-plan', cycleId: 'review-cycle', serviceItemId: 'review-service', sequence: 1, title: 'Reviewed output', status: 'Planned', taskIds: [], attachments: [], createdAt: '2026-10-01', updatedAt: '2026-10-01' });
  process.env.VITE_SUPABASE_URL = url;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = process.env.AITASK_LOCAL_TEST_PUBLIC;
  process.env.VITE_AITASK_BACKEND = 'supabase';
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
  ({ supabase } = await server.ssrLoadModule('/src/lib/supabaseClient.ts'));
  const secure = await server.ssrLoadModule('/src/lib/secureWorkspace.ts');
  const { useStore, clearWorkspaceSession } = await server.ssrLoadModule('/src/store/index.ts');
  const initial = useStore.getState();
  const login = async id => {
    clearWorkspaceSession({ discardPending: true });
    const account = accounts.find(item => item.id === id);
    const signed = await supabase.auth.signInWithPassword({ email: account.email, password });
    assert.ifError(signed.error);
    const loaded = await secure.loadSecureWorkspace(signed.data.user);
    useStore.setState({ ...initial, ...loaded.state, currentUser: loaded.currentUser, backend: { ...initial.backend, mode: 'supabase', status: 'live', isConfigured: true, isLoading: false, isSaving: false, isPulling: false, hasLocalChanges: false, pendingMutations: 0, workspaceVersion: loaded.revision.version } }, true);
  };
  const save = async (label, result, type = 'task.update') => {
    assert.equal(result.ok, true, `${label}: action rejected: ${result.error}`);
    useStore.setState(state => ({ backend: { ...state.backend, hasLocalChanges: true, pendingMutations: 1, pendingCommandType: type } }));
    const saved = await useStore.getState().commitPendingMutation(type);
    assert.equal(saved.ok, true, `${label}: save failed: ${saved.error}`);
  };
  await login('review-boss');
  assert.equal((await secure.loadSecureBackendCapabilities()).compatible, true);
  const generated = useStore.getState().generateDeliverableTaskChain('review-output');
  const [workId, reviewId, publishId] = generated.taskIds || [];
  await save('Workflow generation', generated, 'deliverable.workflow.generate');
  for (const id of [workId, reviewId, publishId]) await save('Assignment', useStore.getState().updateTaskAssignee(id, 'review-worker'));
  await login('review-worker');
  assert.equal(useStore.getState().updateTaskStatus(reviewId, 'Completed').ok, false);
  await save('Work completion', useStore.getState().updateTaskStatus(workId, 'Completed'));
  assert.equal(useStore.getState().updateTaskStatus(reviewId, 'Completed').ok, false, 'assigned Staff must not self-approve internal review');
  const review = useStore.getState().tasks.find(item => item.id === reviewId);
  const forged = await supabase.rpc('aitask_execute_command', { p_workspace_id: 'aitask-main', p_command_id: randomUUID(), p_command_type: 'task.update', p_operations: [{ kind: 'entity', action: 'update', entityType: 'task', entityId: reviewId, expectedVersion: review.version, data: { ...review, status: 'Completed', isCompleted: true, workflowStepKind: 'work', internalReview: { reviewedBy: 'review-hod' } } }] });
  assert.equal(forged.data?.ok, false, 'canonical SQL must reject a crafted browser request');
  await save('Review submission', useStore.getState().updateTaskStatus(reviewId, 'Waiting Approval'));
  await login('review-hod');
  assert.equal(useStore.getState().tasks.some(item => item.id === workId), false, 'hidden predecessor must stay outside HOD scope');
  assert.equal(useStore.getState().tasks.find(item => item.id === reviewId).workflowDependenciesReady, true);
  await save('HOD approval', useStore.getState().updateTaskStatus(reviewId, 'Completed'));
  const approved = useStore.getState().tasks.find(item => item.id === reviewId);
  assert.equal(approved.internalReview?.reviewedBy, 'review-hod');
  assert.match(approved.internalReview?.decisionId || '', /^[0-9a-f-]{36}$/i, 'approval requires a server-issued decision');
  assert.equal(approved.internalReview?.inputVersions[0]?.outputVersion, 2, 'canonical refresh must replace the optimistic hidden-input version');
  assert.equal(useStore.getState().tasks.some(item => item.id === workId), false, 'saving must not widen HOD visibility');
  // Existing Completed records need a real update even when no content field
  // changes; the server, rather than optimistic task JSON, owns the decision.
  sql(`alter table public.aitask_entities disable trigger aitask_zz_guard_workflow_task;
    update public.aitask_entities set data=data-'internalReview' where workspace_id='aitask-main' and entity_id='${reviewId}';
    alter table public.aitask_entities enable trigger aitask_zz_guard_workflow_task;`);
  await login('review-hod');
  assert.equal(useStore.getState().tasks.find(item => item.id === reviewId).status, 'Completed');
  assert.equal(useStore.getState().tasks.find(item => item.id === reviewId).internalReview, undefined);
  await save('Explicit legacy sign-off', useStore.getState().updateTaskStatus(reviewId, 'Completed'));
  const legacyApproval = useStore.getState().tasks.find(item => item.id === reviewId);
  assert.match(legacyApproval.internalReview?.decisionId || '', /^[0-9a-f-]{36}$/i);
  assert.notEqual(legacyApproval.internalReview.decisionId, approved.internalReview.decisionId);
  await login('review-worker');
  await save('Publication', useStore.getState().updateTaskStatus(publishId, 'Completed'));
  await save('Output revision', useStore.getState().updateTaskAttachment(workId, 'https://example.com/revised-output.pdf'));
  assert.equal(useStore.getState().tasks.find(item => item.id === reviewId).status, 'Pending');
  assert.equal(useStore.getState().tasks.find(item => item.id === reviewId).internalReview, undefined);
  assert.equal(useStore.getState().tasks.find(item => item.id === publishId).status, 'Pending');
  console.log('[review-gate] Real Auth/REST verified frozen generation, Staff denial, crafted request denial, hidden dependency summaries, canonical HOD signatures and downstream reopening through the native save path.');
} finally {
  if (supabase) await supabase.auth.signOut();
  if (server) await server.close();
  if (accounts.length) sql("delete from public.aitask_entities where workspace_id='aitask-main' and entity_type <> 'custom_role'; delete from public.aitask_members where workspace_id='aitask-main';");
  for (const account of accounts) await admin.auth.admin.deleteUser(account.authId);
}
