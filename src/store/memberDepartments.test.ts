import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task, User } from '../types';

vi.mock('../lib/supabaseClient', async importOriginal => {
  const actual = await importOriginal<typeof import('../lib/supabaseClient')>();
  return { ...actual, shouldUseSecureSupabase: () => false };
});

import { useStore } from './index';

const initialState = useStore.getState();

const boss: User = {
  id: 'boss-departments',
  name: 'Boss Koo',
  role: 'Admin',
  departments: ['Management'],
  isSuperAdmin: true,
};

const admin: User = {
  id: 'admin-departments',
  name: 'Admin',
  role: 'Admin',
  departments: ['Management'],
};

const staff: User = {
  id: 'staff-departments',
  name: 'Staff',
  role: 'Staff',
  departments: ['Designer', 'Video Editor'],
};

const assignedTask = {
  id: 'task-department-removal',
  clientName: 'Acme',
  serviceType: 'Design',
  title: 'Existing design task',
  description: '',
  department: 'Designer',
  assignedTo: staff.id,
  createdBy: boss.id,
  startDate: '2026-07-29',
  dueDate: '',
  priority: 'Medium',
  status: 'Pending',
  completionPercentage: 0,
  isCompleted: false,
  revisionCount: 0,
  clientApprovalStatus: 'Pending',
  isRecurring: false,
  recurrenceFrequency: 'None',
} satisfies Task;

describe('Super Admin member department management', () => {
  beforeEach(() => {
    useStore.setState({
      ...initialState,
      currentUser: boss,
      users: [boss, admin, staff],
      tasks: [assignedTask],
      rolePermissions: [],
    }, true);
  });

  afterEach(() => {
    useStore.setState(initialState, true);
  });

  it('allows Boss Koo to assign multiple equal departments', async () => {
    const result = await useStore.getState().updateMemberDepartments(staff.id, ['Operation', 'Video Editor']);
    expect(result.ok).toBe(true);
    expect(useStore.getState().users.find(user => user.id === staff.id)?.departments).toEqual([
      'Operation',
      'Video Editor',
    ]);
  });

  it('denies an ordinary Admin', async () => {
    useStore.setState({ currentUser: admin });
    const result = await useStore.getState().updateMemberDepartments(staff.id, ['Operation']);
    expect(result).toEqual({ ok: false, error: 'Only Boss Koo can manage member departments.' });
  });

  it('keeps existing task assignments when a department is removed', async () => {
    const result = await useStore.getState().updateMemberDepartments(staff.id, ['Video Editor']);
    expect(result.ok).toBe(true);
    expect(useStore.getState().tasks).toEqual([assignedTask]);
  });
});
