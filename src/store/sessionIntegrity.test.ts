import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => {
  process.env.VITE_AITASK_BACKEND = 'supabase';
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
});
const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), getUser: vi.fn(), capabilities: vi.fn(), retained: vi.fn(), retry: vi.fn() }));
vi.mock('../lib/supabaseClient', () => ({
  supabase: { auth: { getUser: mocks.getUser } },
  shouldUseSecureSupabase: () => true,
  resolveAuthEmail: (value: string) => value,
}));
vi.mock('../lib/secureWorkspace', async importOriginal => ({
  ...await importOriginal<typeof import('../lib/secureWorkspace')>(),
  loadSecureWorkspace: mocks.load,
  saveSecureWorkspace: mocks.save,
  loadSecureBackendCapabilities: mocks.capabilities,
  getRetainedSecureCommand: mocks.retained,
  retrySecureWorkspaceCommand: mocks.retry,
  loadSecureWorkspaceRevision: async () => ({ version: 2 }),
}));
import { clearWorkspaceSession, isPendingMutationResolution, isWorkspaceMutationLocked, useStore } from './index';
import type { User } from '../types';
const initial = useStore.getState();
const actor: User = { id: 'integrity-admin', authUserId: 'integrity-auth', name: 'Admin', role: 'Project Manager', departments: ['Management'], isSuperAdmin: true };
const seed = () => useStore.setState({ ...initial, currentUser: actor, users: [actor], tasks: [], clients: [], projects: [], clientPlans: [], serviceCycles: [], deliverables: [], cycleComments: [], servicePricingSnapshots: [], notifications: [], backend: { ...initial.backend, mode: 'supabase', status: 'live', isConfigured: true, isLoading: false, isSaving: false, isPulling: false, hasLocalChanges: false, pendingMutations: 0, workspaceVersion: 1 } }, true);
beforeEach(() => { vi.clearAllMocks(); seed(); mocks.retained.mockReturnValue(null); mocks.capabilities.mockResolvedValue({ compatible: true }); mocks.getUser.mockResolvedValue({ data: { user: { id: actor.authUserId } }, error: null }); });
const input = { clientName: 'Integrity Client', planName: 'Integrity Plan', origin: 'custom' as const, serviceItems: [{ id: 'item', name: 'Design', platforms: [], unit: 'item', quantity: 1, unitPriceMinor: 100 }], startDate: '2026-09-01', billingDay: 1, discountType: 'none' as const, discountValue: 0, taxRateBps: 0 };
describe('session and acknowledgement integrity', () => {
  it('waits for a background refresh before confirming a plan draft save', async () => {
    mocks.save.mockResolvedValueOnce({ ok: true, commandId: 'saved-draft', workspaceVersion: 2 });
    expect(useStore.getState().createClientWithPlan(input).ok).toBe(true);
    useStore.setState(state => ({ backend: { ...state.backend, isPulling: true } }));
    const request = useStore.getState().commitPendingMutation('client_plan.manage');
    expect(mocks.save).not.toHaveBeenCalled();
    setTimeout(() => useStore.setState(state => ({ backend: { ...state.backend, isPulling: false } })), 60);
    expect(await request).toEqual({ ok: true });
    expect(mocks.save).toHaveBeenCalledOnce();
    expect(mocks.save.mock.calls[0][1]).toBe('client_plan.manage');
  });
  it('saves edits staged during a revision check without inventing a retry failure', async () => {
    let finish!: (value: unknown) => void;
    mocks.getUser.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    mocks.save.mockResolvedValueOnce({ ok: true, commandId: 'checked-draft', workspaceVersion: 3 });
    useStore.setState(state => ({ backend: { ...state.backend, workspaceVersion: 2 } }));
    const refresh = useStore.getState().pullBackendNow({ silent: true });
    await vi.waitFor(() => expect(mocks.getUser).toHaveBeenCalledOnce());
    expect(useStore.getState().createClientWithPlan(input).ok).toBe(true);
    const save = useStore.getState().commitPendingMutation('client_plan.manage');
    finish({ data: { user: { id: actor.authUserId } }, error: null });
    await refresh;
    expect(await save).toEqual({ ok: true });
    expect(mocks.save).toHaveBeenCalledOnce();
    expect(useStore.getState().backend).toMatchObject({ status: 'live', hasLocalChanges: false });
  });
  it('does not report success while another save is awaiting its acknowledgement', async () => {
    let finish!: (value: unknown) => void;
    mocks.save.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    useStore.getState().createClientWithPlan(input);
    const first = useStore.getState().commitPendingMutation('client_plan.manage');
    await vi.waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
    const second = useStore.getState().commitPendingMutation('client_plan.manage');
    finish({ ok: true, commandId: 'one-save', workspaceVersion: 2 });
    expect(await first).toEqual({ ok: true });
    expect(await second).toEqual({ ok: true });
    expect(mocks.save).toHaveBeenCalledOnce();
  });
  it('retains unsaved changes and offers an explicit retry after a busy wait expires', async () => {
    vi.useFakeTimers();
    try {
      useStore.getState().createClientWithPlan(input);
      useStore.setState(state => ({ backend: { ...state.backend, isPulling: true } }));
      const request = useStore.getState().commitPendingMutation('client_plan.manage');
      await vi.advanceTimersByTimeAsync(5001);
      expect(await request).toMatchObject({ ok: false, code: 'RETRY_REQUIRED', error: 'Another synchronization request is still running.' });
      expect(mocks.save).not.toHaveBeenCalled();
      expect(useStore.getState().backend).toMatchObject({ hasLocalChanges: true, pendingMutations: 1, pendingCommandType: 'client_plan.manage' });
      useStore.setState(state => ({ backend: { ...state.backend, isPulling: false } }));
      mocks.save.mockResolvedValueOnce({ ok: true, commandId: 'retry-draft', workspaceVersion: 2 });
      expect(await useStore.getState().retryPendingSave('client_plan.manage')).toEqual({ ok: true });
      expect(mocks.save).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); }
  });
  it('keeps a failed refresh visible without inventing a pending save or locking future edits', async () => {
    mocks.load.mockRejectedValueOnce(new Error('canceling statement due to statement timeout'));
    await useStore.getState().pullBackendNow({ force: true });
    expect(useStore.getState().backend).toMatchObject({ status: 'refresh_required', hasLocalChanges: false, pendingMutations: 0 });
    expect(useStore.getState().backend.error).toBeTruthy();
    expect(isPendingMutationResolution(useStore.getState().backend)).toBe(false);
    expect(isWorkspaceMutationLocked(useStore.getState())).toBe(false);
    expect(useStore.getState().createClientWithPlan(input).ok).toBe(true);
  });
  it('recovers a refresh-only failure from an older tab through retry without issuing a save', async () => {
    mocks.load.mockResolvedValue({ currentUser: actor, state: { ...initial, users: [actor], tasks: [] }, revision: { version: 2 }, notificationFeed: { items: [], unreadCount: 0 } });
    useStore.setState(state => ({ backend: { ...state.backend, status: 'retry_required', error: 'Refresh timed out.', hasLocalChanges: false, pendingMutations: 0 } }));
    expect(await useStore.getState().retryPendingSave()).toEqual({ ok: true });
    expect(mocks.load).toHaveBeenCalledOnce();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.retry).not.toHaveBeenCalled();
    expect(useStore.getState().backend).toMatchObject({ status: 'live', hasLocalChanges: false });
  });
  it('preserves the pending-save lock when a refresh fails with local edits', async () => {
    mocks.load.mockRejectedValueOnce(new Error('Refresh timed out.'));
    useStore.setState(state => ({ backend: { ...state.backend, hasLocalChanges: true, pendingMutations: 1 } }));
    await useStore.getState().pullBackendNow({ force: true });
    expect(useStore.getState().backend).toMatchObject({ status: 'retry_required', hasLocalChanges: true, pendingMutations: 1 });
    expect(isWorkspaceMutationLocked(useStore.getState())).toBe(true);
  });
  it('reports a confirmed save correctly when only its follow-up refresh times out', async () => {
    mocks.save.mockResolvedValueOnce({ ok: true, commandId: 'saved-plan', workspaceVersion: 2 });
    mocks.load.mockRejectedValueOnce(new Error('canceling statement due to statement timeout'));
    expect(useStore.getState().createClientWithPlan(input).ok).toBe(true);
    useStore.setState(state => ({ backend: { ...state.backend, hasRemoteUpdate: true } }));
    expect(await useStore.getState().commitPendingMutation('client_plan.manage')).toEqual({ ok: true });
    expect(useStore.getState().backend).toMatchObject({ status: 'refresh_required', hasLocalChanges: false, pendingMutations: 0, workspaceVersion: 2 });
    expect(useStore.getState().backend.lastSavedAt).toBeTruthy();
    expect(useStore.getState().backend.error).toBeTruthy();
    expect(isWorkspaceMutationLocked(useStore.getState())).toBe(false);
  });
  it('clears a rejected save code after loading canonical data', async () => {
    mocks.load.mockResolvedValue({ currentUser: actor, state: { ...initial, users: [actor], tasks: [] }, revision: { version: 2 }, notificationFeed: { items: [], unreadCount: 0 } });
    useStore.setState(state => ({ backend: { ...state.backend, status: 'retry_required', errorCode: 'FORBIDDEN', error: 'Rejected change.', pendingCommandType: 'task.update' } }));
    await useStore.getState().pullBackendNow({ force: true });
    expect(useStore.getState().backend).toMatchObject({ status: 'live', hasLocalChanges: false });
    expect(useStore.getState().backend.errorCode).toBeUndefined();
    expect(useStore.getState().backend.pendingCommandType).toBeUndefined();
  });
  it('clears a resolved retry code even when the follow-up refresh fails', async () => {
    mocks.retained.mockReturnValue({ id: 'confirmed-command', type: 'task.update', operations: [] });
    mocks.retry.mockResolvedValue({ ok: true, workspaceVersion: 2, commandId: 'confirmed-command' });
    mocks.load.mockRejectedValueOnce(new Error('Refresh temporarily unavailable.'));
    useStore.setState(state => ({ backend: { ...state.backend, status: 'conflict', hasLocalChanges: true, pendingMutations: 1, errorCode: 'CONFLICT' } }));
    expect(await useStore.getState().retryMutation()).toEqual({ ok: true });
    expect(useStore.getState().backend.hasLocalChanges).toBe(false);
    expect(useStore.getState().backend.errorCode).toBeUndefined();
  });
  it('clears a stale rejection when a clean workspace revision is already current', async () => {
    useStore.setState(state => ({ backend: { ...state.backend, workspaceVersion: 2, status: 'live', errorCode: 'FORBIDDEN', error: 'Old rejection.' } }));
    await useStore.getState().pullBackendNow();
    expect(useStore.getState().backend.status).toBe('live');
    expect(useStore.getState().backend.errorCode).toBeUndefined();
    expect(useStore.getState().backend.error).toBeUndefined();
  });
  it('retries a newer workspace with original row versions instead of overwriting concurrent task edits', async () => {
    const localTask = { id: 'shared-task', title: 'My title', dueDate: '2026-10-10', version: 1 };
    const remoteTask = { ...localTask, title: 'Remote title', dueDate: '2026-10-20', version: 2 };
    mocks.retained.mockReturnValue({ id: 'task-command', type: 'task.update', operations: [{ kind: 'entity', action: 'update', entityType: 'task', entityId: localTask.id, expectedVersion: 1, data: localTask }] });
    mocks.load.mockResolvedValue({ currentUser: actor, state: { ...initial, users: [actor], tasks: [remoteTask] }, revision: { version: 2 }, notificationFeed: { items: [], unreadCount: 0 } });
    mocks.save.mockResolvedValue({ ok: true, workspaceVersion: 3, commandId: 'rebuilt-command' });
    mocks.retry.mockResolvedValue({ ok: false, code: 'CONFLICT', error: 'This task changed elsewhere.', conflict: { entityType: 'task', entityId: localTask.id, expectedVersion: 1, actualVersion: 2, current: remoteTask, changedFields: ['title'] } });
    useStore.setState(state => ({ tasks: [localTask] as never, backend: { ...state.backend, status: 'conflict', hasLocalChanges: true, pendingMutations: 1, conflict: { entityType: 'workspace', entityId: 'aitask-main', expectedVersion: 1, actualVersion: 2 } } }));
    expect(await useStore.getState().reapplyMutationOnLatestWorkspace()).toMatchObject({ ok: false, error: 'This task changed elsewhere.' });
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.retry).toHaveBeenCalledWith(2, expect.objectContaining({ actorMemberId: actor.id }));
    expect(mocks.load).not.toHaveBeenCalled();
    expect(useStore.getState().backend.conflict).toMatchObject({ entityType: 'task', changedFields: ['title'] });
    expect(useStore.getState().backend.hasLocalChanges).toBe(true);
  });
  it('does not resume an old retry after account switching during the compatibility check', async () => {
    mocks.retained.mockReturnValue({ id: 'old-command', type: 'client_plan.manage', operations: [] });
    let finish!: (value: unknown) => void;
    mocks.capabilities.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    mocks.retry.mockResolvedValue({ ok: true, workspaceVersion: 9 });
    const request = useStore.getState().retryMutation();
    await vi.waitFor(() => expect(mocks.capabilities).toHaveBeenCalledOnce());
    clearWorkspaceSession();
    seed();
    useStore.setState({ currentUser: { ...actor, id: 'other-member', authUserId: 'other-auth' } });
    finish({ compatible: true });
    expect(await request).toEqual({ ok: false, error: 'Your session changed. Sign in again.' });
    expect(mocks.retry).not.toHaveBeenCalled();
    expect(mocks.load).not.toHaveBeenCalled();
    expect(useStore.getState().backend.workspaceVersion).toBe(1);
  });

  it('does not report an old retry saved or refresh another account after a delayed acknowledgement', async () => {
    mocks.retained.mockReturnValue({ id: 'old-command', type: 'client_plan.manage', operations: [] });
    let finish!: (value: unknown) => void;
    mocks.retry.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const request = useStore.getState().retryMutation();
    await vi.waitFor(() => expect(mocks.retry).toHaveBeenCalledOnce());
    clearWorkspaceSession(); seed();
    finish({ ok: true, workspaceVersion: 9 });
    expect(await request).toEqual({ ok: false, error: 'Your session changed. Sign in again.' });
    expect(mocks.load).not.toHaveBeenCalled();
    expect(useStore.getState().backend.workspaceVersion).toBe(1);
  });
  it('marks an optimistic mutation pending with no autosync listener and requires a backend write', async () => {
    mocks.save.mockResolvedValue({ ok: true, workspaceVersion: 2, commandId: 'saved-command' });
    expect(useStore.getState().createClientWithPlan(input).ok).toBe(true);
    expect(useStore.getState().backend.hasLocalChanges).toBe(true);
    expect(await useStore.getState().commitPendingMutation('client_plan.manage')).toEqual({ ok: true });
    expect(mocks.save).toHaveBeenCalledOnce();
    expect(mocks.save.mock.calls[0][0].clients[0].clientName).toBe('Integrity Client');
  });
  it('cannot resurrect a signed-out user or private data from a delayed pull', async () => {
    let finish!: (value: unknown) => void;
    mocks.load.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const request = useStore.getState().pullBackendNow({ force: true });
    await vi.waitFor(() => expect(mocks.load).toHaveBeenCalledOnce());
    clearWorkspaceSession();
    finish({ currentUser: actor, state: { ...initial, users: [actor], clients: [{ id: 'secret', clientName: 'Secret' }] }, revision: { version: 2 }, notificationFeed: { items: [], unreadCount: 0 } });
    await request;
    expect(useStore.getState().currentUser).toBeNull();
    expect(useStore.getState().clients).toEqual([]);
    expect(useStore.getState().backend.isPulling).toBe(false);
  });
  it('does not start a workspace load when sign-out occurs during identity verification', async () => {
    let finish!: (value: unknown) => void;
    mocks.getUser.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const request = useStore.getState().pullBackendNow({ force: true });
    await vi.waitFor(() => expect(mocks.getUser).toHaveBeenCalledOnce());
    clearWorkspaceSession();
    finish({ data: { user: { id: actor.authUserId } }, error: null });
    await request;
    expect(mocks.load).not.toHaveBeenCalled();
    expect(useStore.getState().currentUser).toBeNull();
    expect(useStore.getState().backend.isPulling).toBe(false);
  });

  it('cannot acknowledge a former session save after relogin', async () => {
    let finish!: (value: unknown) => void;
    mocks.save.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    useStore.getState().createClientWithPlan(input);
    const request = useStore.getState().commitPendingMutation('client_plan.manage');
    await vi.waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
    clearWorkspaceSession(); seed();
    finish({ ok: true, workspaceVersion: 9, commandId: 'old-command' });
    expect(await request).toEqual({ ok: false, error: 'Your session changed. Sign in again.' });
    expect(useStore.getState().backend.workspaceVersion).toBe(1);
  });
});
