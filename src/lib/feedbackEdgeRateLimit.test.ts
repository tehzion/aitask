import { readFileSync } from 'node:fs';
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const source = readFileSync(new URL('../../supabase/functions/aitask-feedback/index.ts', import.meta.url), 'utf8')
  .split('\n').slice(2).join('\n');
const executable = transpileModule(source, {
  compilerOptions: { target: ScriptTarget.ES2022, module: ModuleKind.None },
}).outputText;

let handler: (request: Request) => Promise<Response>;
let rateLimitAllowed: boolean;
let resultsQueries: number;
const rpc = vi.fn();

beforeEach(() => {
  rateLimitAllowed = true;
  resultsQueries = 0;
  rpc.mockReset();
  rpc.mockImplementation(async () => ({
    data: { ok: true, allowed: rateLimitAllowed, retryAfterSeconds: 37 },
    error: null,
  }));
  const admin = {
    auth: { getUser: async () => ({ data: { user: { id: 'reviewer-id', email: 'reviewer@example.test' } }, error: null }) },
    rpc,
    from: (table: string) => {
      if (table === 'aitask_members') {
        const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { id: 'boss', is_super_admin: true }, error: null }) };
        return query;
      }
      const query = {
        select: () => query,
        eq: () => query,
        order: async () => { resultsQueries += 1; return { data: [], error: null }; },
      };
      return query;
    },
  };
  const deno = {
    env: { get: (key: string) => ({ SUPABASE_URL: 'https://example.test', SUPABASE_SERVICE_ROLE_KEY: 'service' })[key] },
    serve: (next: typeof handler) => { handler = next; },
  };
  new Function('createClient', 'Deno', executable)(() => admin, deno);
});

const resultsRequest = () => new Request('https://example.test/feedback', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer reviewer-token',
    'Content-Type': 'application/json',
    'x-forwarded-for': '203.0.113.7',
  },
  body: JSON.stringify({ action: 'results' }),
});

describe('feedback results Edge rate limit', () => {
  it('consumes the existing feedback limiter with a hashed IP and actor key', async () => {
    const response = await handler(resultsRequest());

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('aitask_consume_feedback_rate_limit', {
      p_key_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      p_limit: 8,
      p_window_seconds: 600,
    });
    expect(rpc.mock.calls[0][1].p_key_hash).not.toContain('reviewer-id');
    expect(rpc.mock.calls[0][1].p_key_hash).not.toContain('203.0.113.7');
    expect(resultsQueries).toBe(1);
  });

  it('returns Retry-After without querying service-role feedback data when blocked', async () => {
    rateLimitAllowed = false;
    const response = await handler(resultsRequest());

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('37');
    expect(resultsQueries).toBe(0);
  });
});
