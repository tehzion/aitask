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

const staff: User = {
  id: 'u-staff',
  name: 'Staff Member',
  role: 'Staff',
  departments: ['Designer'],
  department: 'Designer',
  version: 3,
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

describe('retryPendingSave', () => {
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

  it('syncs the local diff directly when no command is retained', async () => {
    const created = useStore.getState().createClientWithPlan(planInput);
    expect(created.ok).toBe(true);

    rpc.mockResolvedValueOnce({
      data: { ok: true, commandId: '00000000-0000-4000-8000-000000000211', workspaceVersion: 6, changed: [] },
      error: null,
    });
    const result = await useStore.getState().retryPendingSave('client_plan.manage');

    expect(result).toMatchObject({ ok: true });
    expect(useStore.getState().backend.status).toBe('live');
    expect(useStore.getState().backend.hasLocalChanges).toBe(false);
    expect(rpc).toHaveBeenCalledWith('aitask_execute_service_command', expect.objectContaining({
      p_command_type: 'client_plan.manage',
      p_expected_workspace_version: 5,
    }));
  });

  it('retries the retained command when one exists', async () => {
    useStore.getState().createClientWithPlan(planInput);
    rpc.mockRejectedValueOnce(new Error('fetch failed'));
    await useStore.getState().syncBackendNow('client_plan.manage');
    expect(useStore.getState().backend.status).toBe('retry_required');

    rpc
      .mockResolvedValueOnce({
        data: { ok: true, schemaVersion: 4, workspaceOptimisticLock: true, serviceOperations: true, releaseNoticeAcknowledgements: true, memberPermissionManagement: true },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { ok: true, commandId: '00000000-0000-4000-8000-000000000212', workspaceVersion: 7, changed: [] },
        error: null,
      });
    const result = await useStore.getState().retryPendingSave('client_plan.manage');

    expect(result).toMatchObject({ ok: true });
    expect(useStore.getState().backend.hasLocalChanges).toBe(false);
    expect(useStore.getState().backend.pendingMutations).toBe(0);
    expect(rpc).toHaveBeenNthCalledWith(2, 'aitask_get_backend_capabilities', expect.objectContaining({
      p_workspace_id: 'aitask-main',
    }));
    expect(rpc.mock.calls[3]).toBeUndefined();
    expect(rpc.mock.calls[2][0]).toBe('aitask_execute_service_command');
  });

  it('retries a timed-out Staff permission update through the global retry control', async () => {
    useStore.setState(state => ({ users: [...state.users, staff] }));
    const permissions = {
      viewDashboard: true,
      viewTasks: true,
      viewCalendar: false,
      viewProjects: false,
      viewDeliveryTracker: true,
      viewReports: false,
      viewApprovals: false,
      viewSettings: false,
      viewAllTasks: false,
      createTasks: true,
      manageCreatedTasks: false,
      editTasks: false,
      createProjects: false,
      manageUsers: false,
      approveRegistrations: false,
      deleteUsers: false,
      viewAllClients: false,
      manageAssignedClients: false,
      clientReview: false,
      manageServiceCatalog: false,
      manageTaskTemplates: false,
      manageClientPlans: false,
      manageServiceCycles: false,
      viewAllServiceClients: false,
      viewAssignedServiceClients: true,
      viewServicePrices: false,
      viewProductionReports: false,
    };

    rpc.mockRejectedValueOnce(new Error('response lost'));
    const first = await useStore.getState().updateMemberPermissions(staff.id, permissions);
    expect(first.ok).toBe(false);
    expect(useStore.getState().backend.status).toBe('retry_required');
    const firstCommandId = rpc.mock.calls[0][1].p_command_id;

    rpc.mockResolvedValueOnce({
      data: {
        ok: true,
        commandId: firstCommandId,
        workspaceVersion: 6,
        replayed: true,
        member: { id: staff.id, permissions, version: 4, updated_at: '2026-09-10T00:00:00.000Z' },
      },
      error: null,
    });
    const retried = await useStore.getState().retryPendingSave();

    expect(retried).toMatchObject({ ok: true });
    expect(rpc).toHaveBeenLastCalledWith('aitask_update_member_permissions', expect.objectContaining({
      p_command_id: firstCommandId,
      p_member_id: staff.id,
    }));
    expect(useStore.getState().backend.status).toBe('live');
    expect(useStore.getState().backend.hasLocalChanges).toBe(false);
    expect(useStore.getState().backend.pendingMutations).toBe(0);
    expect(useStore.getState().users.find(user => user.id === staff.id)?.permissions).toMatchObject(permissions);
  });

  it('retries a timed-out Staff department update through the global retry control', async () => {
    useStore.setState(state => ({ users: [...state.users, staff] }));
    const departments = ['Designer', 'Video Editor'] as const;

    rpc.mockRejectedValueOnce(new Error('response lost'));
    const first = await useStore.getState().updateMemberDepartments(staff.id, [...departments]);
    expect(first.ok).toBe(false);
    const firstCommandId = rpc.mock.calls[0][1].p_command_id;

    rpc.mockResolvedValueOnce({
      data: {
        ok: true,
        commandId: firstCommandId,
        workspaceVersion: 6,
        replayed: true,
        member: { id: staff.id, departments, department: 'Designer', version: 4, updated_at: '2026-09-10T00:00:00.000Z' },
      },
      error: null,
    });
    const retried = await useStore.getState().retryPendingSave();

    expect(retried).toMatchObject({ ok: true });
    expect(rpc).toHaveBeenLastCalledWith('aitask_update_member_departments', expect.objectContaining({
      p_command_id: firstCommandId,
      p_member_id: staff.id,
      p_departments: ['Video Editor', 'Designer'],
    }));
    expect(useStore.getState().users.find(user => user.id === staff.id)?.departments).toEqual(['Video Editor', 'Designer']);
    expect(useStore.getState().backend.hasLocalChanges).toBe(false);
    expect(useStore.getState().backend.pendingMutations).toBe(0);
  });

  it('rebuilds the same typed save instead of replacing a rejected error with no retained change', async () => {
    const created = useStore.getState().createClientWithPlan(planInput);
    expect(created.ok).toBe(true);

    rpc.mockResolvedValueOnce({
      data: { ok: false, code: 'VALIDATION', error: 'The service plan could not be validated.' },
      error: null,
    });
    const first = await useStore.getState().retryPendingSave('client_plan.manage');
    expect(first).toMatchObject({ ok: false, error: 'The service plan could not be validated.' });
    expect(useStore.getState().backend.pendingCommandType).toBe('client_plan.manage');

    rpc.mockResolvedValueOnce({
      data: { ok: false, code: 'VALIDATION', error: 'The service plan could not be validated.' },
      error: null,
    });
    const retried = await useStore.getState().retryMutation();

    expect(retried).toMatchObject({ ok: false, error: 'The service plan could not be validated.' });
    expect(retried.error).not.toContain('no retained change');
    expect(rpc).toHaveBeenLastCalledWith('aitask_execute_service_command', expect.objectContaining({
      p_command_type: 'client_plan.manage',
      p_expected_workspace_version: 5,
    }));
  });
});
