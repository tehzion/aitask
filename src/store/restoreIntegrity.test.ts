// Regression coverage converted from the save/recovery audit.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
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
  getRetainedSecureCommand: () => null,
  loadSecureWorkspaceRevision: async () => ({ version: 2 }),
}));
import { clearWorkspaceSession, isWorkspaceMutationLocked, useStore } from './index';
import { buildOperations } from '../lib/secureWorkspace';
import type { User } from '../types';
const initial = useStore.getState();
const actor: User = { id: 'audit-admin', authUserId: 'audit-auth', name: 'Audit Admin', role: 'Project Manager', departments: ['Management'], isSuperAdmin: true };
const input = { clientName: 'Abandoned company', planName: 'Abandoned plan', origin: 'custom' as const,
  serviceItems: [{ id: 'scope', name: 'Design', platforms: [], unit: 'post', quantity: 1, unitPriceMinor: 100 }],
  startDate: '2026-10-01', billingDay: 1, discountType: 'none' as const, discountValue: 0, taxRateBps: 0 };
beforeEach(() => {
  vi.clearAllMocks();
  useStore.setState({ ...initial, currentUser: actor, users: [actor], tasks: [], clients: [], projects: [], clientPlans: [],
    serviceCycles: [], deliverables: [], cycleComments: [], servicePricingSnapshots: [], notifications: [],
    backend: { ...initial.backend, mode: 'supabase', status: 'live', isConfigured: true, isLoading: false, isSaving: false,
      isPulling: false, hasLocalChanges: false, pendingMutations: 0, workspaceVersion: 1 } }, true);
  mocks.getUser.mockResolvedValue({ data: { user: { id: actor.authUserId } }, error: null });
});
afterEach(() => vi.useRealTimers());

it('blocks new mutations for the entire canonical restore request', async () => {
  expect(useStore.getState().createClientWithPlan(input).ok).toBe(true);
  let rejectRestore!: (error: Error) => void;
  mocks.load.mockImplementationOnce(() => new Promise((_, reject) => { rejectRestore = reject; }));
  const restoring = useStore.getState().discardMutation();
  await vi.waitFor(() => expect(mocks.load).toHaveBeenCalledOnce());
  expect(useStore.getState().backend.isRestoring).toBe(true);
  expect(isWorkspaceMutationLocked(useStore.getState())).toBe(true);
  expect(useStore.getState().createClientWithPlan({ ...input, clientName: 'Blocked during restore' }).ok).toBe(false);
  rejectRestore(new Error('Restore unavailable.'));
  await restoring;
  expect(useStore.getState().backend.isRestoring).toBe(false);
  expect(isWorkspaceMutationLocked(useStore.getState())).toBe(true);
});

it('sign-out releases the restore lock and ignores its late result in the next account', async () => {
  let rejectRestore!: (error: Error) => void;
  mocks.load.mockImplementationOnce(() => new Promise((_, reject) => { rejectRestore = reject; }));
  const restoring = useStore.getState().discardMutation();
  await vi.waitFor(() => expect(mocks.load).toHaveBeenCalledOnce());
  clearWorkspaceSession();
  expect(useStore.getState().backend.isRestoring).toBe(false);
  const nextActor = { ...actor, id: 'next-account', authUserId: 'next-auth' };
  useStore.setState({ currentUser: nextActor, users: [nextActor] });
  rejectRestore(new Error('Old account restore failed late.'));
  await restoring;
  expect(useStore.getState().currentUser?.id).toBe(nextActor.id);
  expect(useStore.getState().backend).toMatchObject({ status: 'live', isRestoring: false });
  expect(isWorkspaceMutationLocked(useStore.getState())).toBe(false);
});

it('a failed restore keeps pending records locked and cannot leak them into another save', async () => {
  expect(useStore.getState().createClientWithPlan(input).ok).toBe(true);
  mocks.load.mockRejectedValueOnce(new Error('Restore request timed out.'));
  await useStore.getState().discardMutation();
  expect(useStore.getState().backend).toMatchObject({ status: 'retry_required', hasLocalChanges: true, pendingMutations: 1, isRestoring: false });
  expect(isWorkspaceMutationLocked(useStore.getState())).toBe(true);
  expect(useStore.getState().clients.map(client => client.clientName)).toEqual(['Abandoned company']);
  expect(useStore.getState().createClientWithPlan({ ...input, clientName: 'Unrelated new company' }).ok).toBe(false);
  expect(mocks.save).not.toHaveBeenCalled();
  mocks.load.mockResolvedValueOnce({ currentUser: actor, state: { ...initial, users: [actor], tasks: [], projects: [], clients: [], clientPlans: [], servicePricingSnapshots: [] }, revision: { version: 2 }, notificationFeed: { items: [], unreadCount: 0 } });
  await useStore.getState().discardMutation();
  expect(useStore.getState().clients).toEqual([]);
  expect(isWorkspaceMutationLocked(useStore.getState())).toBe(false);
  expect(useStore.getState().createClientWithPlan({ ...input, clientName: 'Unrelated new company', planName: 'New plan' }).ok).toBe(true);
  expect(buildOperations(useStore.getState()).filter(operation => operation.entityType === 'client').map(operation => operation.data?.clientName)).toEqual(['Unrelated new company']);
  mocks.save.mockResolvedValueOnce({ ok: true, commandId: 'later-save', workspaceVersion: 3 });
  expect(await useStore.getState().commitPendingMutation('client_plan.manage')).toEqual({ ok: true });
  expect(mocks.save.mock.calls[0][0].clients.map((client: { clientName: string }) => client.clientName)).toEqual(['Unrelated new company']);
});

it('secure-mode milestone retry confirms the existing ID after a busy timeout', async () => {
  vi.useFakeTimers();
  useStore.setState(state => ({ projects: [{ id: 'audit-project', clientName: 'Audit company', projectName: 'Audit project', services: [],
    startDate: '2026-10-01', deadline: '2026-11-30', projectManagerIds: [actor.id], status: 'Active', milestones: [] }],
    backend: { ...state.backend, isPulling: true } }));
  const milestone = { name: 'Repeated milestone', targetDate: '2026-11-30', status: 'Not Started' as const };
  const first = useStore.getState().saveProjectMilestone('audit-project', milestone);
  expect(first.ok).toBe(true);
  const confirmation = useStore.getState().commitPendingMutation('project.update');
  await vi.advanceTimersByTimeAsync(5001);
  expect(await confirmation).toMatchObject({ ok: false, code: 'RETRY_REQUIRED' });
  expect(mocks.save).not.toHaveBeenCalled();
  expect(isWorkspaceMutationLocked(useStore.getState())).toBe(false);
  useStore.setState(state => ({ backend: { ...state.backend, isPulling: false } }));
  mocks.save.mockResolvedValueOnce({ ok: true, commandId: 'same-milestone', workspaceVersion: 3 });
  expect(await useStore.getState().retryPendingSave('project.update')).toEqual({ ok: true });
  expect(useStore.getState().projects[0].milestones).toHaveLength(1);
  expect(useStore.getState().projects[0].milestones?.[0].id).toBe(first.id);
  expect(mocks.save).toHaveBeenCalledOnce();
});
