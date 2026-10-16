import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDirectory = join(projectRoot, 'supabase', 'migrations');

// Any intentional no-op must be named here with a review comment explaining
// why retaining that migration timestamp is safer than deleting it.
const allowedEmptyMigrations = new Set([
]);

const entries = (await readdir(migrationsDirectory, { withFileTypes: true }))
  .filter(entry => entry.isFile() && entry.name.endsWith('.sql'))
  .sort((left, right) => left.name.localeCompare(right.name));

const emptyMigrations = [];
for (const entry of entries) {
  if (allowedEmptyMigrations.has(entry.name)) continue;
  const path = join(migrationsDirectory, entry.name);
  const metadata = await stat(path);
  if (metadata.size === 0 || !(await readFile(path, 'utf8')).trim()) {
    emptyMigrations.push(entry.name);
  }
}

if (emptyMigrations.length > 0) {
  console.error(`[migrations] Empty SQL migrations are not allowed: ${emptyMigrations.join(', ')}`);
  process.exit(1);
}

console.log(`[migrations] Verified ${entries.length} SQL migrations are non-empty.`);
