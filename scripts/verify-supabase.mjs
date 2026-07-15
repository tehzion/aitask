import { existsSync, readFileSync } from 'node:fs';

const envFiles = ['.env.local', '.env.production.local', '.env'];

const stripQuotes = (value) => {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

for (const file of envFiles) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    if (!key || process.env[key] !== undefined) continue;
    process.env[key] = stripQuotes(trimmed.slice(index + 1));
  }
}

const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const missing = [
  !process.env.VITE_SUPABASE_URL ? 'VITE_SUPABASE_URL' : '',
  !supabaseKey ? 'VITE_SUPABASE_PUBLISHABLE_KEY' : '',
].filter(Boolean);

if (missing.length > 0) {
  console.error(`Missing required Supabase env: ${missing.join(', ')}`);
  process.exit(1);
}

let baseUrl;
try {
  baseUrl = new URL(process.env.VITE_SUPABASE_URL);
} catch {
  console.error('VITE_SUPABASE_URL is not a valid URL.');
  process.exit(1);
}

const table = process.env.VITE_SUPABASE_STATE_TABLE || 'aitask_app_state';
const stateId = process.env.VITE_SUPABASE_STATE_ID || 'default';
const expectSecureCutover = process.env.AITASK_EXPECT_SECURE_CUTOVER === 'true';
const verifyOrigin = process.env.AITASK_VERIFY_ORIGIN || process.env.VITE_AITASK_VERIFY_ORIGIN || 'https://aitask-virid.vercel.app';
const forbiddenKeyPattern = /(password|secret|token|api[_-]?key|service[_-]?role)/i;
const headers = {
  apikey: supabaseKey,
  Authorization: `Bearer ${supabaseKey}`,
  Origin: verifyOrigin,
};

const request = async (url, options = {}) => {
  try {
    return await fetch(url, { ...options, headers: { ...headers, ...options.headers } });
  } catch (error) {
    console.error(`Supabase request failed before receiving a response: ${url.pathname}`);
    console.error(error instanceof Error ? error.message : 'Network request failed.');
    process.exit(1);
  }
};

const responseDetail = async (response) => {
  const body = await response.text();
  return `${response.status} ${response.statusText}${body ? `: ${body.slice(0, 500)}` : ''}`;
};

const collectForbiddenKeys = (value, found = new Set()) => {
  if (Array.isArray(value)) {
    value.forEach(item => collectForbiddenKeys(item, found));
    return found;
  }
  if (!value || typeof value !== 'object') return found;
  for (const [key, item] of Object.entries(value)) {
    if (forbiddenKeyPattern.test(key)) found.add(key);
    collectForbiddenKeys(item, found);
  }
  return found;
};

const commandUrl = new URL('/rest/v1/rpc/aitask_execute_command', baseUrl);
const commandResponse = await request(commandUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    p_workspace_id: 'aitask-main',
    p_command_id: crypto.randomUUID(),
    p_command_type: 'workspace.patch',
    p_operations: [],
  }),
});

if (commandResponse.ok) {
  console.error('Security failure: anon can execute aitask_execute_command. Revoke EXECUTE from PUBLIC and anon.');
  process.exit(1);
}
if (![401, 403, 404].includes(commandResponse.status)) {
  console.error(`Unexpected anon command response: ${await responseDetail(commandResponse)}`);
  process.exit(1);
}
console.log('Command API check passed: anonymous callers cannot execute workspace commands.');

for (const secureTable of ['aitask_workspaces', 'aitask_members', 'aitask_entities', 'aitask_command_receipts', 'aitask_audit_events']) {
  const url = new URL(`/rest/v1/${secureTable}`, baseUrl);
  url.searchParams.set('select', '*');
  url.searchParams.set('limit', '1');
  const response = await request(url);
  if (response.ok) {
    const rows = await response.json();
    if (Array.isArray(rows) && rows.length === 0) continue;
    console.error(`Security failure: anon can read public.${secureTable}.`);
    process.exit(1);
  }
  if (![401, 403, 404].includes(response.status)) {
    console.error(`Unexpected anon response for public.${secureTable}: ${await responseDetail(response)}`);
    process.exit(1);
  }
}
console.log('Secure table check passed: anonymous callers cannot read workspace data.');

const snapshotUrl = new URL(`/rest/v1/${encodeURIComponent(table)}`, baseUrl);
snapshotUrl.searchParams.set('id', `eq.${stateId}`);
snapshotUrl.searchParams.set('select', 'version,updated_at,state');
snapshotUrl.searchParams.set('limit', '1');
const snapshotResponse = await request(snapshotUrl);

if (!snapshotResponse.ok) {
  if (expectSecureCutover && [401, 403, 404].includes(snapshotResponse.status)) {
    console.log(`Secure cutover check passed: anon can no longer read public.${table}.`);
    process.exit(0);
  }
  console.error(`Legacy snapshot preflight failed: ${await responseDetail(snapshotResponse)}`);
  console.error('Before cutover the legacy snapshot must remain readable by the old frontend; after cutover set AITASK_EXPECT_SECURE_CUTOVER=true.');
  process.exit(1);
}

if (expectSecureCutover) {
  console.error(`Security failure: AITASK_EXPECT_SECURE_CUTOVER=true but anon can still read public.${table}.`);
  process.exit(1);
}

const rows = await snapshotResponse.json();
if (Array.isArray(rows) && rows.length > 0) {
  const row = rows[0];
  const forbiddenKeys = [...collectForbiddenKeys(row.state)].sort();
  console.log(`Legacy snapshot ${stateId}: version ${row.version ?? 'unknown'}, updated ${row.updated_at ?? 'unknown'}.`);
  if (forbiddenKeys.length > 0) {
    console.error(`Snapshot contains forbidden secret-like keys: ${forbiddenKeys.join(', ')}`);
    process.exit(1);
  }
  console.log('Legacy snapshot secret scan passed.');
} else {
  console.log(`Legacy snapshot ${stateId} does not exist.`);
}

const healthUrl = new URL('/rest/v1/rpc/aitask_app_state_health', baseUrl);
const healthResponse = await request(healthUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: '{}',
});
if (!healthResponse.ok) {
  console.error(`Legacy health RPC failed: ${await responseDetail(healthResponse)}`);
  process.exit(1);
}

const health = await healthResponse.json();
const policies = Array.isArray(health?.policies) ? health.policies : [];
const demoPolicies = Array.isArray(health?.demo_policies) ? health.demo_policies : [];
const healthForbiddenKeys = Array.isArray(health?.forbidden_keys) ? health.forbidden_keys : [];
console.log(`Legacy snapshot policies: ${policies.length > 0 ? policies.join(', ') : 'none'}.`);

if (demoPolicies.length > 0) {
  console.error(`Public demo policies are still present: ${demoPolicies.join(', ')}`);
  process.exit(1);
}
if (!health?.has_guard_trigger) {
  console.error('Missing guard trigger: aitask_app_state_guard_before_write.');
  process.exit(1);
}
if (health?.contains_forbidden_keys || healthForbiddenKeys.length > 0) {
  console.error(`Database health scan found forbidden secret-like keys: ${healthForbiddenKeys.join(', ')}`);
  process.exit(1);
}

console.log('Staged rollout is healthy: command API is protected and the guarded legacy snapshot remains available until frontend cutover.');
