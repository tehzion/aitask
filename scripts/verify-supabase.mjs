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

const loadEnvFile = (file) => {
  if (!existsSync(file)) return;

  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const index = trimmed.indexOf('=');
    if (index === -1) continue;

    const key = trimmed.slice(0, index).trim();
    const value = stripQuotes(trimmed.slice(index + 1));
    if (!key || process.env[key] !== undefined) continue;
    process.env[key] = value;
  }
};

envFiles.forEach(loadEnvFile);

const required = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];
const missing = required.filter(key => !process.env[key]);
const table = process.env.VITE_SUPABASE_STATE_TABLE || 'aitask_app_state';
const stateId = process.env.VITE_SUPABASE_STATE_ID || 'default';
const verifyOrigin = process.env.AITASK_VERIFY_ORIGIN ||
  process.env.VITE_AITASK_VERIFY_ORIGIN ||
  'https://aitask-virid.vercel.app';
const forbiddenKeyPattern = /(password|secret|token|api[_-]?key|service[_-]?role)/i;

if (missing.length > 0) {
  console.error(`Missing required Supabase env: ${missing.join(', ')}`);
  console.error('Set them in Vercel Production env or in .env.local, then rerun this command.');
  process.exit(1);
}

let baseUrl;
try {
  baseUrl = new URL(process.env.VITE_SUPABASE_URL);
} catch {
  console.error('VITE_SUPABASE_URL is not a valid URL.');
  process.exit(1);
}

const url = new URL(`/rest/v1/${encodeURIComponent(table)}`, baseUrl);
url.searchParams.set('id', `eq.${stateId}`);
url.searchParams.set('select', 'version,updated_at,state');
url.searchParams.set('limit', '1');

const headers = {
  apikey: process.env.VITE_SUPABASE_ANON_KEY,
  Authorization: `Bearer ${process.env.VITE_SUPABASE_ANON_KEY}`,
  Origin: verifyOrigin,
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

let response;
try {
  response = await fetch(url, {
    headers,
  });
} catch (error) {
  console.error('Supabase preflight failed before receiving a response.');
  console.error(error instanceof Error ? error.message : 'Network request failed.');
  process.exit(1);
}

if (!response.ok) {
  const body = await response.text();
  console.error(`Supabase preflight failed: ${response.status} ${response.statusText}`);

  if (response.status === 401 || response.status === 403) {
    console.error(`Check the Supabase key, table grants, RLS select policy, and allowed origin (${verifyOrigin}).`);
  } else if (response.status === 404) {
    console.error(`Check that public.${table} exists and is exposed to the Supabase Data API.`);
  }

  if (body) console.error(body.slice(0, 1000));
  process.exit(1);
}

const rows = await response.json();
if (Array.isArray(rows) && rows.length > 0) {
  const row = rows[0];
  console.log(`Supabase preflight passed: public.${table} is readable.`);
  console.log(`Snapshot ${stateId}: version ${row.version ?? 'unknown'}, updated ${row.updated_at ?? 'unknown'}.`);
  const forbiddenKeys = Array.from(collectForbiddenKeys(row.state)).sort();
  if (forbiddenKeys.length > 0) {
    console.error(`Snapshot contains forbidden secret-like keys: ${forbiddenKeys.join(', ')}`);
    process.exit(1);
  }
  console.log('Snapshot secret scan passed: no password, token, secret, api key, or service-role fields found.');
} else {
  console.log(`Supabase preflight passed: public.${table} is readable.`);
  console.log(`Snapshot ${stateId} does not exist yet. The app will create it on first Supabase-enabled load if insert/update policies are applied.`);
}

const healthUrl = new URL('/rest/v1/rpc/aitask_app_state_health', baseUrl);
let healthResponse;
try {
  healthResponse = await fetch(healthUrl, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
} catch (error) {
  console.error('Supabase health RPC failed before receiving a response.');
  console.error(error instanceof Error ? error.message : 'Network request failed.');
  process.exit(1);
}

if (!healthResponse.ok) {
  const body = await healthResponse.text();
  console.error(`Supabase health RPC failed: ${healthResponse.status} ${healthResponse.statusText}`);
  console.error('Run the latest supabase/schema.sql so aitask_app_state_health exists.');
  if (body) console.error(body.slice(0, 1000));
  process.exit(1);
}

const health = await healthResponse.json();
const policies = Array.isArray(health?.policies) ? health.policies : [];
const demoPolicies = Array.isArray(health?.demo_policies) ? health.demo_policies : [];
const healthForbiddenKeys = Array.isArray(health?.forbidden_keys) ? health.forbidden_keys : [];

console.log(`Snapshot policies: ${policies.length > 0 ? policies.join(', ') : 'none'}.`);

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

console.log('Supabase hardening passed: demo policies removed, guard trigger present, health scan clean.');
