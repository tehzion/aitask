import { readFileSync } from 'node:fs';
import { transpileModule, ScriptTarget, ModuleKind } from 'typescript';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type AuthAccount = { id: string; email: string; email_confirmed_at: string; app_metadata: Record<string, unknown>; password?: string };
const source = readFileSync(new URL('../../supabase/functions/invite-aitask-member/index.ts', import.meta.url), 'utf8').split('\n').slice(2).join('\n');
const executable = transpileModule(source, { compilerOptions: { target: ScriptTarget.ES2022, module: ModuleKind.None } }).outputText;
const commandId = '00000000-0000-4000-8000-000000000001';
let handler: (request: Request) => Promise<Response>;
let users: AuthAccount[];
let completed: Record<string, unknown> | null;
let loseConfirmation: boolean;
let failBeforeCommit: boolean;
const deleteUser = vi.fn();
const createUser = vi.fn();
const actor = { id: 'boss', workspace_id: 'aitask-main', is_super_admin: true };
beforeEach(() => {
  users = []; completed = null; loseConfirmation = false; failBeforeCommit = false;
  deleteUser.mockReset(); createUser.mockReset();
  createUser.mockImplementation(async ({ email, app_metadata, password }) => {
    const user = { id: 'prepared-auth', email, email_confirmed_at: '2026-10-08', app_metadata, password };
    users.push(user); return { data: { user }, error: null };
  });
  const admin = {
    auth: { getUser: async () => ({ data: { user: { id: 'boss-auth' } }, error: null }), admin: {
      listUsers: async () => ({ data: { users }, error: null }), createUser, deleteUser,
    } },
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === 'aitask_reserve_member_onboarding') return { data: { ok: true, result: completed }, error: null };
      if (name !== 'aitask_finalize_member_invitation_v3') throw new Error('Unexpected RPC');
      if (failBeforeCommit) return { data: null, error: { message: 'network failure' } };
      const payload = args.p_payload as Record<string, unknown>;
      completed = { member: { id: 'member', auth_user_id: args.p_auth_user_id, worker_type: payload.workerType }, workspaceVersion: 2 };
      return loseConfirmation ? { data: null, error: { message: 'lost acknowledgement' } } : { data: completed, error: null };
    },
  };
  const client = { auth: { signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
    const user = users.find(item => item.email === email && item.password === password);
    return { data: { user }, error: user ? null : { message: 'Invalid credentials' } };
  } }, from: () => {
    const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: actor, error: null }) };
    return query;
  } };
  const deno = { env: { get: (key: string) => ({ SUPABASE_URL: 'https://example.test', SUPABASE_ANON_KEY: 'public', SUPABASE_SERVICE_ROLE_KEY: 'service', AITASK_PUBLIC_URL: 'https://app.test' }[key]) }, serve: (next: typeof handler) => { handler = next; } };
  new Function('createClient', 'Deno', executable)((_url: string, key: string) => key === 'service' ? admin : client, deno);
});
const request = (changes: Record<string, unknown> = {}) => new Request('https://app.test/invite', { method: 'POST', headers: { Authorization: 'Bearer fake-actor', 'Content-Type': 'application/json' }, body: JSON.stringify({ commandId, name: 'Freelancer', email: 'free@example.test', role: 'Staff', departments: ['Designer'], workerType: 'freelancer', sendInvitation: false, password: 'temporary-password', ...changes }) });
describe('actual onboarding Edge handler', () => {
  it('saves the requested worker type and replays one confirmed member', async () => {
    expect((await handler(request())).status).toBe(201);
    expect((await handler(request())).status).toBe(200);
    expect(createUser).toHaveBeenCalledTimes(1);
    expect(completed).toMatchObject({ member: { worker_type: 'freelancer' } });
    expect(users[0].app_metadata).toMatchObject({ aitask_onboarding_command: commandId, aitask_onboarding_actor: 'boss' });
  });
  it('reconciles an acknowledgement lost after commit without deleting the login', async () => {
    loseConfirmation = true;
    expect((await handler(request())).status).toBe(200);
    expect(users).toHaveLength(1);
    expect(deleteUser).not.toHaveBeenCalled();
  });
  it('retains a prepared account after failure before commit and resumes it', async () => {
    failBeforeCommit = true;
    expect((await handler(request())).status).toBe(409);
    failBeforeCommit = false;
    expect((await handler(request())).status).toBe(200);
    expect(createUser).toHaveBeenCalledTimes(1);
    expect(deleteUser).not.toHaveBeenCalled();
  });
  it('rejects a changed temporary password on retry without changing the prepared credential', async () => {
    failBeforeCommit = true;
    expect((await handler(request())).status).toBe(409);
    failBeforeCommit = false;
    const mismatch = await handler(request({ password: 'different-password' }));
    expect(mismatch.status).toBe(409);
    expect(await mismatch.json()).toMatchObject({ code: 'ONBOARDING_PASSWORD_MISMATCH' });
    expect(completed).toBeNull(); expect(users[0].password).toBe('temporary-password');
    expect((await handler(request())).status).toBe(200);
  });
  it('returns the completed receipt while explicitly declining to apply a new password', async () => {
    await handler(request());
    const replay = await handler(request({ password: 'different-password' }));
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({ replayed: true, passwordApplied: false, notice: expect.stringContaining('not applied') });
    expect(users[0].password).toBe('temporary-password'); expect(createUser).toHaveBeenCalledTimes(1);
  });
  it('recovers an Auth creation acknowledgement lost after the account was inserted', async () => {
    const original = createUser.getMockImplementation()!;
    createUser.mockImplementation(async args => { await original(args); return { data: { user: null }, error: { message: 'lost creation acknowledgement' } }; });
    expect((await handler(request())).status).toBe(201);
    expect(users).toHaveLength(1);
    expect(completed).toMatchObject({ member: { worker_type: 'freelancer' } });
    expect(deleteUser).not.toHaveBeenCalled();
  });
  it('refuses an unrelated existing Auth account', async () => {
    users.push({ id: 'unrelated', email: 'free@example.test', email_confirmed_at: '2026-10-08', app_metadata: {} });
    expect((await handler(request())).status).toBe(409);
    expect(createUser).not.toHaveBeenCalled();
    expect(completed).toBeNull();
  });
  it('requires older clients to reload before making any account', async () => {
    expect((await handler(request({ commandId: undefined }))).status).toBe(409);
    expect(createUser).not.toHaveBeenCalled();
  });
});
