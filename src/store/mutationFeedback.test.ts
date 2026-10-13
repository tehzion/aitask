import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => {
  process.env.VITE_AITASK_BACKEND = 'supabase';
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
});
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), getUser: vi.fn() }));
vi.mock('../lib/supabaseClient', () => ({ supabase: { rpc: mocks.rpc, from: mocks.from, auth: { getUser: mocks.getUser, refreshSession: vi.fn() } }, shouldUseSecureSupabase: () => true, resolveAuthEmail: (value: string) => value }));
import { clearWorkspaceSession, useStore } from './index';
import { useToastStore } from './useToastStore';
import { saveSecureWorkspace } from '../lib/secureWorkspace';
import { acknowledgeMutationFeedback, confirmMutationFeedback } from '../lib/mutationFeedback';
import { msg } from '../lib/messages';
import type { Task } from '../types';

const initial = useStore.getState();
const authId = '00000000-0000-4000-8000-000000000001';
const stamp = '2026-10-13T00:00:00Z';
let failure: 'network' | 'validation' | undefined;
let version: number;
let entities: { entity_type: string; entity_id: string; workspace_id: string; version: number; updated_at: string; data: Record<string, unknown> }[];
let member: Record<string, unknown>;
const task: Task = { id: 'feedback-task', title: 'Campaign work', description: '', clientId: 'feedback-company', clientName: 'Feedback Company', serviceType: 'Design', department: 'Designer', assignedTo: 'feedback-worker', createdBy: 'feedback-manager', startDate: '2026-10-13', dueDate: '', priority: 'Medium', status: 'Pending', completionPercentage: 0, isCompleted: false, revisionCount: 0, clientApprovalStatus: 'Pending', isRecurring: false, recurrenceFrequency: 'None', version: 1 };

beforeEach(() => {
  const storage = new Map<string, string>();
  const adapter = { getItem: (key: string) => storage.get(key) || null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) };
  vi.stubGlobal('window', { location: { hostname: 'example.test' }, localStorage: adapter, sessionStorage: adapter, setTimeout, clearTimeout });
  clearWorkspaceSession({ discardPending: true });
  useToastStore.setState({ toasts: [] });
  version = 1; failure = undefined; entities = [];
  mocks.rpc.mockReset(); mocks.from.mockReset();
  mocks.getUser.mockResolvedValue({ data: { user: { id: authId } }, error: null });
  mocks.from.mockImplementation((table: string) => {
    const query: Record<string, (...args: unknown[]) => unknown> = {};
    for (const method of ['select', 'eq', 'neq', 'order', 'abortSignal']) query[method] = () => query;
    query.single = () => Promise.resolve({ data: { version, updated_at: stamp, sync_protocol_version: 1 }, error: null });
    query.range = (from: number, to: number) => Promise.resolve({ data: (table === 'aitask_members' ? [member] : entities).slice(from, to + 1), error: null });
    return query;
  });
  mocks.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name === 'aitask_read_notifications') return { data: { ok: true, memberId: member.id, items: [], unreadCount: 0 }, error: null };
    if (name === 'aitask_get_backend_capabilities') return { data: { ok: true, schemaVersion: 5, workflowReviewGate: true, workspaceOptimisticLock: true, serviceOperations: true, releaseNoticeAcknowledgements: true, memberPermissionManagement: true }, error: null };
    if (failure === 'network') { failure = undefined; throw new Error('Lost connection'); }
    if (failure === 'validation') { failure = undefined; return { data: { ok: false, code: 'VALIDATION', error: 'The command contains invalid data.' }, error: null }; }
    const changed = [];
    for (const operation of args.p_operations as { entityType: string; entityId: string; kind: string; data: Record<string, unknown> }[]) {
      if (operation.kind === 'entity') {
        let row = entities.find(item => item.entity_type === operation.entityType && item.entity_id === operation.entityId);
        if (!row) { row = { entity_type: operation.entityType, entity_id: operation.entityId, workspace_id: 'aitask-main', data: operation.data, version: 0, updated_at: stamp }; entities.push(row); }
        row.data = structuredClone(operation.data); row.version += 1;
      }
      changed.push({ entityType: operation.entityType, entityId: operation.entityId, version: 2, updatedAt: stamp });
    }
    return { data: { ok: true, workspaceVersion: ++version, commandId: args.p_command_id, changed }, error: null };
  });
});
afterEach(() => { clearWorkspaceSession({ discardPending: true }); vi.unstubAllGlobals(); useStore.setState(initial, true); });

