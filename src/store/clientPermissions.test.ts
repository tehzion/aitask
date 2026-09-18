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
  departments: ['Designer'],
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
    expect(result).toEqual({ ok: false, error: 'Only Project Managers can rename their own companies.' });
    expect(useStore.getState().tasks[0]?.clientName).toBe('Acme');
  });

  it('lets an admin create a profile without a service plan and rejects duplicate names', () => {
    const admin: User = { id: 'admin-client-profile', name: 'Admin', role: 'Admin', departments: ['Management'], department: 'Management' };
    useStore.setState({ ...initialState, currentUser: admin, users: [admin], clients: [], tasks: [], projects: [], rolePermissions: [] }, true);

    const created = useStore.getState().createClientProfile({
      clientName: 'New Company',
      contactPerson: 'Alicia',
      email: 'alicia@example.com',
    });
    expect(created.ok).toBe(true);
    expect(useStore.getState().clientPlans).toEqual([]);
    expect(useStore.getState().clients[0]).toMatchObject({ clientName: 'New Company', contactPerson: 'Alicia' });

    const duplicate = useStore.getState().createClientProfile({ clientName: ' new company ' });
    expect(duplicate).toEqual({ ok: false, error: 'This company already exists in the Companies database.' });
  });

  it('cascades a company delete for an admin and blocks ordinary staff', () => {
    const admin: User = { id: 'admin-delete-client', name: 'Admin', role: 'Admin', departments: ['Management'], department: 'Management' };
    useStore.setState({
      ...initialState,
      currentUser: admin,
      users: [admin],
      clients: [],
      projects: [],
      tasks: [],
      clientPlans: [],
      serviceCycles: [],
      deliverables: [],
      cycleComments: [],
      addons: [],
      servicePricingSnapshots: [],
      rolePermissions: [],
      backend: { ...initialState.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 },
    }, true);

    const created = useStore.getState().createClientWithPlan({
      clientName: 'Delete Co',
      planName: 'Delete Growth',
      origin: 'custom',
      serviceItems: [{ id: 'svc-delete', name: 'Design', platforms: [], unit: 'post', quantity: 1, unitPriceMinor: 10000 }],
      startDate: '2026-08-15', billingDay: 15, discountType: 'none', discountValue: 0, taxRateBps: 0,
    });
    expect(created.ok).toBe(true);
    const activation = useStore.getState().activateClientPlan(created.planId!);
    expect(activation.ok).toBe(true);
    const clientId = created.clientId!;
    expect(useStore.getState().serviceCycles.some(cycle => cycle.clientId === clientId)).toBe(true);
    expect(useStore.getState().clientPlans.some(plan => plan.clientId === clientId)).toBe(true);

    expect(useStore.getState().deleteClientProfile(clientId)).toEqual({ ok: true });
    const state = useStore.getState();
    expect(state.clients).toEqual([]);
    expect(state.clientPlans.filter(plan => plan.clientId === clientId)).toEqual([]);
    expect(state.serviceCycles.filter(cycle => cycle.clientId === clientId)).toEqual([]);
    expect(state.deliverables.filter(item => item.clientId === clientId)).toEqual([]);
    expect(state.servicePricingSnapshots.filter(item => item.clientId === clientId)).toEqual([]);

    useStore.setState({
      currentUser: makeStaff(true),
      clients: [{ id: 'CL-keep', clientName: 'Keep Co', createdAt: '2026-01-01', updatedAt: '2026-01-01' }],
    });
    expect(useStore.getState().deleteClientProfile('CL-keep')).toEqual({ ok: false, error: 'You need permission to delete this company.' });
    expect(useStore.getState().clients).toHaveLength(1);
  });
});
