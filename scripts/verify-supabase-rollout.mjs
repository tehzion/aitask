import {
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
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const supabaseSource = join(projectRoot, 'supabase');
const manifestPath = join(supabaseSource, 'preflight', 'migration_repair_manifest.review.json');
const supabaseCli = join(projectRoot, 'node_modules', '.bin', 'supabase');
const expectedProjectRef = 'ohjhwyiffgzyatcmmdql';

const fail = (message) => {
  console.error(`[rollout] ${message}`);
  process.exit(1);
};

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

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (manifest.projectRef !== expectedProjectRef) {
  fail(`Manifest project ref ${manifest.projectRef || '(missing)'} does not match ${expectedProjectRef}.`);
}

const expectedMigrations = manifest.expectedDryRunMigrations;
if (!Array.isArray(expectedMigrations) || expectedMigrations.length === 0) {
  fail('The repair manifest must define at least one expected dry-run migration.');
}

const migrationNames = readdirSync(join(supabaseSource, 'migrations'))
  .filter((name) => name.endsWith('.sql'))
  .map((name) => name.slice(0, -4))
  .sort();
const migrationTail = migrationNames.slice(-expectedMigrations.length);
if (JSON.stringify(migrationTail) !== JSON.stringify(expectedMigrations)) {
  fail(`Migration tail does not match the repair manifest. Found: ${migrationTail.join(', ')}`);
}

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: options.cwd || projectRoot,
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (options.capture) {
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
    }
    throw new Error(`${basename(command)} ${args.join(' ')} exited with ${result.status}.`);
  }
  return result;
};

run('docker', ['info', '--format', '{{.ServerVersion}}'], { capture: true });

const validationRoot = mkdtempSync(join(tmpdir(), 'aitask-supabase-validation-'));
const validationSupabase = join(validationRoot, 'supabase');
const validationProjectId = basename(validationRoot);
const databaseContainer = `supabase_db_${validationProjectId}`;
let rolloutError;

cpSync(supabaseSource, validationSupabase, {
  recursive: true,
  filter: (source) => {
    const firstSegment = relative(supabaseSource, source).split(sep)[0];
    return firstSegment !== '.temp' && firstSegment !== '.branches';
  },
});

const supabase = (...args) => run(supabaseCli, ['--workdir', validationRoot, ...args], {
  cwd: validationRoot,
});

try {
  console.log(`[rollout] Validating ${expectedMigrations.join(', ')} in ${validationRoot}`);
  supabase('start');
  supabase('migration', 'list', '--local');
  supabase('test', 'db', 'supabase/tests/database', '--local');
  supabase('db', 'lint', '--local', '--level', 'warning', '--fail-on', 'error');
  supabase('db', 'advisors', '--local', '--type', 'all', '--level', 'info', '--fail-on', 'error');

  const postflightSource = join(validationSupabase, 'preflight', 'service_rollout_postflight.sql');
  const postflightTarget = '/tmp/service_rollout_postflight.sql';
  run('docker', ['cp', postflightSource, `${databaseContainer}:${postflightTarget}`]);
  run('docker', [
    'exec', databaseContainer, 'psql', '-v', 'ON_ERROR_STOP=1',
    '-U', 'postgres', '-d', 'postgres', '-f', postflightTarget,
  ]);

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
