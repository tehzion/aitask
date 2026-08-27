import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const valueFor = (flag) => {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
};
const fail = (message) => {
  console.error(`[release-provenance] ${message}`);
  process.exit(1);
};
const gitCommit = () => {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
};

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const expectedVersion = valueFor('--version') || process.env.RELEASE_VERSION || packageJson.version;
const expectedCommit = valueFor('--commit') || process.env.GITHUB_SHA || process.env.VERCEL_GIT_COMMIT_SHA || gitCommit();
const url = valueFor('--url') || process.env.RELEASE_URL;
const file = valueFor('--file');

if (!expectedVersion) fail('Expected release version is required.');
if (!expectedCommit) fail('Expected full Git commit is required.');
if (Boolean(url) === Boolean(file)) fail('Provide exactly one of --url or --file.');

let source;
if (file) {
  source = await readFile(resolve(file), 'utf8');
} else {
  let endpoint;
  try {
    endpoint = new URL('/build-info.json', url);
  } catch {
    fail(`Release URL is invalid: ${url}`);
  }
  if (endpoint.protocol !== 'https:') fail('Release URL must use HTTPS.');
  let response;
  try {
    response = await fetch(endpoint, {
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    fail(`Build-info request failed: ${error instanceof Error ? error.message : 'network error'}.`);
  }
  if (!response.ok) fail(`Build-info request failed with ${response.status} ${response.statusText}.`);
  source = await response.text();
}

let buildInfo;
try {
  buildInfo = JSON.parse(source);
} catch {
  fail('Build-info response is not valid JSON.');
}

if (!buildInfo || typeof buildInfo !== 'object' || Array.isArray(buildInfo)) {
  fail('Build-info must be a JSON object.');
}

const expectedKeys = ['builtAt', 'channel', 'commit', 'version'];
const actualKeys = Object.keys(buildInfo).sort();
if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
  fail(`Build-info keys must be exactly: ${expectedKeys.join(', ')}.`);
}

if (buildInfo.version !== expectedVersion) {
  fail(`Version mismatch: expected ${expectedVersion}, received ${buildInfo.version || '(missing)'}.`);
}
if (buildInfo.commit !== expectedCommit) {
  fail(`Commit mismatch: expected ${expectedCommit}, received ${buildInfo.commit || '(missing)'}.`);
}
if (buildInfo.channel !== 'production' || Number.isNaN(Date.parse(buildInfo.builtAt))) {
  fail('Build-info must identify the production channel and a valid build timestamp.');
}

console.log(`[release-provenance] Verified v${buildInfo.version} at ${buildInfo.commit} (${buildInfo.channel}, ${buildInfo.builtAt}).`);
