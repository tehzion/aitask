import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

// This runner deliberately accepts only the release gate's disposable local
// stack. It cannot target either production or hosted staging.
const url = process.env.AITASK_LOCAL_TEST_URL;
const container = process.env.AITASK_LOCAL_TEST_DB;
if (!url || new URL(url).hostname !== '127.0.0.1' || new URL(url).protocol !== 'http:' || !container?.startsWith('supabase_db_aitask-supabase-validation-')) throw new Error('A disposable local release-test stack is required.');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, process.env.AITASK_LOCAL_TEST_SECRET, options);
const client = createClient(url, process.env.AITASK_LOCAL_TEST_PUBLIC, options);
const other = createClient(url, process.env.AITASK_LOCAL_TEST_PUBLIC, options);
const suffix = randomUUID();
const workspace = `upload-storage-${suffix}`;
const paths = ['saved.pdf', 'abandoned.pdf', 'retry.pdf'].map(name => `${workspace}/client/cycle/${name}`);
const authIds = [];
const sql = query => execFileSync('docker', ['exec', '-i', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'], { input: query, stdio: ['pipe', 'pipe', 'pipe'] });
let loseConfirmation = false;
const unreliable = createClient(url, process.env.AITASK_LOCAL_TEST_PUBLIC, { ...options, global: { fetch: async (...args) => {
  const response = await fetch(...args);
  if (loseConfirmation && String(args[0]).includes('/rpc/aitask_execute_service_command')) { loseConfirmation = false; await response.arrayBuffer(); throw new Error('Injected lost server confirmation'); }
  return response;
} } });
try {
  const password = `Local-${randomUUID()}!`;
  for (const label of ['owner', 'other']) {
    const email = `${label}-${suffix}@aitask.local`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(created.error); authIds.push(created.data.user.id);
    const signed = await (label === 'owner' ? client : other).auth.signInWithPassword({ email, password }); assert.ifError(signed.error);
    if (label === 'owner') assert.ifError((await unreliable.auth.signInWithPassword({ email, password })).error);
  }
  sql(`insert into public.aitask_workspaces(id,name) values('${workspace}','Isolated upload storage QA');
    insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,is_super_admin) values
    ('owner','${workspace}','${authIds[0]}','Owner','owner-${suffix}@aitask.local','Project Manager','Management',array['Management'],true),
    ('other','${workspace}','${authIds[1]}','Other','other-${suffix}@aitask.local','Project Manager','Management',array['Management'],true);
    insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
    ('${workspace}','client','client','{"id":"client","clientName":"Storage QA","createdBy":"owner"}'),
    ('${workspace}','service_cycle','cycle','{"id":"cycle","clientId":"client","clientName":"Storage QA","planId":"plan","status":"Published","periodStart":"2026-09-01","periodEnd":"2026-09-30","serviceItems":[]}');`);
  for (const path of paths) assert.ifError((await client.storage.from('client-service-files').upload(path, Buffer.from('%PDF-1.4\nIsolated QA\n%%EOF'), { contentType: 'application/pdf' })).error);
  const command = randomUUID();
  const attachment = { id: 'saved-file', bucket: 'client-service-files', path: paths[0], uploadedBy: 'owner', fileName: 'saved.pdf', mimeType: 'application/pdf', sizeBytes: 32, uploadedAt: new Date().toISOString() };
  loseConfirmation = true;
  const saved = await unreliable.rpc('aitask_execute_service_command', { p_workspace_id: workspace, p_command_id: command, p_command_type: 'cycle_comment.manage', p_expected_workspace_version: null, p_operations: [{ kind: 'entity', action: 'insert', entityType: 'cycle_comment', entityId: 'saved-comment', expectedVersion: 0, data: { id: 'saved-comment', clientId: 'client', clientName: 'Storage QA', cycleId: 'cycle', authorId: 'owner', visibility: 'internal', message: 'QA attachment', attachments: [attachment] } }] });
  assert(saved.error, 'the browser must observe an uncertain confirmation');
  const reconcile = (session, path, commandId, abandon) => session.rpc('aitask_reconcile_service_upload', { p_workspace_id: workspace, p_path: path, p_command_id: commandId, p_abandon: abandon });
  const referenced = await reconcile(client, paths[0], command, true); assert.ifError(referenced.error); assert.equal(referenced.data.status, 'referenced');
  // A direct deletion must not remove the saved object even if Storage returns
  // an empty success list for an RLS-filtered request.
  await client.storage.from('client-service-files').remove([paths[0]]);
  assert.ifError((await client.storage.from('client-service-files').download(paths[0])).error);
  assert.equal((await reconcile(other, paths[1], null, true)).data.ok, false);
  const discarded = randomUUID();
  assert.equal((await reconcile(client, paths[1], discarded, true)).data.status, 'abandoned');
  const replay = await client.rpc('aitask_execute_service_command', { p_workspace_id: workspace, p_command_id: discarded, p_command_type: 'cycle_comment.manage', p_expected_workspace_version: null, p_operations: [{ kind: 'entity', action: 'insert', entityType: 'cycle_comment', entityId: 'late-comment', expectedVersion: 0, data: {} }] });
  assert.equal(replay.data.code, 'ABANDONED');
  assert.ifError((await client.storage.from('client-service-files').remove([paths[1]])).error);
  assert((await admin.storage.from('client-service-files').download(paths[1])).error, 'the abandoned object is actually removed');
  assert.equal((await reconcile(client, paths[2], null, true)).data.status, 'abandoned');
  // Retry status after an interrupted cleanup remains idempotent.
  assert.equal((await reconcile(client, paths[2], null, true)).data.status, 'abandoned');
  assert.ifError((await client.storage.from('client-service-files').remove([paths[2]])).error);
  assert.ifError((await client.storage.from('client-service-files').download(paths[0])).error);
  console.log('[storage] Lost confirmation, reference protection, account denial, discard fencing and cleanup retry passed against real local Storage.');
} finally {
  await admin.storage.from('client-service-files').remove(paths);
  sql(`delete from public.aitask_workspaces where id='${workspace}';`);
  for (const id of authIds) await admin.auth.admin.deleteUser(id);
}