const setup = async (boss: boolean) => {
  const actor = { id: 'feedback-manager', authUserId: authId, name: boss ? 'Boss Koo' : 'Responsible PM', role: 'Project Manager' as const, departments: ['Management' as const], isSuperAdmin: boss };
  member = { id: actor.id, workspace_id: 'aitask-main', auth_user_id: authId, name: actor.name, role: actor.role, departments: actor.departments, department: 'Management', is_super_admin: boss, version: 1, updated_at: stamp };
  useStore.setState({ ...initial, currentUser: actor, users: [actor], tasks: [{ ...task }], clients: [{ id: task.clientId!, clientName: task.clientName, createdBy: actor.id, createdAt: stamp, updatedAt: stamp }], projects: [], notifications: [], registrations: [], rolePermissions: [], taskStatuses: [], clientPlans: [], serviceCycles: [], deliverables: [], cycleComments: [], addons: [], servicePackages: [], serviceWorkflowTemplates: [], servicePricingSnapshots: [], backend: { ...initial.backend, mode: 'supabase', status: 'live', isConfigured: true, isLoading: false, isSaving: false, isPulling: false, hasLocalChanges: false, pendingMutations: 0, workspaceVersion: 1, error: undefined } }, true);
  expect((await saveSecureWorkspace(useStore.getState())).ok).toBe(true);
};

describe('acknowledged mutation feedback', () => {
  for (const boss of [false, true]) {
    it(`${boss ? 'Boss' : 'PM'} gets no false success on a failed save and one confirmation after retry`, async () => {
      await setup(boss);
      expect(useStore.getState().updateTaskPriority(task.id, 'High').ok).toBe(true);
      expect(useToastStore.getState().toasts).toEqual([]);
      failure = 'network';
      expect((await useStore.getState().commitPendingMutation('task.update')).ok).toBe(false);
      expect(useToastStore.getState().toasts.filter(toast => toast.type === 'success')).toEqual([]);
      expect((await useStore.getState().retryPendingSave()).ok).toBe(true);
      expect(useToastStore.getState().toasts.map(toast => toast.message)).toEqual([msg('task.priorityUpdated', { priority: 'High' })]);
    });
  }
  it('discarding a failed save prevents its old success message from appearing later', async () => {
    await setup(true);
    useStore.getState().updateTaskPriority(task.id, 'High'); failure = 'network';
    await useStore.getState().commitPendingMutation('task.update');
    await useStore.getState().discardMutation();
    confirmMutationFeedback();
    acknowledgeMutationFeedback();
    expect(useToastStore.getState().toasts.filter(toast => toast.type === 'success')).toEqual([]);
  });
  it('a terminal rejection clears success feedback and uses a normal form error', async () => {
    await setup(false);
    useStore.getState().updateTaskPriority(task.id, 'High'); failure = 'validation';
    expect(await useStore.getState().commitPendingMutation('task.update')).toMatchObject({ ok: false, error: 'Use latest, then review your changes.' });
    confirmMutationFeedback();
    acknowledgeMutationFeedback();
    expect(useToastStore.getState().toasts.filter(toast => toast.type === 'success')).toEqual([]);
  });
  it('changing account drops the previous account’s pending confirmation', async () => {
    await setup(true);
    useStore.getState().updateTaskPriority(task.id, 'High');
    useStore.setState(state => ({ currentUser: { ...state.currentUser!, id: 'other-account' } }));
    confirmMutationFeedback();
    acknowledgeMutationFeedback();
    expect(useToastStore.getState().toasts).toEqual([]);
  });
  it('an unrelated background update cannot announce an unconfirmed pending change', async () => {
    await setup(false);
    useStore.getState().updateTaskPriority(task.id, 'High');
    useStore.setState(state => ({ backend: { ...state.backend, status: 'live', hasLocalChanges: false, lastSavedAt: new Date().toISOString() } }));
    expect(useToastStore.getState().toasts).toEqual([]);
    useStore.setState(state => ({ backend: { ...state.backend, hasLocalChanges: true } }));
    expect((await useStore.getState().commitPendingMutation('task.update')).ok).toBe(true);
    expect(useToastStore.getState().toasts.map(toast => toast.message)).toEqual([msg('task.priorityUpdated', { priority: 'High' })]);
  });
});
