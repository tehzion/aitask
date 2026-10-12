import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => {
  process.env.VITE_AITASK_BACKEND = 'supabase';
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
});
const mocks = vi.hoisted(() => ({ load: vi.fn(), getUser: vi.fn(), save: vi.fn(), revision: vi.fn(), subscribe: vi.fn() }));
vi.mock('../lib/supabaseClient', () => ({
  supabase: { auth: { getUser: mocks.getUser } },
  shouldUseSecureSupabase: () => true,
  resolveAuthEmail: (value: string) => value,
  subscribeToCurrentMemberAccessChanges: mocks.subscribe,
}));
vi.mock('../lib/secureWorkspace', async importOriginal => ({
  ...await importOriginal<typeof import('../lib/secureWorkspace')>(),
  loadSecureWorkspace: mocks.load,
  saveSecureWorkspace: mocks.save,
  loadSecureWorkspaceRevision: mocks.revision,
  loadSecureBackendCapabilities: async () => ({ compatible: true }),
}));
import { useStore, clearWorkspaceSession, startBackendAutoSync, stopBackendAutoSync } from './index';
import { getVisibleTasks } from '../lib/access';
import type { Task, User } from '../types';
const initial = useStore.getState();
const hod: User = { id: 'sync-hod', authUserId: 'sync-auth', name: 'Sync HOD', role: 'HOD', departments: ['Video Editor'], department: 'Video Editor' };
const task: Task = { id: 'shared-task', title: 'Department task', description: '', clientName: 'Sync Client', serviceType: 'Video', department: 'Video Editor', assignedTo: 'sync-staff', createdBy: 'sync-pm', startDate: '2026-10-01', dueDate: '2026-10-10', priority: 'Medium', status: 'Pending', isCompleted: false, completionPercentage: 0, revisionCount: 0, clientApprovalStatus: 'Pending', isRecurring: false, version: 1 };
const remote = (tasks: Task[], currentUser: User = hod) => ({
  currentUser,
  state: { ...initial, users: [currentUser], tasks, clients: [], projects: [], notifications: [], clientPlans: [], serviceCycles: [], deliverables: [], cycleComments: [], rolePermissions: [] },
  revision: { version: 2, updatedAt: '2026-10-07T00:00:00Z' },
  notificationFeed: { items: [], unreadCount: 0 },
});
beforeEach(() => {
  vi.clearAllMocks();
  const storage = () => { const values = new Map<string, string>(); return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) }; };
  vi.stubGlobal('window', { localStorage: storage(), sessionStorage: storage(), setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout, location: { hostname: 'localhost' }, setInterval: vi.fn(() => 1), clearInterval: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal('document', { visibilityState: 'visible', addEventListener: vi.fn(), removeEventListener: vi.fn() });
  clearWorkspaceSession();
  mocks.subscribe.mockReturnValue(() => undefined);
  useStore.setState({ ...initial, currentUser: hod, users: [hod], tasks: [task], clients: [], projects: [], notifications: [], rolePermissions: [], clientPlans: [], serviceCycles: [], deliverables: [], cycleComments: [], backend: { ...initial.backend, mode: 'supabase', status: 'live', isConfigured: true, isLoading: false, isSaving: false, isPulling: false, hasLocalChanges: false, pendingMutations: 0, workspaceVersion: 1 } }, true);
  mocks.getUser.mockResolvedValue({ data: { user: { id: hod.authUserId } }, error: null });
  mocks.revision.mockResolvedValue({ version: 2 });
  startBackendAutoSync();
});
afterEach(() => { stopBackendAutoSync(); vi.unstubAllGlobals(); });

describe('cross-role changes reaching the HOD workspace', () => {
  it.each(['Boss', 'Project Manager', 'Staff', 'Client'])('pulls authorized %s updates without echoing them back as a save', async sourceRole => {
    const changed = { ...task, version: 2, status: sourceRole === 'Client' ? 'In Progress' : 'Waiting Approval', revisionCount: sourceRole === 'Client' ? 1 : 0, comments: [{ id: 'remote-comment', userId: sourceRole, text: `${sourceRole} update`, createdAt: '2026-10-07T00:00:00Z' }] };
    mocks.load.mockResolvedValue(remote([changed]));
    await useStore.getState().pullBackendNow({ silent: true });
    const state = useStore.getState();
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0]).toMatchObject({ id: task.id, version: 2, status: changed.status, revisionCount: changed.revisionCount, comments: [{ id: 'remote-comment', userId: sourceRole, text: `${sourceRole} update` }] });
    expect(getVisibleTasks(state.currentUser, state.tasks, state.rolePermissions).map(item => item.id)).toEqual([task.id]);
    expect(state.backend).toMatchObject({ status: 'live', workspaceVersion: 2, hasLocalChanges: false, pendingMutations: 0 });
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('removes a formerly visible task when the server narrows HOD department access', async () => {
    const changedHod = { ...hod, departments: ['Video Shooting'], department: 'Video Shooting' } as User;
    mocks.load.mockResolvedValue(remote([], changedHod));
    await useStore.getState().pullBackendNow({ force: true });
    expect(useStore.getState().tasks).toEqual([]);
    expect(useStore.getState().updateTaskStatus(task.id, 'Completed').ok).toBe(false);
  });
  it('preserves an unsaved HOD edit when a background refresh finds newer work', async () => {
    useStore.setState(state => ({ tasks: [{ ...task, title: 'Unsaved HOD edit' }], backend: { ...state.backend, status: 'retry_required', hasLocalChanges: true, pendingMutations: 1 } }));
    await useStore.getState().pullBackendNow({ silent: true });
    expect(mocks.load).not.toHaveBeenCalled();
    expect(useStore.getState().tasks[0].title).toBe('Unsaved HOD edit');
    expect(useStore.getState().backend.hasLocalChanges).toBe(true);
  });
  it('rejects a delayed HOD snapshot after switching to the Client session', async () => {
    let resolve!: (value: unknown) => void;
    mocks.load.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const request = useStore.getState().pullBackendNow({ force: true });
    await vi.waitFor(() => expect(mocks.load).toHaveBeenCalledOnce());
    clearWorkspaceSession();
    const client = { id: 'sync-client', name: 'Client', authUserId: 'client-auth', role: 'Client', companyName: 'Other client' } as User;
    useStore.setState({ currentUser: client, users: [client], tasks: [] });
    resolve(remote([task]));
    await request;
    expect(useStore.getState().currentUser?.id).toBe(client.id);
    expect(useStore.getState().tasks).toEqual([]);
  });
});


it('queues Boss access notifications while an HOD edit needs retry, then refreshes after resolution', async () => {
  const callback = mocks.subscribe.mock.calls[0][3] as () => void;
  useStore.setState(state => ({ tasks: [{ ...task, title: 'Pending edit' }], backend: { ...state.backend, status: 'retry_required', hasLocalChanges: true, pendingMutations: 1 } }));
  callback();
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(mocks.load).not.toHaveBeenCalled();
  expect(useStore.getState().tasks[0].title).toBe('Pending edit');
  mocks.load.mockResolvedValue(remote([{ ...task, title: 'Saved server work' }]));
  useStore.setState(state => ({ backend: { ...state.backend, status: 'live', hasLocalChanges: false, pendingMutations: 0 } }));
  await vi.waitFor(() => expect(useStore.getState().tasks[0].title).toBe('Saved server work'));
  expect(useStore.getState().backend.hasLocalChanges).toBe(false);
});
