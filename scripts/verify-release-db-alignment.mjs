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
if (manifest.productionVerification?.historyAligned !== true) {
  fail('The production migration history is not recorded as aligned.');
}
if (historyThrough !== latestMigration) {
  fail(`Production is recorded through ${historyThrough || '(missing)'}, but the latest migration is ${latestMigration}.`);
}
if (!manifest.status?.includes(latestMigration.split('_')[0])) {
  fail('The manifest status does not identify the latest aligned migration version.');
}

console.log(`[release-db] Production alignment verified through ${latestMigration}.`);
