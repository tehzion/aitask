import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/supabaseClient', () => ({
  supabase: { rpc: vi.fn(), auth: { refreshSession: vi.fn(), signOut: vi.fn() } },
  shouldUseSecureSupabase: () => false,
  resolveAuthEmail: (value: string) => value,
}));
import { defaultRolePermissions } from '../lib/access';
import type { User } from '../types';
import { useStore } from './index';

const initialState = useStore.getState();
const boss: User = {
  id: 'boss', name: 'Boss Koo', role: 'Admin', departments: ['Management'], department: 'Management', isSuperAdmin: true,
};
const staff: User = {
  id: 'staff', name: 'Staff Member', role: 'Staff', departments: ['Designer'], department: 'Designer', version: 1,
};

describe('member permission management', () => {
  beforeEach(() => {
    useStore.setState({
      ...initialState,
      currentUser: boss,
      users: [boss, staff],
      rolePermissions: [],
    }, true);
  });

  afterEach(() => useStore.setState(initialState, true));

  it('lets only Boss Koo save safe Staff overrides', async () => {
    const permissions = {
      ...defaultRolePermissions.Staff,
      viewProjects: false,
      viewDeliveryTracker: true,
      manageCreatedTasks: true,
      editTasks: true,
      manageUsers: true,
    };
    const result = await useStore.getState().updateMemberPermissions(staff.id, permissions);

    expect(result.ok).toBe(true);
    expect(useStore.getState().users.find(user => user.id === staff.id)?.permissions).toMatchObject({
      viewProjects: false,
      viewDeliveryTracker: true,
      manageCreatedTasks: true,
      editTasks: false,
      manageUsers: false,
    });

    useStore.setState({ currentUser: staff });
    const forbidden = await useStore.getState().updateMemberPermissions(staff.id, defaultRolePermissions.Staff);
    expect(forbidden.ok).toBe(false);
  });

  it('clears direct permissions when resetting to role defaults', async () => {
    useStore.setState({ users: [boss, { ...staff, permissions: { ...defaultRolePermissions.Staff, viewProjects: false } }] });
    const result = await useStore.getState().updateMemberPermissions(staff.id);
    expect(result.ok).toBe(true);
    expect(useStore.getState().users.find(user => user.id === staff.id)?.permissions).toBeUndefined();
  });
});
