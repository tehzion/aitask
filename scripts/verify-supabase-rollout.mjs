import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const supabaseSource = join(projectRoot, 'supabase');
const supabaseCli = join(projectRoot, 'node_modules', '.bin', 'supabase');
const expectedProjectRef = 'ohjhwyiffgzyatcmmdql';
const databaseTestPath = process.env.AITASK_DATABASE_TEST_PATH || 'supabase/tests/database';

const fail = (message) => {
  console.error(`[rollout] ${message}`);
  process.exit(1);
};

// Select by manifest contents as well as filename. A release-candidate file
// once carried a `_production.json` suffix, which made a filename-only lookup
// mistake it for an immutable production baseline.
const preflightPath = join(supabaseSource, 'preflight');
const productionManifests = readdirSync(preflightPath)
  .filter((name) => /^aitask_release_manifest_.*_production\.json$/.test(name))
  .map((name) => ({ name, manifest: JSON.parse(readFileSync(join(preflightPath, name), 'utf8')) }))
  .filter(({ manifest }) => manifest.manifestKind === 'aitask-applied-production-release' && manifest.immutable === true)
  .sort((left, right) => left.name.localeCompare(right.name));
const productionManifest = productionManifests.at(-1);
if (!productionManifest) fail('No immutable applied-production release manifest was found.');
const { name: manifestName, manifest } = productionManifest;

if (!process.versions.node.startsWith('22.')) {
  fail(`Node 22 is required; found ${process.version}.`);
}

const pnpmAgent = process.env.npm_config_user_agent || '';
if (pnpmAgent && !pnpmAgent.startsWith('pnpm/10.4.1 ')) {
  fail('Run this command with the repository-pinned pnpm 10.4.1 runtime.');
}

if (!existsSync(supabaseCli)) {
  fail('The repository-pinned Supabase CLI is missing. Run pnpm install --frozen-lockfile first.');
}

if (manifest.projectRef !== expectedProjectRef) {
  fail(`Manifest project ref ${manifest.projectRef || '(missing)'} does not match ${expectedProjectRef}.`);
}

const validatedMigrations = manifest.validatedMigrationTail;
if (!Array.isArray(validatedMigrations) || validatedMigrations.length === 0) {
  fail('The repair manifest must define at least one validated migration tail entry.');
}

const pendingProductionMigrations = manifest.pendingProductionMigrations;
if (!Array.isArray(pendingProductionMigrations)) {
  fail('The repair manifest must define pendingProductionMigrations as an array.');
}
if (pendingProductionMigrations.some((migration) => !validatedMigrations.includes(migration))) {
  fail('Every pending production migration must be present in the validated migration tail.');
}

const migrationNames = readdirSync(join(supabaseSource, 'migrations'))
  .filter((name) => name.endsWith('.sql'))
  .map((name) => name.slice(0, -4))
  .sort();
const baselineIndexes = validatedMigrations.map((migration) => migrationNames.indexOf(migration));
if (baselineIndexes.some((index) => index < 0)) {
  fail(`The applied-production manifest references missing local migrations: ${validatedMigrations.filter((_, index) => baselineIndexes[index] < 0).join(', ')}`);
}
if (baselineIndexes.some((index, position) => position > 0 && index !== baselineIndexes[position - 1] + 1)) {
  fail('The applied-production manifest migration tail is not contiguous in repository order.');
}
const productionBaselineThrough = baselineIndexes.at(-1);
const candidateMigrations = migrationNames.slice(productionBaselineThrough + 1);
console.log(`[rollout] Applied-production baseline ${manifestName} is contiguous through ${validatedMigrations.at(-1)}.`);
console.log(`[rollout] The disposable stack will replay all ${migrationNames.length} repository migrations${candidateMigrations.length ? `; ${candidateMigrations.length} follow the applied-production baseline: ${candidateMigrations.join(', ')}` : '.'}`);

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: options.cwd || projectRoot,
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    env: options.env || process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (options.capture) {
      if (result.stdout && !options.suppressStdoutOnError) process.stdout.write(result.stdout);
      if (result.stdout && options.suppressStdoutOnError) {
        // Newer CLI versions emit startup failures on stdout alongside local
        // credentials. Retain only failure lines and redact credential formats.
        const failures = result.stdout.split(/\r?\n/).filter(line => /error|failed|unhealthy|timed out|already allocated|address.*use/i.test(line));
        for (const line of failures) console.error(line
          .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted JWT]')
          .replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, '[redacted API key]'));
      }
      if (result.stderr) process.stderr.write(result.stderr);
    }
    throw new Error(`${basename(command)} ${args.join(' ')} exited with ${result.status}.`);
  }
  return result;
};

