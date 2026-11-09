import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ insert: vi.fn(), from: vi.fn() }));
vi.mock('./supabaseClient', () => ({ shouldUseSecureSupabase: () => true, supabase: { from: mocks.from } }));
import { recordClientEvent } from './clientTelemetry';
const actor = { id: 'member-1', role: 'Staff' as const };
beforeEach(() => { mocks.insert.mockReset().mockResolvedValue({ error: null }); mocks.from.mockReset().mockReturnValue({ insert: mocks.insert }); });
afterEach(() => vi.unstubAllEnvs());

it('is off by default and makes no request', async () => {
  vi.stubEnv('VITE_AITASK_CLIENT_TELEMETRY', '');
  await recordClientEvent(actor, { type: 'save_failure', code: 'OFFLINE' });
  expect(mocks.from).not.toHaveBeenCalled();
});

it('inserts only allowlisted event fields when explicitly enabled', async () => {
  vi.stubEnv('VITE_AITASK_CLIENT_TELEMETRY', 'true');
  await recordClientEvent(actor, { type: 'save_failure', code: 'OFFLINE' });
  expect(mocks.from).toHaveBeenCalledWith('aitask_client_events');
  expect(mocks.insert).toHaveBeenCalledWith({ member_id: 'member-1', role: 'Staff', event_type: 'save_failure', detail: 'OFFLINE', duration_ms: null });
});

it('never disrupts the user when telemetry transport fails', async () => {
  vi.stubEnv('VITE_AITASK_CLIENT_TELEMETRY', 'true');
  mocks.insert.mockRejectedValueOnce(new Error('network down'));
  await expect(recordClientEvent(actor, { type: 'chunk_load_failure' })).resolves.toBeUndefined();
});

it('does not transmit unrecognized error details', async () => {
  vi.stubEnv('VITE_AITASK_CLIENT_TELEMETRY', 'true');
  await recordClientEvent(actor, { type: 'save_failure', code: 'unexpected secret' as never });
  expect(mocks.insert).not.toHaveBeenCalled();
});
