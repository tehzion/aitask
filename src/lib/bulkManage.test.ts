import { describe, expect, it, vi } from 'vitest';
import { runBulkSave, type BulkStep } from './bulkManage';

const refusal = (code: string) => ['FORBIDDEN', 'VALIDATION', 'NOT_FOUND'].includes(code);

describe('runBulkSave', () => {
  it('saves every task and counts them', async () => {
    const outcome = await runBulkSave(['a', 'b'], () => ({ ok: true }), async () => ({ ok: true }), async () => undefined, refusal);
    expect(outcome).toEqual({ saved: 2, total: 2, firstError: undefined, stopped: false });
  });

  it('skips a task refused locally and carries on', async () => {
    const outcome = await runBulkSave(['a', 'b', 'c'], id => (id === 'b' ? { ok: false, error: 'No permission' } : { ok: true }), async () => ({ ok: true }), async () => undefined, refusal);
    expect(outcome).toMatchObject({ saved: 2, total: 3, firstError: 'No permission', stopped: false });
  });

  it('reloads and skips a task the server refuses, then continues', async () => {
    const discard = vi.fn(async () => undefined);
    const results: BulkStep[] = [{ ok: true }, { ok: false, code: 'FORBIDDEN', error: 'Not yours' }, { ok: true }];
    const outcome = await runBulkSave(['a', 'b', 'c'], () => ({ ok: true }), async () => results.shift()!, discard, refusal);
    expect(outcome).toMatchObject({ saved: 2, firstError: 'Not yours', stopped: false });
    expect(discard).toHaveBeenCalledTimes(1);
  });

  it('stops on a connection problem without touching later tasks', async () => {
    const apply = vi.fn((): BulkStep => ({ ok: true }));
    const outcome = await runBulkSave(['a', 'b', 'c'], apply, async () => ({ ok: false, code: 'NETWORK', error: 'Offline' }), async () => undefined, refusal);
    expect(outcome).toMatchObject({ saved: 0, total: 3, firstError: 'Offline', stopped: true });
    expect(apply).toHaveBeenCalledTimes(1);
  });
});