run(process.execPath, [join(projectRoot, 'scripts', 'verify-migrations-nonempty.mjs')]);
run('docker', ['info', '--format', '{{.ServerVersion}}'], { capture: true });

const validationRoot = mkdtempSync(join(tmpdir(), 'aitask-supabase-validation-'));
const validationSupabase = join(validationRoot, 'supabase');
const validationProjectId = basename(validationRoot);
const databaseContainer = `supabase_db_${validationProjectId}`;
const canBindPort = (port) => new Promise((resolvePort) => {
  const server = createServer();
  server.once('error', () => resolvePort(false));
  server.listen({ host: '0.0.0.0', port, exclusive: true }, () => {
    server.close(() => resolvePort(true));
  });
});
let validationPortBase;
for (let attempt = 0; attempt < 900; attempt += 1) {
  const candidate = 55000 + ((process.pid + attempt * 17) % 9000);
  const available = await Promise.all(Array.from({ length: 8 }, (_, offset) => canBindPort(candidate + offset)));
  if (available.every(Boolean)) {
    validationPortBase = candidate;
    break;
  }
}
if (!validationPortBase) fail('Could not find a free port block for the disposable Supabase stack.');
let rolloutError;

cpSync(supabaseSource, validationSupabase, {
  recursive: true,
  filter: (source) => {
    const firstSegment = relative(supabaseSource, source).split(sep)[0];
    return firstSegment !== '.temp' && firstSegment !== '.branches';
  },
});

// The developer stack may already own Supabase's default local ports. Give the
// disposable release gate an isolated port block so it never interrupts it.
appendFileSync(join(validationSupabase, 'config.toml'), `

[api]
port = ${validationPortBase}

[db]
port = ${validationPortBase + 1}

[studio]
port = ${validationPortBase + 2}

[local_smtp]
enabled = true
port = ${validationPortBase + 3}
smtp_port = ${validationPortBase + 6}
pop3_port = ${validationPortBase + 7}

[analytics]
port = ${validationPortBase + 4}
vector_port = ${validationPortBase + 5}
`);

const supabase = (...args) => run(supabaseCli, ['--workdir', validationRoot, ...args], {
  cwd: validationRoot,
});

