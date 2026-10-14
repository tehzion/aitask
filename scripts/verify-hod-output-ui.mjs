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
const sql = query => execFileSync('docker', ['exec', '-i', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'], { input: query, stdio: ['pipe', 'pipe', 'pipe'] }).toString();
const password = `Local-${randomUUID()}!`;
const accounts = [];
let server;
let browser;
let context;
const paths = [];
const acknowledgedAccounts = new Set();
try {
  assert.match(sql("select count(*) from public.aitask_members where workspace_id='aitask-main';"), /\n\s*0\s*\n/, 'validation workspace must be empty');
  for (const [id, role, department] of [['output-worker','Staff','Designer'],['output-hod','HOD','Designer'],['output-pm','Project Manager','Management'],['output-client','Client','Client']]) {
    const email = `${id}-${randomUUID()}@aitask.local`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(created.error);
    accounts.push({ id, role, department, email, authId: created.data.user.id });
  }
  sql("insert into public.aitask_workspaces(id,name) values('aitask-main','Isolated output QA') on conflict(id) do nothing;");
  for (const a of accounts) sql(`insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,must_reset_password,client_name) values('${a.id}','aitask-main','${a.authId}','${a.id}','${a.email}','${a.role}','${a.department}',array['${a.department}'],false,${a.role==='Client' ? "'Output QA'" : 'null'});`);
  const insert = (type, data) => sql(`insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values('aitask-main','${type}','${data.id}','${JSON.stringify(data).replaceAll("'", "''")}'::jsonb);`);
  insert('client', { id: 'output-company', clientName: 'Output QA', createdBy: 'output-pm', createdAt: '2026-10-01', updatedAt: '2026-10-01' });
  insert('service_cycle', { id: 'output-cycle', clientId: 'output-company', clientName: 'Output QA', planId: 'output-plan', planRevision: 1, status: 'Published', periodStart: '2026-10-01', periodEnd: '2026-10-31', currency: 'MYR', serviceItems: [], addonSnapshots: [], discountType: 'none', discountValue: 0, taxRateBps: 0, createdAt: '2026-10-01', updatedAt: '2026-10-01' });
  insert('deliverable', { id: 'output-delivery', clientId: 'output-company', clientName: 'Output QA', cycleId: 'output-cycle', planId: 'output-plan', serviceItemId: 'artwork', sequence: 1, title: 'File-only artwork', status: 'In Progress', taskIds: ['output-task'], attachments: [], createdAt: '2026-10-01', updatedAt: '2026-10-01' });
  insert('task', { id: 'output-task', title: 'Upload artwork for review', description: 'File-only output', clientId: 'output-company', clientName: 'Output QA', serviceType: 'Design', serviceCycleId: 'output-cycle', deliverableId: 'output-delivery', visibility: 'client-visible', department: 'Designer', assignedTo: 'output-worker', createdBy: 'output-pm', accountableLeadId: 'output-pm', startDate: '2026-10-01', dueDate: '2026-10-31', priority: 'Medium', status: 'In Progress', isCompleted: false, completionPercentage: 30, revisionCount: 0, clientApprovalStatus: 'Pending', isRecurring: false });
  process.env.VITE_SUPABASE_URL = url;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = process.env.AITASK_LOCAL_TEST_PUBLIC;
  process.env.VITE_AITASK_BACKEND = 'supabase';
  process.env.VITE_AITASK_SHOW_DEMO_LOGIN = 'false';
  server = await createServer({ server: { host: '127.0.0.1', port: 57000+(process.pid%300), strictPort: true, ws: false, hmr: false }, logLevel: 'error' });
  await server.listen();
  const base = server.resolvedUrls.local[0];
  browser = await chromium.launch({ channel: process.env.CI ? undefined : 'chrome' });
  context = await browser.newContext({ acceptDownloads: true, serviceWorkers: 'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  await page.goto(`${base}login`);
  const login = async id => {
    const account = accounts.find(a => a.id===id);
    const result = await page.evaluate(async ({ email, password, id }) => {
      localStorage.setItem('aitask:locale','en');
      localStorage.setItem(`aitask:release-notice:2026-08-service-operations:${id}`,'acknowledged');
      const { useStore } = await import('/src/store/index.ts');
      return useStore.getState().login(email,password);
    }, { email: account.email, password, id });
    assert.equal(result.ok,true, `${id} login failed: ${result.error}`);
    await page.goto(`${base}tasks?taskId=output-task`);
    // Hosted acknowledgements live on the server; a localStorage flag cannot
    // dismiss the authenticated release notice for these fresh test accounts.
    if (!acknowledgedAccounts.has(id)) {
      const notice = page.getByRole('button', { name: 'Happy working', exact: true });
      await expect(notice).toBeVisible();
      await notice.click();
      acknowledgedAccounts.add(id);
    }
    await expect(page.getByRole('dialog',{name:account.role === 'Client' ? 'Delivery details' : 'Upload artwork for review'})).toBeVisible();
  };
  await login('output-worker');
  let lostConfirmation = false;
  await page.route('**/rest/v1/rpc/aitask_execute_command', async route => {
    if (!lostConfirmation && route.request().postDataJSON()?.p_command_type === 'task.update') {
      lostConfirmation = true;
      await route.fetch(); // The database commits; only the browser response is lost.
      await route.abort('failed');
    } else await route.continue();
  });
  const file = Buffer.from('%PDF-1.4\nReal worker output\n%%EOF');
  await page.locator('input[type="file"]').setInputFiles({ name:'Artwork.pdf',mimeType:'application/pdf',buffer:file });
  await expect(page.getByRole('button',{name:'Retry output save',exact:true})).toBeVisible({ timeout:30000 });
  assert.equal(lostConfirmation,true);
  await page.getByRole('button',{name:'Retry output save',exact:true}).click();
  await expect(page.getByText('Output file saved for review.',{exact:true})).toBeVisible({ timeout:30000 });
  await page.unroute('**/rest/v1/rpc/aitask_execute_command');
  const stored = JSON.parse(sql("select coalesce(data->'outputAttachments','[]') from public.aitask_entities where workspace_id='aitask-main' and entity_id='output-task';").trim().split('\n').map(s=>s.trim()).find(s=>s.startsWith('[{')));
  assert.equal(stored.length,1);
  assert.match(sql("select count(*) from storage.objects where bucket_id='client-service-files' and name like 'aitask-main/output-company/output-cycle/%';"), /\n\s*1\s*\n/, 'lost confirmation must not duplicate the Storage object');
  paths.push(stored[0].path);
  await page.getByRole('button',{name:'Send for review',exact:true}).click();
  await expect(page.getByRole('button',{name:'Waiting for review',exact:true})).toBeDisabled();
  await login('output-client');
  await expect(page.getByRole('button',{name:/Artwork\.pdf/})).toHaveCount(0);
  await login('output-hod');
  const hodDownload = page.waitForEvent('download');
  await page.getByRole('button',{name:/Artwork\.pdf/}).click();
  assert.equal(await (await hodDownload).failure(),null);
  await page.setViewportSize({ width:390, height:844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (process.env.AITASK_HOD_EVIDENCE_DIR) await page.screenshot({ path: `${process.env.AITASK_HOD_EVIDENCE_DIR}/output-review-mobile.png`, fullPage:true });
  await page.getByRole('button',{name:'Approve',exact:true}).click();
  await expect(page.getByRole('button',{name:'Awaiting final completion',exact:true})).toBeDisabled();
  await login('output-client');
  const clientDownload = page.waitForEvent('download');
  await page.getByRole('button',{name:/Artwork\.pdf/}).click();
  assert.equal(await (await clientDownload).failure(),null);
  await login('output-pm');
  await page.getByRole('button',{name:'Confirm completion',exact:true}).click();
  await expect.poll(async () => sql("select data->>'status' from public.aitask_entities where workspace_id='aitask-main' and entity_id='output-task';")).toContain('Completed');
  console.log('[hod-output-ui] Real browser/Auth/REST/Storage: worker upload, lost-confirmation retry without duplicate files, canonical file save, review submission, independent HOD private download/approval, pre-approval Client denial, post-approval Client download, and PM finalization passed.');
} finally {
  if (browser) await browser.close();
  if (server) {
    let shutdownTimer;
    try {
      await Promise.race([
        server.close(),
        new Promise(resolve => {
          shutdownTimer = setTimeout(() => {
            console.warn('[hod-output-ui] Embedded Vite shutdown timed out; continuing fixture cleanup.');
            resolve();
          }, 10_000);
        }),
      ]);
    } finally { clearTimeout(shutdownTimer); }
  }
  if (accounts.length) sql("delete from public.aitask_entities where workspace_id='aitask-main' and entity_type <> 'custom_role'; delete from public.aitask_members where workspace_id='aitask-main';");
  if (paths.length) await admin.storage.from('client-service-files').remove(paths);
  for (const account of accounts) await admin.auth.admin.deleteUser(account.authId);
  console.log('[hod-output-ui] Disposable fixture cleanup complete.');
}
// The parent rollout runner owns and removes the disposable stack. A stalled
// Vite/esbuild shutdown must not keep this completed probe alive afterward.
process.exit(0);
