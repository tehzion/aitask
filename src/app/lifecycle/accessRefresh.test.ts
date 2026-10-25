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

    state = { ...idle };
    coordinator.onStateChange();
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
    coordinator.onStateChange();
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('access refresh lifecycle and pending changes', () => {
  it('cancels a scheduled refresh when the HOD session is reset before its microtask runs', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const coordinator = createAccessRefreshCoordinator(() => idle, refresh);
    coordinator.request();
    coordinator.reset();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(refresh).not.toHaveBeenCalled();
  });
  it('holds a permission refresh until the pending HOD edit has been resolved', async () => {
    let state: AccessRefreshState = { ...idle, hasPendingChange: true };
    const refresh = vi.fn().mockResolvedValue(undefined);
    const coordinator = createAccessRefreshCoordinator(() => state, refresh);
    coordinator.request();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(refresh).not.toHaveBeenCalled();
    state = { ...idle, hasPendingChange: false };
    coordinator.onStateChange();
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  });
});

it('rechecks a save that starts between scheduling and running a permission refresh', async () => {
  let state: AccessRefreshState = { ...idle };
  const refresh = vi.fn().mockResolvedValue(undefined);
  const coordinator = createAccessRefreshCoordinator(() => state, refresh);
  coordinator.request();
  state = { ...idle, isSaving: true };
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(refresh).not.toHaveBeenCalled();
  state = { ...idle };
  coordinator.onStateChange();
  await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce());
});
