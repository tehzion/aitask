import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = join(
  projectRoot,
  'supabase',
  'preflight',
  'migration_repair_manifest.review.json',
);
const migrationsPath = join(projectRoot, 'supabase', 'migrations');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

const fail = (message) => {
  console.error(`[release-db] ${message}`);
  process.exit(1);
};

if (!Array.isArray(manifest.validatedMigrationTail) || manifest.validatedMigrationTail.length === 0) {
  fail('validatedMigrationTail must contain the migration tail covered by the database gate.');
}
if (!Array.isArray(manifest.pendingProductionMigrations)) {
  fail('pendingProductionMigrations must be an array.');
}
if (manifest.pendingProductionMigrations.length > 0) {
  fail(`Production migrations are still pending: ${manifest.pendingProductionMigrations.join(', ')}`);
}

const migrations = readdirSync(migrationsPath)
  .filter((name) => name.endsWith('.sql'))
  .map((name) => name.slice(0, -4))
  .sort();
const latestMigration = migrations.at(-1);
const historyThrough = manifest.productionVerification?.historyThrough;

if (!latestMigration) fail('No migrations were found.');
if (!manifest.status?.includes(latestMigration.split('_')[0])) {
  fail('The manifest status does not identify the latest production migration version.');
}

if (manifest.productionVerification?.historyAligned === true) {
  if (historyThrough !== latestMigration) {
    fail(`Production is recorded through ${historyThrough || '(missing)'}, but the latest migration is ${latestMigration}.`);
  }
  console.log(`[release-db] Production migration history verified through ${latestMigration}.`);
  process.exit(0);
}

const resolution = manifest.productionVerification?.migrationResolution;
const aliases = resolution?.repositoryToProduction;
if (resolution?.status !== 'connector_aliases_verified' || !Array.isArray(aliases) || aliases.length === 0) {
  fail('Production migration history is neither directly aligned nor covered by an approved connector alias map.');
}
const localAliases = aliases.map((entry) => entry?.repository).filter(Boolean);
const latestAlias = aliases.at(-1);
if (localAliases.at(-1) !== latestMigration || !latestAlias?.production) {
  fail(`Connector alias map does not resolve the latest migration ${latestMigration}.`);
}
if (new Set(localAliases).size !== localAliases.length) {
  fail('Connector alias map contains duplicate repository migrations.');
}
const expectedLocalTail = migrations.slice(-localAliases.length);
if (JSON.stringify(expectedLocalTail) !== JSON.stringify(localAliases)) {
  fail('Connector alias map must cover the repository migration tail in filename order.');
}
if (!historyThrough?.includes(latestAlias.production.split('_')[0])) {
  fail(`Production historyThrough does not record connector migration ${latestAlias.production}.`);
}
for (const entry of aliases) {
  const repositoryName = entry.repository?.split('_').slice(1).join('_');
  if (!repositoryName || !entry.production?.endsWith(`_${repositoryName}`)) {
    fail(`Connector alias has an unexpected migration name: ${entry.repository || '(missing)'}.`);
  }
}

console.log(`[release-db] Production migration resolution verified: ${latestMigration} → ${latestAlias.production}.`);
