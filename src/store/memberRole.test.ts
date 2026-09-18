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
import type { User } from '../types';

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
