import { readFileSync } from 'node:fs';

const required = ['VERCEL_TOKEN', 'VERCEL_ORG_ID', 'VERCEL_PROJECT_ID'];
for (const key of required) {
  if (!process.env[key]?.trim()) {
    throw new Error(`${key} is required for the isolated Vercel project preflight.`);
  }
}

let project;
try {
  project = JSON.parse(readFileSync('.vercel/project.json', 'utf8'));
} catch (error) {
  throw new Error(`Could not read .vercel/project.json after preparing the CI link: ${error instanceof Error ? error.message : String(error)}`);
}

if (project.orgId !== process.env.VERCEL_ORG_ID || project.projectId !== process.env.VERCEL_PROJECT_ID) {
  throw new Error(
    `Vercel project link mismatch: expected org ${process.env.VERCEL_ORG_ID} / project ${process.env.VERCEL_PROJECT_ID}, `
    + `found org ${project.orgId || '(missing)'} / project ${project.projectId || '(missing)'}.`,
  );
}

console.log(`Verified isolated Vercel project link for org ${project.orgId} and project ${project.projectId}.`);
