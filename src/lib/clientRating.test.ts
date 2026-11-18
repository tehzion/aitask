import { describe, expect, it } from 'vitest';
import { parseTask } from './security';
import { useStore } from '../store';
import type { Task, User } from '../types';

const pm = { id: 'pm', name: 'PM', role: 'Project Manager', departments: ['Management'], department: 'Management' } as unknown as User;
const staff = { id: 'staff', name: 'Staff', role: 'Staff', departments: ['Designer'], department: 'Designer' } as unknown as User;
const baseTask = { id: 't1', title: 'Done work', clientName: 'Acme', department: 'Designer', assignedTo: 'staff', createdBy: 'pm', status: 'Completed', isCompleted: true, visibility: 'client-visible', serviceType: 'Design', priority: 'Medium', revisionCount: 0, clientApprovalStatus: 'Approved' } as unknown as Task;

const setup = (user: User, task: Task) => useStore.setState({
  currentUser: user, users: [pm, staff], tasks: [task], clients: [{ id: 'c', clientName: 'Acme', createdBy: 'pm' }] as never, projects: [], rolePermissions: [],
  backend: { ...useStore.getState().backend, mode: 'local', status: 'local', isSaving: false, isPulling: false, pendingMutations: 0, hasLocalChanges: false } as never,
});

describe('delivery rating', () => {
  it('lets a Project Manager rate an accepted delivery', () => {
    setup(pm, baseTask);
    expect(useStore.getState().rateTaskDelivery('t1', 4, '  Loved it ').ok).toBe(true);
    expect(useStore.getState().tasks[0].clientRating).toMatchObject({ stars: 4, comment: 'Loved it', ratedBy: 'pm' });
  });
  it('refuses Staff, unfinished work and out-of-range stars', () => {
    setup(staff, baseTask);
    expect(useStore.getState().rateTaskDelivery('t1', 5).ok).toBe(false);
    setup(pm, { ...baseTask, status: 'In Progress', isCompleted: false } as Task);
    expect(useStore.getState().rateTaskDelivery('t1', 5).ok).toBe(false);
    setup(pm, baseTask);
    expect(useStore.getState().rateTaskDelivery('t1', 0).ok).toBe(false);
    expect(useStore.getState().rateTaskDelivery('t1', 6).ok).toBe(false);
    expect(useStore.getState().tasks[0].clientRating).toBeUndefined();
  });
  it('keeps a stored rating through the task sanitizer and drops a malformed one', () => {
    const rating = { stars: 5, comment: 'Great', ratedBy: 'pm', ratedAt: '2026-11-19T01:00:00.000Z' };
    const kept = parseTask({ ...baseTask, clientRating: rating });
    expect(kept?.clientRating).toMatchObject({ stars: 5, comment: 'Great' });
    const dropped = parseTask({ ...baseTask, clientRating: { stars: 9, ratedBy: 'pm', ratedAt: rating.ratedAt } });
    expect(dropped?.clientRating).toBeUndefined();
  });
});
