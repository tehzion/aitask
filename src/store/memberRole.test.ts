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
import type { Department, User } from '../types';

const initialState = useStore.getState();

const boss: User = {
  id: 'u-boss', name: 'Boss Koo', role: 'Project Manager', departments: ['Management'], department: 'Management', isSuperAdmin: true,
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
          id: 'u-target', role: 'Project Manager', customRoleId: null, customRoleName: null,
          clientName: null, departments: [], department: 'Management', version: 5, updated_at: '2026-09-18T00:00:00Z',
        },
      },
      error: null,
    });

    const result = await useStore.getState().changeMemberRole('u-target', 'Project Manager');
    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith('aitask_update_member_role', expect.objectContaining({
      p_member_id: 'u-target', p_role: 'Project Manager', p_client_name: null,
    }));
    expect(useStore.getState().users.find(user => user.id === 'u-target')?.role).toBe('Project Manager');
  });

  it('requires a company when assigning Client', async () => {
    const result = await useStore.getState().changeMemberRole('u-target', 'Client');
    expect(result.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('blocks a non-Boss Project Manager from changing roles', async () => {
    const projectManager: User = { id: 'u-pm', name: 'Project Manager', role: 'Project Manager', departments: [], department: 'Management' };
    useStore.setState({ currentUser: projectManager });
    const result = await useStore.getState().changeMemberRole('u-target', 'Project Manager');
    expect(result).toEqual({ ok: false, error: 'Only Boss Koo can change member roles.' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('allows Project Managers without departments and requires them for Staff/HOD', async () => {
    const adminNoDept: User = { id: 'u-admin2', name: 'Project Manager Two', role: 'Project Manager', departments: [], department: 'Management' };
    const staffNoDept: User = { id: 'u-staff2', name: 'Staff Two', role: 'Staff', departments: [], department: '' as Department };
    useStore.setState({ users: [boss, target, adminNoDept, staffNoDept] });

    // Project Managers may have no departments because their scope is portfolio-based.
    rpc.mockResolvedValueOnce({
      data: {
        ok: true, commandId: 'cmd-3', workspaceVersion: 14,
        member: {
          id: 'u-admin2', role: 'Project Manager', customRoleId: null, customRoleName: null,
          clientName: null, departments: [], department: 'Management', version: 2, updated_at: '2026-09-18T00:00:00Z',
        },
      },
      error: null,
    });
    expect((await useStore.getState().changeMemberRole('u-admin2', 'Project Manager')).ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith('aitask_update_member_role', expect.objectContaining({ p_role: 'Project Manager', p_departments: [] }));

    // Staff without any department is rejected before the RPC.
    rpc.mockClear();
    expect((await useStore.getState().changeMemberRole('u-staff2', 'Staff')).ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('assigns HOD as a direct editable default role', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        ok: true, commandId: 'cmd-2', workspaceVersion: 13,
        member: {
          id: 'u-target', role: 'HOD', customRoleId: null, customRoleName: null,
          clientName: null, departments: [], department: 'Designer', version: 6, updated_at: '2026-09-18T00:00:00Z',
        },
      },
      error: null,
    });
    const result = await useStore.getState().changeMemberRole('u-target', 'HOD');
    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith('aitask_update_member_role', expect.objectContaining({ p_role: 'HOD', p_custom_role_id: null }));
    expect(useStore.getState().users.find(user => user.id === 'u-target')?.role).toBe('HOD');
    expect(useStore.getState().users.find(user => user.id === 'u-target')?.customRoleId).toBeUndefined();
  });
});
