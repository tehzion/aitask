import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
it('explicit Bash fails a piped validation instead of accepting tee success', () => {
  expect(spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', 'false | cat']).status).toBe(1);
});
it('rejects credential-bearing artifacts including compressed trace resources', () => {
  const directory = mkdtempSync(join(tmpdir(), 'aitask-artifact-test-'));
  try {
    writeFileSync(join(directory, 'safe.txt'), 'test passed');
    const env = { ...process.env, STAGING_QA_HOD_PASSWORD: 'DUMMY_AUDIT_PASSWORD' };
    expect(spawnSync('python3', ['scripts/verify-qa-artifacts.py', directory], { env }).status).toBe(0);
    spawnSync('python3', ['-c', "import sys,zipfile; z=zipfile.ZipFile(sys.argv[1],'w',zipfile.ZIP_DEFLATED); z.writestr('resources/auth.json','DUMMY_AUDIT_PASSWORD'); z.close()", join(directory, 'trace.zip')]);
    const result = spawnSync('python3', ['scripts/verify-qa-artifacts.py', directory], { env, encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stderr).not.toContain('DUMMY_AUDIT_PASSWORD');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
it('does not mint or forward OIDC credentials to Supabase or another origin', async () => {
  vi.stubEnv('STAGING_PROTECTION_ORIGIN', 'https://staging.vercel.app');
  const { deploymentProtectionHeaders } = await import('../../scripts/deployment-protection.mjs');
  const fetcher = vi.fn();
  expect(await deploymentProtectionHeaders('https://example.supabase.co/auth/v1/token', fetcher)).toEqual({});
  expect(await deploymentProtectionHeaders('https://another.vercel.app/', fetcher)).toEqual({});
  expect(fetcher).not.toHaveBeenCalled();
});
it('mints a scoped short-lived token and refuses redirects from the token issuer', async () => {
  vi.stubEnv('STAGING_PROTECTION_ORIGIN', 'https://staging.vercel.app');
  vi.stubEnv('ACTIONS_ID_TOKEN_REQUEST_URL', 'https://pipelines.actions.githubusercontent.com/token');
  vi.stubEnv('ACTIONS_ID_TOKEN_REQUEST_TOKEN', 'fake-runner-token');
  const { deploymentProtectionHeaders } = await import('../../scripts/deployment-protection.mjs');
  const claims = { aud: 'https://github.com/tehzion', repository: 'tehzion/aitask', workflow: 'Authenticated Staging QA', exp: Math.floor(Date.now() / 1000) + 300 };
  const token = `fake.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.fake`;
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ value: token }) });
  expect(await deploymentProtectionHeaders('https://staging.vercel.app/build-info.json', fetcher)).toEqual({ 'x-vercel-trusted-oidc-idp-token': token });
  expect(fetcher.mock.calls[0][1].redirect).toBe('error');
  expect(fetcher.mock.calls[0][0].searchParams.get('audience')).toBe('https://github.com/tehzion');
});
