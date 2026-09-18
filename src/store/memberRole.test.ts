import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.VITE_AITASK_BACKEND = 'supabase';
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
});

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('../lib/supabaseClient', () => ({
  supabase: { rpc },
  shouldUseSecureSupabase: () => true,
  resolveAuthEmail: (value: string) => value,
}));

import { useStore } from './index';
import { defaultRolePermissions } from '../lib/access';
import type { Department, User } from '../types';

const initialState = useStore.getState();

const boss: User = {
  id: 'u-boss', name: 'Boss Koo', role: 'Admin', departments: ['Management'], department: 'Management', isSuperAdmin: true,
};
const target: User = {
  id: 'u-target', name: 'Target', role: 'Staff', departments: ['Designer'], department: 'Designer',
};

describe('member role assignment', () => {
  beforeEach(() => {
    rpc.mockReset();
    useStore.setState({
      ...initialState,
      currentUser: boss,
      users: [boss, target],
      clients: [{ id: 'CL-x', clientName: 'Acme', createdAt: '2026-01-01', updatedAt: '2026-01-01' }],
      rolePermissions: [],
    }, true);
  });

  it('persists a role change through the member role RPC', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        ok: true,
        commandId: 'cmd-1',
        workspaceVersion: 12,
        member: {
          id: 'u-target', role: 'Admin', customRoleId: null, customRoleName: null,
          clientName: null, departments: [], department: 'Management', version: 5, updated_at: '2026-09-18T00:00:00Z',
        },
      },
      error: null,
    });

    const result = await useStore.getState().changeMemberRole('u-target', 'Admin');
    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith('aitask_update_member_role', expect.objectContaining({
      p_member_id: 'u-target', p_role: 'Admin', p_client_name: null,
    }));
    expect(useStore.getState().users.find(user => user.id === 'u-target')?.role).toBe('Admin');
  });

  it('requires a company when assigning Client', async () => {
    const result = await useStore.getState().changeMemberRole('u-target', 'Client');
    expect(result.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('blocks a Project Manager (non-Boss Admin) from changing roles', async () => {
    const projectManager: User = { id: 'u-pm', name: 'Project Manager', role: 'Admin', departments: [], department: 'Management' };
    useStore.setState({ currentUser: projectManager });
    const result = await useStore.getState().changeMemberRole('u-target', 'Admin');
    expect(result).toEqual({ ok: false, error: 'Only Boss Koo can change member roles.' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('allows Admin without departments and requires them for Staff', async () => {
    const adminNoDept: User = { id: 'u-admin2', name: 'Admin Two', role: 'Admin', departments: [], department: 'Management' };
    const staffNoDept: User = { id: 'u-staff2', name: 'Staff Two', role: 'Staff', departments: [], department: '' as Department };
    useStore.setState({ users: [boss, target, adminNoDept, staffNoDept] });

    // Admin may have no departments.
    rpc.mockResolvedValueOnce({
      data: {
        ok: true, commandId: 'cmd-3', workspaceVersion: 14,
        member: {
          id: 'u-admin2', role: 'Admin', customRoleId: null, customRoleName: null,
          clientName: null, departments: [], department: 'Management', version: 2, updated_at: '2026-09-18T00:00:00Z',
        },
      },
      error: null,
    });
    expect((await useStore.getState().changeMemberRole('u-admin2', 'Admin')).ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith('aitask_update_member_role', expect.objectContaining({ p_role: 'Admin', p_departments: [] }));

    // Staff without any department is rejected before the RPC.
    rpc.mockClear();
    expect((await useStore.getState().changeMemberRole('u-staff2', 'Staff')).ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('maps HOD to a Staff member with the protected role', async () => {
    useStore.setState({
      rolePermissions: [{
        id: 'system-hod', name: 'HOD', baseRole: 'Staff', isProtected: true,
        permissions: { ...defaultRolePermissions.Staff, manageCreatedTasks: true },
        createdAt: '2026-01-01', updatedAt: '2026-01-01',
      }],
    });
    rpc.mockResolvedValueOnce({
      data: {
        ok: true, commandId: 'cmd-2', workspaceVersion: 13,
        member: {
          id: 'u-target', role: 'Staff', customRoleId: 'system-hod', customRoleName: 'HOD',
          clientName: null, departments: [], department: 'Designer', version: 6, updated_at: '2026-09-18T00:00:00Z',
        },
      },
      error: null,
    });
    const result = await useStore.getState().changeMemberRole('u-target', 'Staff', { customRoleId: 'system-hod' });
    expect(result.ok).toBe(true);
    expect(useStore.getState().users.find(user => user.id === 'u-target')?.customRoleId).toBe('system-hod');
  });
});
