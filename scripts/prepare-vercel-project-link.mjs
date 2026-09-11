import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const orgId = process.env.VERCEL_ORG_ID?.trim();
const projectId = process.env.VERCEL_PROJECT_ID?.trim();

if (!orgId || !projectId) {
  throw new Error('VERCEL_ORG_ID and VERCEL_PROJECT_ID are required to link the CI deployment project.');
}

const vercelDirectory = resolve('.vercel');
mkdirSync(vercelDirectory, { recursive: true });
writeFileSync(
  resolve(vercelDirectory, 'project.json'),
  `${JSON.stringify({ orgId, projectId }, null, 2)}\n`,
  { mode: 0o600 },
);

console.log('Prepared the isolated Vercel project link for CI.');
