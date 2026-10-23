import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript';

// This verifier is intentionally narrow and local-only. It is called by the
// disposable Supabase rollout gate and rejects hosted or production targets.
const localUrl = process.env.AITASK_LOCAL_TEST_URL;
const localPublicKey = process.env.AITASK_LOCAL_TEST_PUBLIC;
const localSecretKey = process.env.AITASK_LOCAL_TEST_SECRET;
const databaseContainer = process.env.AITASK_LOCAL_TEST_DB;
if (!localUrl || new URL(localUrl).protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(new URL(localUrl).hostname)
  || !localPublicKey || !localSecretKey || !databaseContainer?.startsWith('supabase_db_aitask-supabase-validation-')) {
  throw new Error('Security-audit lead validation requires the disposable local Supabase stack.');
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(localUrl, localSecretKey, options);
const sql = (query, extra = []) => execFileSync('docker', [
  'exec', '-i', databaseContainer, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', ...extra,
], { input: query, stdio: ['pipe', 'pipe', 'pipe'] });
const sqlScalar = query => sql(query, ['-t', '-A']).toString().trim();
const makeClient = () => createClient(localUrl, localPublicKey, options);

const loadEdgeHandler = (relativePath, env) => {
  let handler;
  // Both functions have one runtime type-import line and one npm import line.
  const source = readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8').split('\n').slice(2).join('\n');
  const executable = transpileModule(source, {
    compilerOptions: { target: ScriptTarget.ES2022, module: ModuleKind.None },
  }).outputText;
  const deno = { env: { get: key => env[key] }, serve: next => { handler = next; } };
  const clientFactory = (url, key, clientOptions) => createClient(url, key, clientOptions);
  new Function('createClient', 'Deno', executable)(clientFactory, deno);
  assert.equal(typeof handler, 'function', `Expected ${relativePath} to register a handler`);
  return handler;
};

const createAuthUser = async (email, password) => {
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(created.error);
  return created.data.user;
};

const signIn = async (email, password) => {
  const client = makeClient();
  const result = await client.auth.signInWithPassword({ email, password });
  assert.ifError(result.error);
  assert(result.data.session?.access_token, `Expected a local session for ${email}`);
  return { client, session: result.data.session, user: result.data.user };
};

const cleanupWorkspace = async (workspace, authIds, paths = []) => {
  if (paths.length) await admin.storage.from('client-service-files').remove(paths).catch(() => undefined);
  try {
    // The immutable-history triggers are deliberately bypassed only while
    // deleting disposable fixture rows; application code is never changed.
    sql(`alter table public.aitask_entity_history disable trigger aitask_guard_entity_history_immutable;
      alter table public.aitask_members disable trigger aitask_capture_member_history;
      alter table public.aitask_entities disable trigger aitask_capture_entity_history;
      delete from public.aitask_entity_history where workspace_id='${workspace}';
      delete from public.aitask_workspaces where id='${workspace}';
      alter table public.aitask_entities enable trigger aitask_capture_entity_history;
      alter table public.aitask_members enable trigger aitask_capture_member_history;
      alter table public.aitask_entity_history enable trigger aitask_guard_entity_history_immutable;`);
  } catch (error) {
    console.error(`[security-audit] Disposable cleanup warning for ${workspace}: ${error.message}`);
  }
  for (const id of authIds) await admin.auth.admin.deleteUser(id).catch(() => undefined);
};

const jsonResponse = async response => ({ status: response.status, body: await response.json() });

const validateEmailTransition = async () => {
  const suffix = randomUUID();
  const workspace = `audit-email-${suffix}`;
  const memberId = `email-staff-${suffix}`;
  const originalEmail = `email-old-${suffix}@aitask.local`;
  const replacementEmail = `email-new-${suffix}@aitask.local`;
  const feedbackEmail = `feedback-${suffix}@aitask.local`;
  const password = `Local-${suffix}!`;
  const authIds = [];
  let feedbackId;
  try {
    const authUser = await createAuthUser(originalEmail, password);
    authIds.push(authUser.id);
    sql(`insert into public.aitask_workspaces(id,name) values ('${workspace}','Local email transition QA');
      insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,is_super_admin,must_reset_password)
      values ('${memberId}','${workspace}','${authUser.id}','Local email staff','${originalEmail}','Staff','Designer',array['Designer'],false,false);`);

    const answers = Object.fromEntries([
      'login', 'account_details', 'role_access', 'dashboard', 'navigation', 'responsive',
      'task_scope', 'task_actions', 'task_fields', 'calendar', 'client_scope', 'client_details',
      'client_actions', 'comments', 'approvals', 'save_status', 'sync', 'offline_pwa',
    ].map(id => [id, 'pass']));
    const feedback = await admin.from('aitask_feedback_submissions').insert({
      campaign: 'launch-week-2026-07', name: 'Local dummy reviewer row', email: feedbackEmail,
      role: 'Staff', organization: 'Disposable local QA', device: 'Desktop', language: 'en',
      answers, issue_details: {}, ratings: { overall: 5, usability: 5, reliability: 5, mobile: null },
      most_useful: 'Local boundary check', most_confusing: '', recommendation: 'pass', is_late: false,
    }).select('id').single();
    assert.ifError(feedback.error);
    feedbackId = feedback.data.id;

    const signed = await signIn(originalEmail, password);
    const inviteHandler = loadEdgeHandler('supabase/functions/invite-aitask-member/index.ts', {
      SUPABASE_URL: localUrl.replace(/\/$/, ''), SUPABASE_SERVICE_ROLE_KEY: localSecretKey,
      SUPABASE_ANON_KEY: localPublicKey, AITASK_PUBLIC_URL: 'https://app.test', AITASK_ALLOWED_ORIGINS: 'https://app.test',
    });
    const inviteResponse = await inviteHandler(new Request('https://app.test/invite', {
      method: 'POST', headers: { Authorization: `Bearer ${signed.session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_self_email', email: replacementEmail, currentPassword: password }),
    }));
    const inviteResult = await jsonResponse(inviteResponse);
    assert.equal(inviteResult.status, 200, JSON.stringify(inviteResult.body));
    assert.equal(inviteResult.body.ok, true, JSON.stringify(inviteResult.body));

    const authState = await admin.auth.admin.getUserById(authUser.id);
    assert.ifError(authState.error);
    const oldTokenUser = await signed.client.auth.getUser(signed.session.access_token);
    assert.ifError(oldTokenUser.error);
    const replacement = await signIn(replacementEmail, password);
    const reviewerHandler = loadEdgeHandler('supabase/functions/aitask-feedback/index.ts', {
      SUPABASE_URL: localUrl.replace(/\/$/, ''), SUPABASE_SERVICE_ROLE_KEY: localSecretKey,
      AITASK_PUBLIC_URL: 'https://app.test', AITASK_ALLOWED_ORIGINS: 'https://app.test',
      AITASK_FEEDBACK_REVIEWER_EMAILS: replacementEmail,
    });
    const reviewerResponse = await reviewerHandler(new Request('https://app.test/feedback', {
      method: 'POST', headers: {
        Authorization: `Bearer ${replacement.session.access_token}`, Origin: 'https://app.test', 'Content-Type': 'application/json',
      }, body: JSON.stringify({ action: 'results' }),
    }));
    const reviewerResult = await jsonResponse(reviewerResponse);
    assert.equal(reviewerResult.status, 200, JSON.stringify(reviewerResult.body));
    assert.equal(reviewerResult.body.ok, true, JSON.stringify(reviewerResult.body));
    assert.equal(reviewerResult.body.reviewer, 'developer');
    assert(reviewerResult.body.submissions.some(row => row.id === feedbackId), 'Dummy feedback row was not returned to the allowlisted reviewer.');

    console.log('[security-audit] Email transition local check:', JSON.stringify({
      input: { workspace, memberId, authUserId: authUser.id, originalEmail, replacementEmail, feedbackEmail, feedbackId, currentPassword: '[dummy secret omitted]' },
      updateSelfEmail: { status: inviteResult.status, response: inviteResult.body },
      authState: { email: authState.data.user.email, emailConfirmedAt: authState.data.user.email_confirmed_at },
      getUserAfterUpdate: { email: oldTokenUser.data.user.email, emailConfirmedAt: oldTokenUser.data.user.email_confirmed_at },
      feedbackReviewer: { status: reviewerResult.status, reviewer: reviewerResult.body.reviewer, returnedDummySubmission: true },
      environmentLimits: ['local HTTP API at 127.0.0.1', 'dummy Auth user and dummy feedback row', 'no hosted Edge ingress or real mailbox delivery'],
    }));
  } finally {
    if (feedbackId) await admin.from('aitask_feedback_submissions').delete().eq('id', feedbackId);
    await cleanupWorkspace(workspace, authIds);
  }
};

const validateServiceFilePublication = async () => {
  const suffix = randomUUID();
  const workspace = `audit-files-${suffix}`;
  const clientId = 'client';
  const cycleId = 'cycle';
  const commentId = 'forged-comment';
  const path = `${workspace}/${clientId}/${cycleId}/owner-file.pdf`;
  const staffMemberId = `staff-${suffix}`;
  const ownerMemberId = `owner-${suffix}`;
  const clientMemberId = `client-${suffix}`;
  const staffEmail = `staff-${suffix}@aitask.local`;
  const ownerEmail = `owner-${suffix}@aitask.local`;
  const clientEmail = `client-${suffix}@aitask.local`;
  const password = `Local-${suffix}!`;
  const authIds = [];
  try {
    const staffAuth = await createAuthUser(staffEmail, password);
    const ownerAuth = await createAuthUser(ownerEmail, password);
    const clientAuth = await createAuthUser(clientEmail, password);
    authIds.push(staffAuth.id, ownerAuth.id, clientAuth.id);
    sql(`insert into public.aitask_workspaces(id,name) values ('${workspace}','Local service-file publication QA');
      insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,is_super_admin,must_reset_password,permissions,client_name)
      values
        ('${staffMemberId}','${workspace}','${staffAuth.id}','First local Staff','${staffEmail}','Staff','Designer',array['Designer'],false,false,'{"viewAllServiceClients":true}'::jsonb,null),
        ('${ownerMemberId}','${workspace}','${ownerAuth.id}','Second local Staff','${ownerEmail}','Staff','Designer',array['Designer'],false,false,'{}'::jsonb,null),
        ('${clientMemberId}','${workspace}','${clientAuth.id}','Local Client','${clientEmail}','Client','Client',array['Client'],false,false,'{}'::jsonb,'Local Service Client');
      insert into public.aitask_entities(workspace_id,entity_type,entity_id,data)
      values
        ('${workspace}','client','${clientId}',$json$${JSON.stringify({ id: clientId, clientName: 'Local Service Client', createdBy: staffMemberId })}$json$::jsonb),
        ('${workspace}','service_cycle','${cycleId}',$json$${JSON.stringify({ id: cycleId, clientId, clientName: 'Local Service Client', planId: 'local-plan', status: 'Published', periodStart: '2026-10-01', periodEnd: '2026-10-31', serviceItems: [] })}$json$::jsonb);`);

    const owner = await signIn(ownerEmail, password);
    const staff = await signIn(staffEmail, password);
    const client = await signIn(clientEmail, password);
    // Seed the object through the local service client, then set its Storage
    // owner to the second internal user. This keeps the fixture focused on
    // forged publication rather than the separate upload-scope policy.
    const uploaded = await admin.storage.from('client-service-files').upload(path, Buffer.from('%PDF-1.4\nLocal publication QA\n%%EOF'), { contentType: 'application/pdf' });
    assert.ifError(uploaded.error);
    sql(`update storage.objects set owner_id='${ownerAuth.id}' where bucket_id='client-service-files' and name='${path}';`);
    assert.equal(sqlScalar(`select owner_id from storage.objects where bucket_id='client-service-files' and name='${path}';`), ownerAuth.id);

    const attachment = {
      id: `owner-file-${suffix}`, bucket: 'client-service-files', path, uploadedBy: ownerMemberId,
      fileName: 'owner-file.pdf', mimeType: 'application/pdf', sizeBytes: 37, uploadedAt: new Date().toISOString(),
    };
    const forgedComment = await staff.client.rpc('aitask_execute_service_command', {
      p_workspace_id: workspace, p_command_id: randomUUID(), p_command_type: 'cycle_comment.manage', p_expected_workspace_version: null,
      p_operations: [{ kind: 'entity', action: 'insert', entityType: 'cycle_comment', entityId: commentId, expectedVersion: 0, data: {
        id: commentId, clientId, clientName: 'Local Service Client', cycleId, userId: staffMemberId, authorId: staffMemberId,
        visibility: 'client-visible', text: 'First Staff references second Staff object', message: 'First Staff references second Staff object', attachments: [attachment],
      } }],
    });
    assert.ifError(forgedComment.error);
    assert.equal(forgedComment.data.ok, true, JSON.stringify(forgedComment.data));

    const downloaded = await client.client.storage.from('client-service-files').download(path);
    assert.ifError(downloaded.error);
    assert.match(await downloaded.data.text(), /^%PDF-1\.4/);
    console.log('[security-audit] Service-file publication local check:', JSON.stringify({
      input: { workspace, staffMemberId, ownerMemberId, clientMemberId, cycleId, commentId, path, ownerAuthUserId: ownerAuth.id, commentVisibility: 'client-visible' },
      forgedStaffComment: { rpcOk: forgedComment.data.ok, responseCode: forgedComment.data.code || null },
      clientStorageRead: { allowed: true, path, contentPrefix: '%PDF-1.4' },
      environmentLimits: ['local HTTP API and local Storage only', 'dummy Staff/Client users and dummy PDF object', 'stopped after first Client allow result; no deployed endpoint tested'],
    }));
  } finally {
    await cleanupWorkspace(workspace, authIds, [path]);
  }
};

await validateEmailTransition();
await validateServiceFilePublication();
console.log('[security-audit] Two bounded local validation checks passed; deployment-dependent leads remain needs_validation.');
