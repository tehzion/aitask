import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => {
  process.env.VITE_AITASK_BACKEND = 'supabase';
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
});
const mocks = vi.hoisted(() => ({ load: vi.fn(), getUser: vi.fn(), save: vi.fn(), revision: vi.fn(), findUnsaved: vi.fn() }));
vi.mock('../lib/supabaseClient', () => ({
  supabase: { auth: { getUser: mocks.getUser } },
  shouldUseSecureSupabase: () => true,
  resolveAuthEmail: (value: string) => value,
  subscribeToCurrentMemberAccessChanges: () => () => undefined,
  subscribeToWorkspaceRevisionChanges: () => () => undefined,
  subscribeToWorkspaceTaskChanges: () => () => undefined,
  subscribeToWorkspaceNotificationChanges: () => () => undefined,
}));
vi.mock('../lib/secureWorkspace', async importOriginal => ({
  ...await importOriginal<typeof import('../lib/secureWorkspace')>(),
  loadSecureWorkspace: mocks.load,
  saveSecureWorkspace: mocks.save,
  loadSecureWorkspaceRevision: mocks.revision,
  loadSecureBackendCapabilities: async () => ({ compatible: true }),
  findUnsavedRows: mocks.findUnsaved,
}));
import { useStore, clearWorkspaceSession, unsavedChangeMessage } from './index';
import type { ClientProfile, User } from '../types';

const initial = useStore.getState();
const pm: User = { id: 'pm-intent', authUserId: 'pm-intent-auth', name: 'Intent PM', role: 'Project Manager', departments: ['Operation'], department: 'Operation' };
const company: ClientProfile = { id: 'CL-intent', clientName: 'Intent Co', createdBy: pm.id, createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z' };

beforeEach(() => {
  vi.clearAllMocks();
  const storage = () => { const values = new Map<string, string>(); return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) }; };
  vi.stubGlobal('window', { localStorage: storage(), sessionStorage: storage(), setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout, location: { hostname: 'localhost' }, setInterval: vi.fn(() => 1), clearInterval: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal('document', { visibilityState: 'visible', addEventListener: vi.fn(), removeEventListener: vi.fn() });
  clearWorkspaceSession();
  useStore.setState({ ...initial, currentUser: pm, users: [pm], tasks: [], clients: [company], projects: [], notifications: [], rolePermissions: [], clientPlans: [], serviceCycles: [], deliverables: [], cycleComments: [], backend: { ...initial.backend, mode: 'supabase', status: 'live', isConfigured: true, isLoading: false, isSaving: false, isPulling: false, hasLocalChanges: false, pendingMutations: 0, workspaceVersion: 1 } }, true);
  mocks.revision.mockResolvedValue({ version: 2 });
  mocks.save.mockResolvedValue({ ok: true, data: { ok: true, workspaceVersion: 2 }, commandId: 'cmd-intent', workspaceVersion: 2 });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('a company change the save left out', () => {
  it('is reported as not saved instead of Saved.', async () => {
    mocks.findUnsaved.mockImplementation((_state, refs: { entityId: string }[]) => refs.filter(ref => ref.entityId === company.id));
    expect(useStore.getState().upsertClientProfile(company.clientName, { phone: '+60 12 000 0000' }).ok).toBe(true);

    const result = await useStore.getState().commitPendingMutation();

    expect(mocks.save).toHaveBeenCalledOnce();
    expect(mocks.findUnsaved).toHaveBeenCalledWith(expect.anything(), [expect.objectContaining({ entityType: 'client', entityId: company.id, label: company.clientName })]);
    const message = unsavedChangeMessage([{ label: company.clientName }]);
    expect(result).toMatchObject({ ok: false, code: 'FORBIDDEN', error: message });
    expect(useStore.getState().backend).toMatchObject({ status: 'refresh_required', errorCode: 'FORBIDDEN', hasLocalChanges: true, message });
    expect(message).toBe("Not saved: you don't have permission to change Intent Co. Refresh to see the saved version.");
  });

  it('still reports Saved. when the change reached the server', async () => {
    mocks.findUnsaved.mockReturnValue([]);
    expect(useStore.getState().upsertClientProfile(company.clientName, { phone: '+60 12 000 0001' }).ok).toBe(true);

    const result = await useStore.getState().commitPendingMutation();

    expect(result.ok).toBe(true);
    expect(useStore.getState().backend).toMatchObject({ status: 'live', hasLocalChanges: false, message: 'Saved.' });
  });

  it('does not check background saves that carry no intended change', async () => {
    useStore.setState(state => ({ tasks: [], backend: { ...state.backend, hasLocalChanges: true, pendingMutations: 1 }, clients: [{ ...company, updatedAt: '2026-11-02T00:00:00.000Z' }] }));
    mocks.findUnsaved.mockImplementation((_state, refs: unknown[]) => refs);

    const result = await useStore.getState().commitPendingMutation();

    expect(result.ok).toBe(true);
    expect(mocks.findUnsaved).toHaveBeenCalledWith(expect.anything(), []);
  });
});
