import { execFileSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';

const DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const sql = (query: string) => execFileSync('psql', [DB, '-Atc', query]).toString().trim();
const PASSWORD = 'LocalQa-2026!';

// This resets the local QA workspace before each scenario. It must never run
// against a hosted database; DB above is intentionally fixed to loopback.
test.beforeEach(() => {
  if (process.env.AITASK_LOCALDB_ALLOW_RESET !== 'yes') throw new Error('Local QA reset deletes workspace entities; use a dedicated local stack and set AITASK_LOCALDB_ALLOW_RESET=yes.');
  execFileSync('psql', [DB, '-f', new URL('./local_reset.sql', import.meta.url).pathname], { stdio: 'pipe' });
});

const signIn = async (page: Page, who: string) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(`${who}@local.test`);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(url => !/\/login$/.test(url.pathname));
  const notice = page.getByRole('button', { name: 'Happy working' });
  await notice.click({ timeout: 10_000 }).catch(() => undefined);
  await expect(notice).toHaveCount(0);
};

// Every save must land with no pending mutation, no error banner, no retry prompt.
const expectSettled = async (page: Page) => {
  await expect.poll(() => page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const b = useStore.getState().backend;
    return `${b.pendingMutations}|${b.hasLocalChanges}|${b.status}`;
  }), { timeout: 15_000 }).toMatch(/^0\|false\|/);
  await expect(page.getByRole('button', { name: /Retry save|Retry my changes|Restore saved data/ })).toHaveCount(0);
  await expect(page.getByText(/A change needs to be retried|Workspace connection needs attention|Sync conflict needs review|Workspace update required/)).toHaveCount(0);
};

const timed = async <T>(label: string, run: () => Promise<T>) => {
  const start = Date.now();
  const value = await run();
  console.log(`[timing] ${label}: ${Date.now() - start} ms`);
  return value;
};