try {
  console.log(`[rollout] Validating ${validatedMigrations.join(', ')} in ${validationRoot}`);
  const excludedServices = ['imgproxy', 'postgres-meta', 'studio', 'edge-runtime', 'logflare', 'vector', 'supavisor'];
  if (process.env.AITASK_PHASE5_UAT !== 'true') excludedServices.unshift('realtime');
  run(supabaseCli, ['--workdir', validationRoot, 'start', '--exclude', excludedServices.join(',')], {
    cwd: validationRoot, capture: true, suppressStdoutOnError: true,
  });
  // Startup output includes disposable service keys; never retain it in CI artifacts.
  console.log('[rollout] Disposable Supabase stack started.');
  supabase('migration', 'list', '--local');
  supabase('test', 'db', databaseTestPath, '--local');
  supabase('db', 'lint', '--local', '--level', 'warning', '--fail-on', 'error');
  supabase('db', 'advisors', '--local', '--type', 'all', '--level', 'info', '--fail-on', 'error');

  const postflightSource = join(validationSupabase, 'preflight', 'service_rollout_postflight.sql');
  const postflightTarget = '/tmp/service_rollout_postflight.sql';
  run('docker', ['cp', postflightSource, `${databaseContainer}:${postflightTarget}`]);
  run('docker', [
    'exec', databaseContainer, 'psql', '-v', 'ON_ERROR_STOP=1',
    '-U', 'postgres', '-d', 'postgres', '-f', postflightTarget,
  ]);

  const statusOutput = run(supabaseCli, ['--workdir', validationRoot, 'status', '-o', 'json'], { capture: true }).stdout;
  const status = JSON.parse(statusOutput);
  run(process.execPath, [join(projectRoot, 'scripts', 'verify-service-upload-storage.mjs')], { env: {
    ...process.env, AITASK_LOCAL_TEST_URL: status.API_URL, AITASK_LOCAL_TEST_PUBLIC: status.PUBLISHABLE_KEY || status.ANON_KEY,
    AITASK_LOCAL_TEST_SECRET: status.SECRET_KEY || status.SERVICE_ROLE_KEY, AITASK_LOCAL_TEST_DB: databaseContainer,
  } });
  run(process.execPath, [join(projectRoot, 'scripts', 'verify-staff-action-saves.mjs')], { env: {
    ...process.env, AITASK_LOCAL_TEST_URL: status.API_URL, AITASK_LOCAL_TEST_PUBLIC: status.PUBLISHABLE_KEY || status.ANON_KEY,
    AITASK_LOCAL_TEST_SECRET: status.SECRET_KEY || status.SERVICE_ROLE_KEY, AITASK_LOCAL_TEST_DB: databaseContainer,
  } });
  run(process.execPath, [join(projectRoot, 'scripts', 'verify-hod-status-saves.mjs')], { env: {
    ...process.env, AITASK_LOCAL_TEST_URL: status.API_URL, AITASK_LOCAL_TEST_PUBLIC: status.PUBLISHABLE_KEY || status.ANON_KEY,
    AITASK_LOCAL_TEST_SECRET: status.SECRET_KEY || status.SERVICE_ROLE_KEY, AITASK_LOCAL_TEST_DB: databaseContainer,
  } });
  run(process.execPath, [join(projectRoot, 'scripts', 'verify-onboarding-recovery.mjs')], { env: {
    ...process.env, AITASK_LOCAL_TEST_URL: status.API_URL, AITASK_LOCAL_TEST_PUBLIC: status.PUBLISHABLE_KEY || status.ANON_KEY,
    AITASK_LOCAL_TEST_SECRET: status.SECRET_KEY || status.SERVICE_ROLE_KEY, AITASK_LOCAL_TEST_DB: databaseContainer,
  } });
  run(process.execPath, [join(projectRoot, 'scripts', 'verify-workflow-review-gate.mjs')], { env: {
    ...process.env, AITASK_LOCAL_TEST_URL: status.API_URL, AITASK_LOCAL_TEST_PUBLIC: status.PUBLISHABLE_KEY || status.ANON_KEY,
    AITASK_LOCAL_TEST_SECRET: status.SECRET_KEY || status.SERVICE_ROLE_KEY, AITASK_LOCAL_TEST_DB: databaseContainer,
  } });
  run(process.execPath, [join(projectRoot, 'scripts', 'verify-hod-output-ui.mjs')], { env: {
    ...process.env, AITASK_LOCAL_TEST_URL: status.API_URL, AITASK_LOCAL_TEST_PUBLIC: status.PUBLISHABLE_KEY || status.ANON_KEY,
    AITASK_LOCAL_TEST_SECRET: status.SECRET_KEY || status.SERVICE_ROLE_KEY, AITASK_LOCAL_TEST_DB: databaseContainer,
  } });
  run(process.execPath, [join(projectRoot, 'scripts', 'verify-security-audit-leads.mjs')], { env: {
    ...process.env, AITASK_LOCAL_TEST_URL: status.API_URL, AITASK_LOCAL_TEST_PUBLIC: status.PUBLISHABLE_KEY || status.ANON_KEY,
    AITASK_LOCAL_TEST_SECRET: status.SECRET_KEY || status.SERVICE_ROLE_KEY, AITASK_LOCAL_TEST_DB: databaseContainer,
  } });
  if (process.env.AITASK_PHASE5_UAT === 'true') run(process.execPath, [join(projectRoot, 'scripts', 'verify-phase5-uat.mjs')], { env: {
    ...process.env, AITASK_LOCAL_TEST_URL: status.API_URL, AITASK_LOCAL_TEST_PUBLIC: status.PUBLISHABLE_KEY || status.ANON_KEY,
    AITASK_LOCAL_TEST_SECRET: status.SECRET_KEY || status.SERVICE_ROLE_KEY, AITASK_LOCAL_TEST_DB: databaseContainer,
  } });
  console.log('[rollout] Local Supabase rollout validation passed.');
} catch (error) {
  rolloutError = error instanceof Error ? error.message : 'Local Supabase rollout validation failed.';
} finally {
  const stopResult = spawnSync(supabaseCli, ['--workdir', validationRoot, 'stop', '--no-backup'], {
    cwd: validationRoot,
    stdio: 'inherit',
  });
  if (stopResult.status === 0) {
    rmSync(validationRoot, { recursive: true, force: true });
  } else if (!rolloutError) {
    rolloutError = `Failed to stop the disposable stack; retained ${validationRoot} for cleanup.`;
  }
}

if (rolloutError) fail(rolloutError);
