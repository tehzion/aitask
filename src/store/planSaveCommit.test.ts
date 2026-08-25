import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.VITE_AITASK_BACKEND = 'supabase';
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
});

const { rpc, from, refreshSession } = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  refreshSession: vi.fn(),
}));

vi.mock('../lib/supabaseClient', () => ({
  supabase: { rpc, from, auth: { refreshSession } },
  shouldUseSecureSupabase: () => true,
  resolveAuthEmail: (value: string) => value,
}));

import { pendingMutationMessage, useStore } from './index';
import type { User } from '../types';

const initialState = useStore.getState();

const boss: User = {
  id: 'u-boss',
  name: 'Boss Koo',
  role: 'Admin',
  departments: ['Management'],
  department: 'Management',
  isSuperAdmin: true,
};

const planInput = {
  clientName: 'Recovery Co',
  planName: 'Recovery Plan',
  origin: 'custom' as const,
  serviceItems: [{ id: 'si-1', name: 'Design', platforms: [] as string[], unit: 'item', quantity: 1, unitPriceMinor: 100000 }],
  startDate: '2026-09-01',
  billingDay: 1,
  discountType: 'none' as const,
  discountValue: 0,
  taxRateBps: 0,
};

describe('plan wizard degraded-sync recovery', () => {
  beforeEach(() => {
    rpc.mockReset();
    from.mockReset();
    refreshSession.mockReset();
    useStore.setState({
      ...initialState,
      currentUser: boss,
      users: [boss],
      clients: [],
      projects: [],
      tasks: [],
      notifications: [],
      registrations: [],
      rolePermissions: [],
      taskStatuses: ['Pending', 'In Progress', 'Waiting Approval', 'Completed', 'Cancelled'],
      servicePackages: [],
      clientPlans: [],
      serviceCycles: [],
      deliverables: [],
      cycleComments: [],
      addons: [],
      serviceWorkflowTemplates: [],
      servicePricingSnapshots: [],
      backend: {
        ...initialState.backend,
        mode: 'supabase',
        status: 'retry_required',
        isConfigured: true,
        isLoading: false,
        isSaving: false,
        isPulling: false,
        hasLocalChanges: true,
        pendingMutations: 0,
        hasRemoteUpdate: false,
        upgradeRequired: false,
        workspaceVersion: 5,
        remoteVersion: 5,
        conflict: undefined,
        error: undefined,
      },
    });
  });

  it('creates the draft while degraded, reports the guard, and recovers through a direct sync', async () => {
    const created = useStore.getState().createClientWithPlan(planInput);
    expect(created.ok).toBe(true);
    expect(useStore.getState().clients.map(client => client.clientName)).toEqual(['Recovery Co']);

    const guarded = await useStore.getState().commitPendingMutation('client_plan.manage');
    expect(guarded).toMatchObject({ ok: false, error: pendingMutationMessage });
    expect(useStore.getState().backend.status).toBe('retry_required');

    rpc.mockResolvedValueOnce({
      data: {
        ok: true,
        commandId: '00000000-0000-4000-8000-000000000201',
        workspaceVersion: 6,
        changed: [],
      },
      error: null,
    });
    await useStore.getState().syncBackendNow('client_plan.manage');

    const after = useStore.getState().backend;
    expect(after.status).toBe('live');
    expect(after.hasLocalChanges).toBe(false);
    expect(after.workspaceVersion).toBe(6);
    expect(rpc).toHaveBeenCalledWith('aitask_execute_service_command', expect.objectContaining({
      p_command_type: 'client_plan.manage',
      p_expected_workspace_version: 5,
    }));
  });

  it('blocks plan creation while a retained command awaits retry and reports the guard', () => {
    useStore.setState(state => ({
      backend: { ...state.backend, pendingMutations: 1 },
    }));

    const created = useStore.getState().createClientWithPlan(planInput);

    expect(created).toMatchObject({ ok: false, error: pendingMutationMessage });
    expect(useStore.getState().clients).toEqual([]);
  });
});