test('PM actions from the team feedback save to Supabase', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await signIn(page, 'pm');
  await page.goto('/clients/CL-qa');
  await expect(page.getByRole('tab', { name: 'Plan & delivery', exact: true })).toBeVisible();

  // F2: link an existing task.
  await timed('link a task', async () => {
    await page.getByRole('combobox', { name: 'Link a task: Social Posts 2' }).selectOption({ label: 'Loose design task · 2026-11-20' });
    await expectSettled(page);
  });
  expect(sql(`select data->>'deliverableId' from aitask_entities where entity_id='TASK-qa-loose'`)).toBe('DEL-qa-nov-2');

  // F2: a new task from the project counts toward this month.
  await timed('create task counting toward', async () => {
    await page.evaluate(async () => {
      const { useStore } = await import('/src/store/index.ts');
      useStore.getState().openCreateTaskForProject({ projectId: 'PRJ-qa', clientId: 'CL-qa', clientName: 'QA Co' });
    });
    const dialog = page.getByRole('dialog', { name: /^Create task$/i });
    await dialog.getByLabel('Task Title').fill('Instagram posts for launch');
    await expect(dialog.getByLabel(/Counts toward/).locator('option:checked')).toHaveText('Social Posts 1');
    await dialog.getByLabel('Assign to Position/Department').selectOption('Designer');
    const clicked = Date.now();
    const log = (r: import('@playwright/test').Request) => { const t = r.timing(); if (/rpc|auth\/v1\/user/.test(r.url())) console.log('[net]', Date.now() - clicked, r.method(), r.url().replace(/^.*\/(rest|auth|functions)\//, '$1/').slice(0, 90), Math.round(t.responseEnd), 'ms'); };
    page.on('requestfinished', log); page.on('requestfailed', r => console.log('[net-failed]', Date.now() - clicked, r.url().slice(-80), r.failure()?.errorText));
    await dialog.getByRole('button', { name: 'Create & open task', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    console.log('[timing]   create: dialog closed after', Date.now() - clicked, 'ms');
    page.off('requestfinished', log);
    await expectSettled(page);
    console.log('[timing]   create: settled after', Date.now() - clicked, 'ms');
  });
  expect(sql(`select (data->>'deliverableId')||'|'||(data->>'serviceCycleId') from aitask_entities where entity_type='task' and data->>'title'='Instagram posts for launch'`)).toBe('DEL-qa-nov-1|SC-qa-nov');
  await expect(page.getByText(/Counts toward|Deliverable: /).first()).toBeVisible();
  await expect(page.getByText('Deliverable: Social Posts 1', { exact: false }).or(page.locator('div', { has: page.getByText('Counts toward', { exact: true }) }).last())).toContainText('Social Posts 1');
  await page.keyboard.press('Escape');

  // F6: correct a name, with the reason kept as an internal note.
  await page.goto('/clients/CL-qa');
  await timed('correct name', async () => {
    await page.getByRole('button', { name: 'Correct name: Social Posts 2' }).click();
    const form = page.getByRole('form', { name: 'Correct name: Social Posts 2' });
    await form.getByLabel('New name').fill('Reel 2');
    await form.getByLabel('Reason (required)').fill('Client asked for a reel');
    await form.getByRole('button', { name: 'Save correction' }).click();
    await expect(form).toHaveCount(0);
    await expectSettled(page);
  });
  expect(sql(`select data->>'title' from aitask_entities where entity_id='DEL-qa-nov-2'`)).toBe('Reel 2');
  expect(sql(`select (data->>'visibility')||'|'||(data->>'text') from aitask_entities where entity_type='cycle_comment'`)).toBe('internal|Name corrected from "Social Posts 2" to "Reel 2". Reason: Client asked for a reel');

  // F3: cancel a never-published month and close a finished one.
  const octLabel = await page.evaluate(() => new Intl.DateTimeFormat(document.documentElement.lang || 'en', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(2026, 9, 1)));
  await expect(page.getByText('Never started', { exact: true })).toHaveCount(2);
  await timed('cancel month', async () => {
    await page.getByRole('button', { name: /^Cancel month: / }).first().click();
    await expectSettled(page);
  });
  await timed('publish late', async () => {
    await page.getByRole('button', { name: /^Start late: / }).first().click();
    await expectSettled(page);
  });
  await expect(page.getByText('Never started', { exact: true })).toHaveCount(0);
  console.log('[info] oct label', octLabel);
  console.log('[info] cycles', sql(`select string_agg(entity_id||'='||(data->>'status'), ',' order by entity_id) from aitask_entities where entity_type='service_cycle'`));
  expect(sql(`select count(*) from aitask_entities where entity_type='service_cycle' and data->>'status'='Cancelled'`)).toBe('1');
  expect(sql(`select count(*) from aitask_entities where entity_type='service_cycle' and data->>'status'='Draft'`)).toBe('0');

  // Reload: everything is still there from the server.
  await page.reload();
  await expect(page.getByText('Reel 2', { exact: true }).first()).toBeVisible();
  await expectSettled(page);
  expect(errors.filter(text => !/favicon|DevTools/.test(text))).toEqual([]);
});

test('a save whose response is lost is retried without duplicating it', async ({ page }) => {
  await signIn(page, 'pm');
  await page.goto('/clients/CL-qa');
  let dropped = 0;
  await page.route('**/rest/v1/rpc/aitask_execute_service_command', async route => {
    if (dropped === 0) {
      dropped += 1;
      await route.fetch(); // the server applies the change...
      await route.abort('connectionreset'); // ...but the browser never sees the answer
      return;
    }
    await route.continue();
  });
  await timed('correct name with lost response', async () => {
    await page.getByRole('button', { name: 'Correct name: Social Posts 1' }).click();
    const form = page.getByRole('form', { name: 'Correct name: Social Posts 1' });
    await form.getByLabel('New name').fill('Posts 1 (launch)');
    await form.getByLabel('Reason (required)').fill('Launch naming');
    await form.getByRole('button', { name: 'Save correction' }).click();
    await expect(form).toHaveCount(0, { timeout: 30_000 });
    await page.waitForTimeout(3000);
    console.log('[info] backend', JSON.stringify(await page.evaluate(async () => { const { useStore } = await import('/src/store/index.ts'); const b = useStore.getState().backend; return { p: b.pendingMutations, l: b.hasLocalChanges, s: b.status, e: (b as Record<string, unknown>).lastError, r: (b as Record<string, unknown>).pendingResolution }; })));
    console.log('[info] messages', JSON.stringify(await page.locator('[role=status],[role=alert]').allInnerTexts()));
    console.log('[info] receipts', sql(`select string_agg(command_type, ',' order by created_at) from aitask_command_receipts`));
    await expectSettled(page);
  });
  console.log('[info] messages', JSON.stringify(await page.locator('[role=status],[role=alert]').allInnerTexts()));
  console.log('[info] comments', sql(`select count(*) from aitask_entities where entity_type='cycle_comment'`), sql(`select string_agg(command_type, ',' order by created_at) from aitask_command_receipts`));
  expect(dropped).toBe(1);
  expect(sql(`select data->>'title' from aitask_entities where entity_id='DEL-qa-nov-1'`)).toBe('Posts 1 (launch)');
  expect(sql(`select count(*) from aitask_entities where entity_type='cycle_comment' and data->>'text' like '%Launch naming'`)).toBe('1');
  expect(sql(`select count(*) from aitask_command_receipts where command_type='deliverable.manage'`)).not.toBe('0');
});

test('generic lost reply replays one command without applying the task twice', async ({ page }) => {
  await signIn(page, 'staff');
  await page.goto('/tasks');
  await expectSettled(page);
  const initialVersion = Number(sql(`select version from aitask_entities where entity_id='TASK-qa-loose'`));
  const commandIds: string[] = [];
  await page.route('**/rest/v1/rpc/aitask_execute_command', async route => {
    const payload = route.request().postDataJSON() as { p_command_id: string };
    commandIds.push(payload.p_command_id);
    if (commandIds.length === 1) { await route.fetch(); await route.abort('connectionreset'); return; }
    await route.continue();
  });
  await page.getByRole('button', { name: 'Start work: Loose design task', exact: true }).click();
  await expect.poll(() => commandIds.length, { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
  await expectSettled(page);
  expect(new Set(commandIds).size).toBe(1);
  expect(sql(`select data->>'status' from aitask_entities where entity_id='TASK-qa-loose'`)).toBe('In Progress');
  expect(Number(sql(`select version from aitask_entities where entity_id='TASK-qa-loose'`))).toBe(initialVersion + 1);
  expect(sql(`select count(*) from aitask_command_receipts where command_id='${commandIds[0]}'::uuid`)).toBe('1');
});

test('member department lost reply replays once without a second update', async ({ page }) => {
  await signIn(page, 'boss');
  await expect.poll(() => page.evaluate(async () => (await import('/src/store/index.ts')).useStore.getState().users.some(user => user.id === 'qa-staff')), { timeout: 30_000 }).toBe(true);
  const before = Number(sql(`select version from aitask_members where id='qa-staff'`));
  const currentDepartments = sql(`select array_to_string(departments, ',') from aitask_members where id='qa-staff'`);
  const nextDepartments: ('Designer' | 'Video Editor')[] = currentDepartments.includes('Video Editor') ? ['Designer'] : ['Designer', 'Video Editor'];
  const ids: string[] = [];
  await page.route('**/rest/v1/rpc/aitask_update_member_departments', async route => {
    ids.push((route.request().postDataJSON() as { p_command_id: string }).p_command_id);
    if (ids.length === 1) { await route.fetch(); await route.abort('connectionreset'); return; }
    await route.continue();
  });
  const first = await page.evaluate(async departments => {
    const { useStore } = await import('/src/store/index.ts');
    const { saveSecureMemberDepartments } = await import('/src/lib/secureWorkspace.ts');
    const member = useStore.getState().users.find(user => user.id === 'qa-staff')!;
    return saveSecureMemberDepartments(member, departments);
  }, nextDepartments);
  expect(first).toMatchObject({ ok: false, code: 'RETRY_REQUIRED' });
  const retry = await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    const { retryRetainedSecureMemberMutation } = await import('/src/lib/secureWorkspace.ts');
    return retryRetainedSecureMemberMutation(useStore.getState().users.find(user => user.id === 'qa-staff')!);
  });
  expect(retry).toMatchObject({ ok: true, replayed: true });
  expect(ids).toHaveLength(2);
  expect(ids[0]).toBe(ids[1]);
  expect(Number(sql(`select version from aitask_members where id='qa-staff'`))).toBe(before + 1);
  expect(sql(`select count(*) from aitask_command_receipts where command_id='${ids[0]}'::uuid`)).toBe('1');
});

test('Staff can send work for review on a PM-review project', async ({ page }) => {
  await signIn(page, 'staff');
  await page.goto('/tasks?taskId=TASK-qa-loose');
  await expectSettled(page);
  await page.waitForTimeout(1500);
  for (const [label, status] of [['Start work', 'In Progress'], ['Send for review', 'Waiting Approval']] as const) {
    const button = page.getByRole('button', { name: label, exact: true }).first();
    await expect(button).toBeEnabled();
    const clicked = Date.now();
    if (label === 'Send for review') {
      await page.evaluate(async () => {
        const { useStore } = await import('/src/store/index.ts');
        const started = Date.now(); let last = '';
        const w = window as unknown as { __log: string[] }; w.__log = [];
        const unsub = useStore.subscribe(state => {
          const b = state.backend as unknown as Record<string, unknown>;
          const line = ['status', 'isSaving', 'isPulling', 'pendingMutations', 'hasLocalChanges', 'errorCode', 'error'].map(k => `${k}=${String(b[k])}`).join(' ');
          if (line !== last) { w.__log.push(`${Date.now() - started} ${line}`); last = line; }
        });
        setTimeout(unsub, 8000);
      });
    }
    await button.click();
    console.log(`[timing] staff ${label}: click returned after`, Date.now() - clicked, 'ms');
    await expect.poll(() => sql(`select data->>'status' from aitask_entities where entity_id='TASK-qa-loose'`), { timeout: 20_000, intervals: [50] }).toBe(status);
    console.log(`[timing] staff ${label}: in database after`, Date.now() - clicked, 'ms');
    await expectSettled(page);
    console.log(`[timing] staff ${label}: page settled after`, Date.now() - clicked, 'ms');
    if (label === 'Send for review') console.log('[state] ' + (await page.evaluate(() => (window as unknown as { __log: string[] }).__log.join(' || '))));
  }
});

test('timing: plain task create from the project', async ({ page }) => {
  await signIn(page, 'pm');
  await page.goto('/clients/CL-qa');
  await expect(page.getByRole('tab', { name: 'Plan & delivery', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/index.ts');
    useStore.getState().openCreateTaskForProject({ projectId: 'PRJ-qa', clientId: 'CL-qa', clientName: 'QA Co' });
  });
  const dialog = page.getByRole('dialog', { name: /^Create task$/i });
  await dialog.getByLabel('Task Title').fill('Plain unlinked task');
  await dialog.getByLabel(/Counts toward/).selectOption('none');
  await dialog.getByLabel('Assign to Position/Department').selectOption('Designer');
  const clicked = Date.now();
  let reloads = 0;
  page.on('request', r => { if (r.url().includes('/auth/v1/user')) reloads += 1; });
  await dialog.getByRole('button', { name: 'Create & open task', exact: true }).click();
  await expect(dialog).toHaveCount(0, { timeout: 30_000 });
  console.log('[timing] plain create closed after', Date.now() - clicked, 'ms; auth/user calls', reloads);
});

test('a correction whose note fails to save can be finished', async ({ page }) => {
  await signIn(page, 'pm');
  await page.goto('/clients/CL-qa');
  let blockNotes = true;
  await page.route('**/rest/v1/rpc/aitask_execute_service_command', async route => {
    if (blockNotes && (route.request().postData() || '').includes('"cycle_comment.manage"')) return route.abort('internetdisconnected');
    return route.continue();
  });
  await page.getByRole('button', { name: 'Correct name: Social Posts 2' }).click();
  const form = page.getByRole('form', { name: 'Correct name: Social Posts 2' });
  await form.getByLabel('New name').fill('Reel 2');
  await form.getByLabel('Reason (required)').fill('Note retry check');
  await form.getByRole('button', { name: 'Save correction' }).click();
  await page.waitForTimeout(8000);
  const renamedForm = page.getByRole('form', { name: 'Correct name: Reel 2' });
  console.log('[info] form open', await renamedForm.count(), JSON.stringify(await renamedForm.getByRole('button').allInnerTexts()), 'title', sql(`select data->>'title' from aitask_entities where entity_id='DEL-qa-nov-2'`));
  console.log('[info] messages', JSON.stringify(await page.locator('[role=status],[role=alert]').allInnerTexts()));
  console.log('[info] buttons', JSON.stringify(await page.getByRole('button', { name: /retry|save|restore/i }).allInnerTexts()));
  console.log('[info] backend', JSON.stringify(await page.evaluate(async () => { const { useStore } = await import('/src/store/index.ts'); const b = useStore.getState().backend; return { p: b.pendingMutations, l: b.hasLocalChanges, s: b.status }; })));
  blockNotes = false;
  const t0 = Date.now();
  await expect.poll(() => sql(`select count(*) from aitask_entities where entity_type='cycle_comment' and data->>'text' like '%Note retry check'`), { timeout: 60_000 }).toBe('1');
  console.log('[info] note saved', Date.now() - t0, 'ms after the connection returned');
  await expect(renamedForm).toHaveCount(0, { timeout: 15_000 });
  console.log('[info] form closed', Date.now() - t0, 'ms after the connection returned');
  await expectSettled(page);
  console.log('[info] messages after', JSON.stringify(await page.locator('[role=status],[role=alert]').allInnerTexts()));
});

test('Staff act from the list on real Supabase (click reduction)', async ({ page }) => {
  await signIn(page, 'staff');
  await page.goto('/tasks');
  await expectSettled(page);
  for (const [label, status] of [['Start work', 'In Progress'], ['Send for review', 'Waiting Approval']] as const) {
    const button = page.getByRole('button', { name: `${label}: Loose design task`, exact: true });
    await expect(button).toBeVisible({ timeout: 15_000 });
    const clicked = Date.now();
    await button.click();
    await expect.poll(() => sql(`select data->>'status' from aitask_entities where entity_id='TASK-qa-loose'`), { timeout: 20_000, intervals: [50] }).toBe(status);
    console.log(`[timing] list ${label}: in database after`, Date.now() - clicked, 'ms');
    await expectSettled(page);
    console.log(`[timing] list ${label}: page settled after`, Date.now() - clicked, 'ms');
    await expect(page.getByRole('dialog', { name: 'Loose design task' })).toHaveCount(0);
  }
});

test('a save during a 20 s outage keeps retrying and never asks to retry', async ({ page }) => {
  await signIn(page, 'staff');
  await page.goto('/tasks');
  await expectSettled(page);
  let blocked = true;
  let aborted = 0;
  await page.route('**/rest/v1/rpc/aitask_execute_command', async route => {
    if (blocked) { aborted += 1; await route.abort('connectionreset'); return; }
    await route.continue();
  });
  const retry = page.getByRole('button', { name: /Retry my changes|Restore saved data/ });
  await page.getByRole('button', { name: 'Start work: Loose design task', exact: true }).click();
  const start = Date.now();
  while (Date.now() - start < 20_000) {
    await expect(retry).toHaveCount(0);
    await page.waitForTimeout(500);
  }
  console.log('[info] aborted during outage', aborted, JSON.stringify(await page.evaluate(async () => { const b = (await import('/src/store/index.ts')).useStore.getState().backend; return { s: b.status, m: b.message, e: b.error }; })));
  expect(aborted).toBeGreaterThan(3);
  blocked = false;
  const back = Date.now();
  await expect.poll(() => sql(`select data->>'status' from aitask_entities where entity_id='TASK-qa-loose'`), { timeout: 40_000, intervals: [100] }).toBe('In Progress');
  console.log('[timing] saved after the connection returned', Date.now() - back, 'ms');
  await expectSettled(page);
  await expect(retry).toHaveCount(0);
});

test('a save cut off by going offline is sent as soon as the browser is back online', async ({ page, context }) => {
  page.on('console', m => { if (m.text().includes('DEBUGSYNC')) console.log('[info] dbg', m.text().slice(0, 300)); });
  await signIn(page, 'staff');
  await page.goto('/tasks');
  await expectSettled(page);
  const start = page.getByRole('button', { name: 'Start work: Loose design task', exact: true });
  await expect(start).toBeVisible({ timeout: 15_000 });
  let offline = false;
  await page.route('**/rest/v1/rpc/aitask_execute_command', async route => {
    if (offline) { await route.abort('internetdisconnected'); return; }
    await route.continue();
  });
  offline = true;
  await context.setOffline(true);
  // The save was already on its way when the connection went.
  await start.evaluate(button => (button as HTMLButtonElement).click());
  const retry = page.getByRole('button', { name: /Retry my changes|Restore saved data/ });
  const seen = new Set<string>();
  for (let i = 0; i < 30; i += 1) {
    await expect(retry).toHaveCount(0);
    seen.add(await page.evaluate(async () => (await import('/src/store/index.ts')).useStore.getState().backend.status));
    await page.waitForTimeout(500);
  }
  console.log('[info] offline statuses', [...seen].join(','));
  expect(seen.has('upgrade_required')).toBe(false);
  console.log('[info] offline backend', JSON.stringify(await page.evaluate(async () => { const b = (await import('/src/store/index.ts')).useStore.getState().backend; return { s: b.status, m: b.message, l: b.hasLocalChanges }; })));
  offline = false;
  await context.setOffline(false);
  const back = Date.now();
  page.on('request', r => console.log('[info] req', Date.now() - back, r.method(), r.url().replace(/^https?:\/\/[^/]+/, '').slice(0, 90)));
  page.on('requestfailed', r => console.log('[info] reqfail', Date.now() - back, r.url().slice(-60), r.failure()?.errorText));
  void 0; page.on('console', m => console.log('[info] console', m.type(), m.text().slice(0, 200)));
  for (let i = 0; i < 4; i += 1) { await page.waitForTimeout(3000); console.log('[info] after', Date.now() - back, JSON.stringify(await page.evaluate(async () => { const b = (await import('/src/store/index.ts')).useStore.getState().backend; return { s: b.status, m: b.message, l: b.hasLocalChanges, sv: b.isSaving, e: b.error }; }))); }
  await expect.poll(() => sql(`select data->>'status' from aitask_entities where entity_id='TASK-qa-loose'`), { timeout: 40_000, intervals: [100] }).toBe('In Progress');
  console.log('[timing] offline save sent after reconnect', Date.now() - back, 'ms');
  await expectSettled(page);
  await expect(retry).toHaveCount(0);
});

test('independent and opener-copied tabs retain a pending task without a duplicate resend', async ({ page, context }) => {
  await signIn(page, 'staff');
  await page.goto('/tasks');
  await expectSettled(page);
  let blocked = true;
  const attempted: string[] = [];
  const delivered: string[] = [];
  await context.route('**/rest/v1/rpc/aitask_execute_command', async route => {
    const id = (route.request().postDataJSON() as { p_command_id: string }).p_command_id;
    attempted.push(id);
    if (blocked) { await route.abort('connectionreset'); return; }
    delivered.push(id);
    await route.continue();
  });
  await page.getByRole('button', { name: 'Start work: Loose design task', exact: true }).click();
  await expect.poll(() => attempted.length, { timeout: 15_000 }).toBeGreaterThan(0);
  const commandId = attempted[0];
  await expect.poll(() => page.evaluate(id => Object.values(sessionStorage).some(value => value.includes(id)), commandId)).toBe(true);
  const independent = await context.newPage();
  await independent.goto('/tasks');
  expect(await independent.evaluate(id => Object.values(sessionStorage).some(value => value.includes(id)), commandId)).toBe(false);
  const popupPromise = context.waitForEvent('page');
  await page.evaluate(() => window.open('/tasks', '_blank'));
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  expect(await popup.evaluate(id => Object.values(sessionStorage).some(value => value.includes(id)), commandId)).toBe(true);
  await expect.poll(() => attempted.filter(id => id === commandId).length, { timeout: 20_000 }).toBeGreaterThanOrEqual(2);
  blocked = false;
  await Promise.all([page.evaluate(() => window.dispatchEvent(new Event('online'))), popup.evaluate(() => window.dispatchEvent(new Event('online')))]);
  await expect.poll(() => sql(`select data->>'status' from aitask_entities where entity_id='TASK-qa-loose'`), { timeout: 40_000 }).toBe('In Progress');
  await expect.poll(() => sql(`select count(*) from aitask_command_receipts where command_id='${commandId}'::uuid`)).toBe('1');
  await page.waitForTimeout(3000);
  expect(delivered.filter(id => id === commandId)).toHaveLength(1);
});
