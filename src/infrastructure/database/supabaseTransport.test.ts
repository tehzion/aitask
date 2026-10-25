import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

const clientWithFetch = (fetch: typeof globalThis.fetch) => createClient(
  'https://transport-test.supabase.co',
  'test-publishable-key',
  {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch },
  },
);

describe('Supabase SDK transport recovery', () => {
  it('does not retry a workspace read after its timeout signal aborts', async () => {
    const controller = new AbortController();
    const timeout = new DOMException('Workspace read timed out.', 'TimeoutError');
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      controller.abort(timeout);
      throw timeout;
    });

    await expect(clientWithFetch(fetch).from('aitask_entities').select('version')
      .abortSignal(controller.signal).throwOnError()).rejects.toBe(timeout);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('leaves a dropped save confirmation to the app’s retained-command retry', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      throw new TypeError('Save response connection closed.');
    });
    const commandId = crypto.randomUUID();
    const result = await clientWithFetch(fetch).rpc('aitask_execute_command', {
      p_workspace_id: 'aitask-main', p_command_id: commandId,
      p_command_type: 'task.update', p_operations: [],
    });

    expect(result.error).not.toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1]?.method).toBe('POST');
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body)).p_command_id).toBe(commandId);
  });

  it('returns a server save error without automatically resending the mutation', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(
      JSON.stringify({ code: '503', message: 'Database temporarily unavailable.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    ));
    const result = await clientWithFetch(fetch).rpc('aitask_execute_command', {
      p_workspace_id: 'aitask-main', p_command_id: crypto.randomUUID(),
      p_command_type: 'task.update', p_operations: [],
    });

    expect(result.status).toBe(503);
    expect(result.error?.message).toBe('Database temporarily unavailable.');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
