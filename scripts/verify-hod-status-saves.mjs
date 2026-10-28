import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createServer } from 'vite';
import { chromium, expect } from '@playwright/test';

const url = process.env.AITASK_LOCAL_TEST_URL;
const container = process.env.AITASK_LOCAL_TEST_DB;
if (!url || new URL(url).hostname !== '127.0.0.1' || new URL(url).protocol !== 'http:' || !container?.startsWith('supabase_db_aitask-supabase-validation-')) throw new Error('A disposable local release-test stack is required.');
const admin = createClient(url, process.env.AITASK_LOCAL_TEST_SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
const sql = query => execFileSync('docker', ['exec', '-i', container, 'psql', '-X', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'], { input: query, stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const accounts = [];
const password = `Local-${randomUUID()}!`;
const suffix = randomUUID();
const originalFetch = globalThis.fetch;
let loseConfirmation = false;
let server;
let supabase;
let browser;
globalThis.fetch = async (...args) => {
  const response = await originalFetch(...args);
  if (loseConfirmation && String(args[0]).includes('/rpc/aitask_execute_command')) {
    loseConfirmation = false;
    await response.arrayBuffer();
    throw new Error('Injected lost HOD status confirmation');
  }
  return response;
};
try {
  assert.equal(sql("select count(*) from public.aitask_members where workspace_id='aitask-main'"), '0', 'Refuse to replace an existing workspace');
  for (const [id, role, departments, boss] of [
    ['status-boss', 'Project Manager', ['Management'], true],
    ['status-pm', 'Project Manager', ['Management'], false],
    ['status-hod', 'HOD', ['Video Shooting', 'Video Editor'], false],
    ['status-staff', 'Staff', ['Video Shooting'], false],
    ['status-foreign', 'Staff', ['Designer'], false],
  ]) {
    const email = `${id}-${suffix}@aitask.local`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(created.error);
    accounts.push({ id, role, departments, boss, email, authId: created.data.user.id });
  }
  sql("insert into public.aitask_workspaces(id,name) values('aitask-main','Isolated HOD status QA') on conflict(id) do nothing");
  for (const account of accounts) sql(`insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,is_super_admin,must_reset_password) values(${quote(account.id)},'aitask-main',${quote(account.authId)},${quote(account.id)},${quote(account.email)},${quote(account.role)},${quote(account.departments[0])},array[${account.departments.map(quote).join(',')}],${account.boss},false)`);
  const insert = (type, data) => sql(`insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values('aitask-main',${quote(type)},${quote(data.id)},${quote(JSON.stringify(data))}::jsonb)`);
  for (const status of ['Pending', 'In Progress', 'Waiting Approval', 'Approved', 'Completed', 'Cancelled']) insert('task_status', { id: status, status });
  insert('client', { id: 'status-company', clientName: 'Status QA Company', createdBy: 'status-pm' });
  insert('project', { id: 'status-project', clientId: 'status-company', clientName: 'Status QA Company', projectName: 'Status QA Project', createdBy: 'status-pm', projectManagerIds: ['status-pm'], hodMemberIds: ['status-hod'], staffMemberIds: ['status-staff', 'status-foreign'], services: ['Shooting'], startDate: '2026-10-01', deadline: '2026-10-30' });
  const baseTask = { id: 'status-task', clientId: 'status-company', clientName: 'Status QA Company', projectId: 'status-project', projectName: 'Status QA Project', title: 'HOD assigned shooting task', serviceType: 'Shooting', department: 'Video Shooting', assignedTo: 'status-hod', assignedBy: 'status-pm', createdBy: 'status-pm', startDate: '2026-10-01', dueDate: '2026-10-30', status: 'In Progress', priority: 'Medium', description: '', completionPercentage: 30, isCompleted: false, revisionCount: 0, clientApprovalStatus: 'Pending', isRecurring: false, visibility: 'internal', workState: {}, workHistory: [] };
  insert('task', baseTask);
  insert('task', { ...baseTask, id: 'status-oversight', assignedTo: 'status-staff' });
  insert('task', { ...baseTask, id: 'status-foreign-task', department: 'Designer', assignedTo: 'status-foreign' });
  process.env.VITE_SUPABASE_URL = url;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = process.env.AITASK_LOCAL_TEST_PUBLIC;
  process.env.VITE_AITASK_BACKEND = 'supabase';
  process.env.VITE_AITASK_SHOW_DEMO_LOGIN = 'false';
  server = await createServer({ server: { host: '127.0.0.1', port: 57500 + (process.pid % 200), strictPort: true, ws: false, hmr: false }, logLevel: 'error' });
  await server.listen();
  ({ supabase } = await server.ssrLoadModule('/src/lib/supabaseClient.ts'));
  const secure = await server.ssrLoadModule('/src/lib/secureWorkspace.ts');
  const { useStore, clearWorkspaceSession } = await server.ssrLoadModule('/src/store/index.ts');
  const initial = useStore.getState();
  const login = async id => {
    clearWorkspaceSession({ discardPending: true });
    secure.discardSecureWorkspaceCommand();
    const account = accounts.find(account => account.id === id);
    const signed = await supabase.auth.signInWithPassword({ email: account.email, password });
    assert.ifError(signed.error);
    const loaded = await secure.loadSecureWorkspace(signed.data.user);
    useStore.setState({ ...initial, ...loaded.state, currentUser: loaded.currentUser, backend: { ...initial.backend, mode: 'supabase', status: 'live', isConfigured: true, isLoading: false, isPulling: false, isSaving: false, hasLocalChanges: false, pendingMutations: 0, workspaceVersion: loaded.revision.version, errorCode: undefined } }, true);
    return loaded;
  };
  const change = async (id, status) => {
    assert.equal(useStore.getState().updateTaskStatus(id, status).ok, true);
    // Node has no browser auto-sync subscription; stage the real store mutation.
    useStore.setState(state => ({ backend: { ...state.backend, hasLocalChanges: true, pendingMutations: 1 } }));
    return useStore.getState().commitPendingMutation('task.update');
  };
  const canonicalStatus = id => sql(`select data->>'status' from public.aitask_entities where workspace_id='aitask-main' and entity_type='task' and entity_id=${quote(id)}`);
  await login('status-hod');
  for (const status of ['Pending', 'In Progress', 'Pending', 'In Progress']) {
    assert.equal((await change('status-task', status)).ok, true, `HOD assigned task -> ${status}`);
    assert.equal(canonicalStatus('status-task'), status);
  }
  assert.equal((await change('status-oversight', 'Pending')).ok, true, 'HOD can update another worker within department scope');
  assert.equal(canonicalStatus('status-oversight'), 'Pending');
  assert.equal(useStore.getState().updateTaskStatus('status-foreign-task', 'Pending').ok, false, 'Foreign department stays inaccessible');
  assert.equal(useStore.getState().updateTaskStatus('status-task', 'Approved').ok, false, 'Worker cannot approve own work');
  assert.equal(useStore.getState().updateTaskStatus('status-task', 'Completed').ok, false, 'Worker cannot bypass PM completion');

  await login('status-hod');
  const before = Number(sql("select count(*) from public.aitask_audit_events where entity_id='status-task' and actor_member_id='status-hod'"));
  loseConfirmation = true;
  assert.equal((await change('status-task', 'Pending')).ok, false, 'Lost acknowledgement must not claim a confirmed save');
  assert.equal(canonicalStatus('status-task'), 'Pending', 'First request reached the database');
  assert.ok(secure.getRetainedSecureCommand(), 'Retain the same command for retry');
  assert.equal((await useStore.getState().retryPendingSave()).ok, true, 'Explicit retry confirms the committed command');
  assert.equal(Number(sql("select count(*) from public.aitask_audit_events where entity_id='status-task' and actor_member_id='status-hod'")), before + 1, 'Retry does not duplicate the status update');
  assert.equal(useStore.getState().backend.errorCode, undefined, 'Successful retry clears its old failure code');

  await login('status-pm');
  assert.equal((await change('status-task', 'In Progress')).ok, true);
  await login('status-hod');
  assert.equal(useStore.getState().tasks.find(task => task.id === 'status-task').status, 'In Progress', 'PM changes load under the HOD account');
  assert.equal((await change('status-task', 'Pending')).ok, true);
  assert.equal(canonicalStatus('status-task'), 'Pending');
  console.log('[hod-status] Assigned and department status saves, access boundaries, PM refresh and lost-confirmation retry passed through real Auth, REST and store commits.');

  browser = await chromium.launch({ channel: process.env.CI ? undefined : 'chrome' });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  const base = server.resolvedUrls.local[0];
  const account = accounts.find(account => account.id === 'status-hod');
  await page.goto(`${base}login`);
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Access Dashboard', exact: true }).click();
  await page.getByRole('button', { name: 'Happy working', exact: true }).click();
  const openEditor = async () => {
    await page.goto(`${base}tasks?taskId=status-task`);
    const sheet = page.getByRole('dialog', { name: baseTask.title });
    await expect(sheet).toBeVisible();
    const fullEdit = sheet.getByRole('button', { name: 'Edit task', exact: true });
    if (await fullEdit.isVisible()) await fullEdit.click();
    return sheet;
  };
  // The editor offers the next workflow action instead of a status list:
  // the HOD's own Pending task shows Start work, then Send for review.
  let dialog = await openEditor();
  await page.route('**/rest/v1/rpc/aitask_execute_command', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: false, code: 'FORBIDDEN', error: 'You do not have permission to make this change.' }) }));
  await dialog.getByRole('button', { name: 'Start work', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('correct the rejected change');
  await expect(dialog.getByRole('button', { name: 'Retry my changes', exact: true })).toHaveCount(0);
  assert.equal(canonicalStatus('status-task'), 'Pending', 'Rejected browser change was not persisted');
  if (process.env.AITASK_HOD_STATUS_EVIDENCE_DIR) await page.screenshot({ path: `${process.env.AITASK_HOD_STATUS_EVIDENCE_DIR}/rejected-status-recovery.png`, fullPage: true });
  await page.unroute('**/rest/v1/rpc/aitask_execute_command');
  await dialog.getByRole('button', { name: 'Restore saved data', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Start work', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Start work', exact: true }).click();
  await expect.poll(() => canonicalStatus('status-task')).toBe('In Progress');
  dialog = await openEditor();
  await expect(dialog.getByRole('button', { name: 'Send for review', exact: true })).toBeEnabled();

  const beforeBrowserRetry = Number(sql("select count(*) from public.aitask_audit_events where entity_id='status-task' and actor_member_id='status-hod'"));
  let lostBrowserResponse = false;
  await page.route('**/rest/v1/rpc/aitask_execute_command', async route => {
    const operations = route.request().postDataJSON()?.p_operations || [];
    if (!lostBrowserResponse && operations.some(operation => operation.entityType === 'task' && operation.entityId === 'status-task')) {
      lostBrowserResponse = true;
      await route.fetch();
      await route.abort('failed');
    } else await route.continue();
  });
  await dialog.getByRole('button', { name: 'Send for review', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Retry my changes', exact: true })).toBeVisible({ timeout: 30000 });
  assert.equal(lostBrowserResponse, true);
  await dialog.getByRole('button', { name: 'Retry my changes', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect.poll(() => canonicalStatus('status-task')).toBe('Waiting Approval');
  assert.equal(Number(sql("select count(*) from public.aitask_audit_events where entity_id='status-task' and actor_member_id='status-hod'")), beforeBrowserRetry + 1);
  await page.unroute('**/rest/v1/rpc/aitask_execute_command');
  assert.deepEqual(runtimeErrors, []);
  console.log('[hod-status] Real browser sign-in, permission rejection, canonical restoration, fresh save/reload and lost-response retry without duplication passed.');
} finally {
  globalThis.fetch = originalFetch;
  if (browser) await browser.close();
  await supabase?.auth.signOut().catch(() => undefined);
  if (accounts.length) {
    sql("delete from public.aitask_entities where workspace_id='aitask-main' and entity_type <> 'custom_role'; delete from public.aitask_members where workspace_id='aitask-main'");
    for (const account of accounts) await admin.auth.admin.deleteUser(account.authId);
  }
  if (server) await Promise.race([server.close(), new Promise(resolve => setTimeout(resolve, 1000))]);
}
