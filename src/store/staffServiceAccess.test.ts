import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Deliverable, ServiceCycle, Task, User } from '../types';
import { defaultRolePermissions } from '../lib/access';
import { useStore } from './index';

const initialState = useStore.getState();
const cycle = { id: 'cycle', clientId: 'client', clientName: 'Company', status: 'Published', publishedAt: '2026-10-01', serviceItems: [], addonSnapshots: [] } as unknown as ServiceCycle;
const deliverable = { id: 'deliverable', clientId: 'client', clientName: 'Company', cycleId: cycle.id, status: 'Planned', taskIds: ['task'], attachments: [] } as Deliverable;

describe.each(['Staff', 'HOD'] as const)('%s assigned-service access', role => {
  const actor: User = { id: 'worker', name: 'Worker', role, department: 'Designer', departments: ['Designer'] };
  beforeEach(() => useStore.setState({
    ...initialState,
    currentUser: actor, users: [actor], rolePermissions: [],
    tasks: [{ id: 'task', clientName: 'Company', assignedTo: actor.id, createdBy: 'pm', department: 'Designer', serviceCycleId: cycle.id, deliverableId: deliverable.id } as Task],
    clients: [], serviceCycles: [structuredClone(cycle)], deliverables: [structuredClone(deliverable)], cycleComments: [],
    backend: { ...initialState.backend, mode: 'local', status: 'local', pendingMutations: 0 },
  }, true));
  afterEach(() => useStore.setState(initialState, true));

  it('allows assigned execution and comments with service access', () => {
    expect(useStore.getState().setServiceCycleStatus(cycle.id, 'Published').ok).toBe(true);
    expect(useStore.getState().updateDeliverableStatus(deliverable.id, 'Delivered').ok).toBe(true);
    expect(useStore.getState().addCycleComment(cycle.id, 'Ready for review', 'internal').ok).toBe(true);
  });

  it('rejects all three actions immediately after service access is revoked', () => {
    useStore.setState({ currentUser: { ...actor, permissions: { ...defaultRolePermissions[role], viewAssignedServiceClients: false } } });
    expect(useStore.getState().setServiceCycleStatus(cycle.id, 'Completed').ok).toBe(false);
    expect(useStore.getState().updateDeliverableStatus(deliverable.id, 'Delivered').ok).toBe(false);
    expect(useStore.getState().addCycleComment(cycle.id, 'Blocked', 'internal').ok).toBe(false);
    expect(useStore.getState().serviceCycles).toEqual([cycle]);
    expect(useStore.getState().deliverables).toEqual([deliverable]);
    expect(useStore.getState().cycleComments).toEqual([]);
  });

  it('does not treat department oversight or task creation as assigned-service access', () => {
    useStore.setState({ tasks: [{ ...useStore.getState().tasks[0], assignedTo: 'other-worker', createdBy: actor.id }] });
    expect(useStore.getState().setServiceCycleStatus(cycle.id, 'Completed').ok).toBe(false);
    expect(useStore.getState().updateDeliverableStatus(deliverable.id, 'Delivered').ok).toBe(false);
    expect(useStore.getState().addCycleComment(cycle.id, 'Blocked', 'internal').ok).toBe(false);
  });
});
