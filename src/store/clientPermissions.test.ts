import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultRolePermissions } from '../lib/access';
import type { Task, User } from '../types';
import { useStore } from './index';

const initialState = useStore.getState();

const assignedTask: Task = {
  id: 'task-client-permission',
  clientName: 'Acme',
  serviceType: 'Design',
  title: 'Assigned client work',
  description: '',
  department: 'Designer',
  assignedTo: 'staff-client-manager',
  createdBy: 'admin-1',
  startDate: '2026-07-13',
  dueDate: '',
  priority: 'Medium',
  status: 'Pending',
  completionPercentage: 0,
  isCompleted: false,
  revisionCount: 0,
  clientApprovalStatus: 'Pending',
  isRecurring: false,
  recurrenceFrequency: 'None',
};

const makeStaff = (manageAssignedClients: boolean, viewAllClients = false): User => ({
  id: 'staff-client-manager',
  name: 'Client Manager',
  role: 'Staff',
  department: 'Designer',
  permissions: {
    ...defaultRolePermissions.Staff,
    manageAssignedClients,
    viewAllClients,
  },
});

describe('client profile store authorization', () => {
  beforeEach(() => {
    useStore.setState({
      ...initialState,
      currentUser: makeStaff(false),
      users: [makeStaff(false)],
      clients: [],
      tasks: [assignedTask],
      projects: [],
      rolePermissions: [],
    }, true);
  });

  afterEach(() => {
    useStore.setState(initialState, true);
  });

  it('rejects assignment alone and view-all visibility alone', () => {
    const assignedOnly = useStore.getState().upsertClientProfile('Acme', { contactPerson: 'Alicia' });
    expect(assignedOnly.ok).toBe(false);
    expect(useStore.getState().clients).toEqual([]);

    useStore.setState({ currentUser: makeStaff(false, true) });
    const viewAllOnly = useStore.getState().upsertClientProfile('Acme', { contactPerson: 'Alicia' });
    expect(viewAllOnly.ok).toBe(false);
    expect(useStore.getState().clients).toEqual([]);
  });

  it('saves for permitted assigned staff and blocks a stale save after revocation', () => {
    useStore.setState({ currentUser: makeStaff(true) });
    const permitted = useStore.getState().upsertClientProfile('Acme', { contactPerson: 'Alicia' });
    expect(permitted.ok).toBe(true);
    expect(useStore.getState().clients[0]?.contactPerson).toBe('Alicia');

    useStore.setState({ currentUser: makeStaff(false) });
    const revoked = useStore.getState().upsertClientProfile('Acme', { contactPerson: 'Changed' });
    expect(revoked.ok).toBe(false);
    expect(useStore.getState().clients[0]?.contactPerson).toBe('Alicia');
  });

  it('keeps global rename admin-only', () => {
    useStore.setState({ currentUser: makeStaff(true) });
    const result = useStore.getState().renameClient('Acme', 'Acme Global');
    expect(result).toEqual({ ok: false, error: 'Only admins can rename clients.' });
    expect(useStore.getState().tasks[0]?.clientName).toBe('Acme');
  });
});
