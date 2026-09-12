import { describe, expect, it, vi } from 'vitest';
import { createAccessRefreshCoordinator, type AccessRefreshState } from './accessRefresh';

const idle: AccessRefreshState = { hasCurrentUser: true, isPulling: false, isSaving: false };

describe('permission refresh coordinator', () => {
  it('queues a realtime event received during a save until sync becomes idle', async () => {
    let state: AccessRefreshState = { ...idle, isSaving: true };
    const refresh = vi.fn().mockResolvedValue(undefined);
    const coordinator = createAccessRefreshCoordinator(() => state, refresh);

    coordinator.request();
    expect(refresh).not.toHaveBeenCalled();

    const previousState = state;
    state = { ...idle };
    coordinator.onStateChange(previousState, state);
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it('coalesces permission events while a refresh is in flight and refreshes once more afterward', async () => {
    let resolveRefresh!: () => void;
    const refresh = vi.fn(() => new Promise<void>(resolve => { resolveRefresh = resolve; }));
    const coordinator = createAccessRefreshCoordinator(() => idle, refresh);

    coordinator.request();
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    coordinator.request();
    coordinator.request();
    expect(refresh).toHaveBeenCalledTimes(1);

    resolveRefresh();
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
  });

  it('does not refresh without a current user and discards a queued event on reset', () => {
    let state: AccessRefreshState = { ...idle, hasCurrentUser: false };
    const refresh = vi.fn().mockResolvedValue(undefined);
    const coordinator = createAccessRefreshCoordinator(() => state, refresh);

    coordinator.request();
    coordinator.reset();
    state = { ...idle };
    coordinator.onStateChange({ ...idle, isPulling: true }, state);
    expect(refresh).not.toHaveBeenCalled();
  });
});
