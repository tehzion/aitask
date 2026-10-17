import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useStore } from './index';
import type { Deliverable, ServiceCycle, Task, User } from '../types';
const initial = useStore.getState();
const actor = { id: 'boss', name: 'Boss', role: 'Project Manager', isSuperAdmin: true, departments: [] } as User;
const task = { id: 'task', clientId: 'client', clientName: 'Company', assignedTo: actor.id, createdBy: actor.id, status: 'Completed', isCompleted: true } as Task;
const cycle = { id: 'cycle', clientId: 'client', status: 'Published' } as ServiceCycle;
const deliverable = { id: 'd', clientId: 'client', cycleId: 'cycle', status: 'Planned', taskIds: [], attachments: [] } as Deliverable;
beforeEach(() => useStore.setState({ ...initial, currentUser: actor, users: [actor], rolePermissions: [], tasks: [structuredClone(task)], deliverables: [structuredClone(deliverable)], serviceCycles: [structuredClone(cycle)], backend: { ...initial.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 } }, true));
afterEach(() => useStore.setState(initial, true));
describe('explicit delivery task links', () => {
  it('requires an explicit permitted removal before repairing a cross-company link', () => {
    useStore.setState({ tasks: [{ ...task, deliverableId: 'd', serviceCycleId: 'cycle' }], deliverables: [{ ...deliverable, clientId: 'wrong-company', taskIds: [task.id] }] });
    expect(useStore.getState().unlinkInvalidTaskDelivery(task.id).ok).toBe(true);
    expect(useStore.getState().tasks[0]).toMatchObject({ id: task.id, status: 'Completed' });
    expect(useStore.getState().tasks[0].deliverableId).toBeUndefined();
    expect(useStore.getState().deliverables[0].taskIds).toEqual([]);
    useStore.setState({ deliverables: [deliverable] });
    expect(useStore.getState().linkTaskToDeliverable(task.id, cycle.id, deliverable.id).ok).toBe(true);
    expect(useStore.getState().deliverables[0].status).toBe('Ready');
  });
  it('rejects removal of valid links and refuses unauthorized repairs', () => {
    useStore.setState({ tasks: [{ ...task, deliverableId: 'd' }] });
    expect(useStore.getState().unlinkInvalidTaskDelivery(task.id).ok).toBe(false);
    useStore.setState({ currentUser: { id: 'worker', role: 'Staff', name: 'Worker', departments: [] }, deliverables: [{ ...deliverable, clientId: 'wrong-company' }] });
    const before = structuredClone(useStore.getState().tasks);
    expect(useStore.getState().unlinkInvalidTaskDelivery(task.id).ok).toBe(false);
    expect(useStore.getState().tasks).toEqual(before);
  });
  it('links completed work as Ready without confirming delivery', () => {
    expect(useStore.getState().linkTaskToDeliverable(task.id, cycle.id, deliverable.id).ok).toBe(true);
    expect(useStore.getState().tasks[0].deliverableId).toBe('d');
    expect(useStore.getState().deliverables[0]).toMatchObject({ status: 'Ready', taskIds: ['task'] });
    expect(useStore.getState().serviceCycles[0].status).toBe('Published');
  });
  it('rejects cross-company links without altering records', () => {
    useStore.setState({ deliverables: [{ ...deliverable, clientId: 'other' }] });
    expect(useStore.getState().linkTaskToDeliverable(task.id, cycle.id, deliverable.id).ok).toBe(false);
    expect(useStore.getState().tasks[0]).toEqual(task);
  });
  for (const reverse of [false, true]) it(`rejects moving ${reverse ? 'reverse' : 'forward'} linked work`, () => {
    useStore.setState({ tasks: [{ ...task, deliverableId: reverse ? undefined : 'old' }], deliverables: [deliverable, { ...deliverable, id: 'old', taskIds: reverse ? [task.id] : [] }] });
    const before = structuredClone(useStore.getState().tasks);
    expect(useStore.getState().linkTaskToDeliverable(task.id, cycle.id, deliverable.id)).toMatchObject({ ok: false, error: 'This task is already linked to another deliverable.' });
    expect(useStore.getState().tasks).toEqual(before);
  });
  it('lets an assigned worker link their own work without the Boss-only task key', () => {
    useStore.setState({ currentUser: { id: 'worker', name: 'Worker', role: 'Staff', departments: ['Designer'] }, tasks: [{ ...task, assignedTo: 'worker', createdBy: 'worker' }] });
    expect(useStore.getState().linkTaskToDeliverable(task.id, cycle.id, deliverable.id).ok).toBe(true);
    expect(useStore.getState().deliverables[0].taskIds).toEqual([task.id]);
  });
  it('lets a Project Manager link work in their own portfolio', () => {
    const pm = { id: 'pm-owner', name: 'PM', role: 'Project Manager', departments: [] } as User;
    useStore.setState({
      currentUser: pm,
      users: [pm],
      clients: [{ id: 'client', clientName: 'Company', createdBy: 'pm-owner', createdAt: '', updatedAt: '' }],
    });
    expect(useStore.getState().linkTaskToDeliverable(task.id, cycle.id, deliverable.id).ok).toBe(true);
    expect(useStore.getState().deliverables[0].taskIds).toEqual([task.id]);
  });
  it('blocks a Project Manager from linking a foreign portfolio task', () => {
    const pm = { id: 'pm-owner', name: 'PM', role: 'Project Manager', departments: [] } as User;
    useStore.setState({
      currentUser: pm,
      users: [pm],
      clients: [{ id: 'other-client', clientName: 'Other Company', createdBy: 'other-pm', createdAt: '', updatedAt: '' }],
    });
    expect(useStore.getState().linkTaskToDeliverable(task.id, cycle.id, deliverable.id).ok).toBe(false);
    expect(useStore.getState().deliverables[0]).toEqual(deliverable);
  });
  it('rejects adding work to a Delivered item without changing its confirmation timestamp', () => {
    const confirmed = { ...deliverable, status: 'Delivered' as const, deliveredAt: '2026-10-01T10:00:00Z' };
    useStore.setState({ deliverables: [confirmed], tasks: [{ ...task, status: 'Pending', isCompleted: false }] });
    const before = structuredClone(useStore.getState().tasks);
    expect(useStore.getState().linkTaskToDeliverable(task.id, cycle.id, deliverable.id))
      .toMatchObject({ ok: false, error: 'Reopen the delivery before adding task links.' });
    expect(useStore.getState().tasks).toEqual(before);
    expect(useStore.getState().deliverables).toEqual([confirmed]);
  });
  it('clears a dangling primary task reference when its task is deleted', () => {
    useStore.setState({ tasks: [{ ...task, deliverableId: 'd' }], deliverables: [{ ...deliverable, taskIds: [task.id], primaryTaskId: task.id }] });
    expect(useStore.getState().deleteTask(task.id).ok).toBe(true);
    expect(useStore.getState().tasks).toHaveLength(0);
    expect(useStore.getState().deliverables[0]).toMatchObject({ taskIds: [], primaryTaskId: undefined });
  });
  it('clears a dangling primary task reference when its task is unlinked', () => {
    useStore.setState({ tasks: [{ ...task, deliverableId: 'd' }], deliverables: [{ ...deliverable, taskIds: [task.id], primaryTaskId: task.id }] });
    expect(useStore.getState().linkTaskToDeliverable(task.id).ok).toBe(true);
    expect(useStore.getState().deliverables[0]).toMatchObject({ taskIds: [], primaryTaskId: undefined });
  });

});
