import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => {
  process.env.VITE_AITASK_BACKEND = 'supabase';
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
});
const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), getUser: vi.fn() }));
vi.mock('../lib/supabaseClient', () => ({
  supabase: { auth: { getUser: mocks.getUser } },
  shouldUseSecureSupabase: () => true,
  resolveAuthEmail: (value: string) => value,
}));
vi.mock('../lib/secureWorkspace', async importOriginal => ({
  ...await importOriginal<typeof import('../lib/secureWorkspace')>(),
  loadSecureWorkspace: mocks.load,
  saveSecureWorkspace: mocks.save,
  loadSecureBackendCapabilities: async () => ({ compatible: true }),
  loadSecureWorkspaceRevision: async () => ({ version: 2 }),
}));
import { clearWorkspaceSession, useStore } from './index';
import type { User } from '../types';
const initial = useStore.getState();
const actor: User = { id: 'integrity-admin', authUserId: 'integrity-auth', name: 'Admin', role: 'Project Manager', departments: ['Management'], isSuperAdmin: true };
const seed = () => useStore.setState({ ...initial, currentUser: actor, users: [actor], tasks: [], clients: [], projects: [], clientPlans: [], serviceCycles: [], deliverables: [], cycleComments: [], servicePricingSnapshots: [], notifications: [], backend: { ...initial.backend, mode: 'supabase', status: 'live', isConfigured: true, isLoading: false, isSaving: false, isPulling: false, hasLocalChanges: false, pendingMutations: 0, workspaceVersion: 1 } }, true);
beforeEach(() => { vi.clearAllMocks(); seed(); mocks.getUser.mockResolvedValue({ data: { user: { id: actor.authUserId } }, error: null }); });
const input = { clientName: 'Integrity Client', planName: 'Integrity Plan', origin: 'custom' as const, serviceItems: [{ id: 'item', name: 'Design', platforms: [], unit: 'item', quantity: 1, unitPriceMinor: 100 }], startDate: '2026-09-01', billingDay: 1, discountType: 'none' as const, discountValue: 0, taxRateBps: 0 };
describe('session and acknowledgement integrity', () => {
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
