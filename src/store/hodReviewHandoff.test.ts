import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useStore } from './index';
import type { Task, User } from '../types';

const initial = useStore.getState();
const staff: User = { id: 'submitter', name: 'Staff', role: 'Staff', department: 'Designer', departments: ['Designer'] };
const hod: User = { id: 'reviewer', name: 'HOD', role: 'HOD', department: 'Designer', departments: ['Designer'] };
const other: User = { ...hod, id: 'other-department', department: 'Video Editor', departments: ['Video Editor'] };
const task: Task = { id: 'review-task', title: 'Review artwork', clientName: 'Company', serviceType: 'Design', description: '', department: 'Designer', assignedTo: staff.id, assignedBy: hod.id, createdBy: hod.id, startDate: '2026-10-01', dueDate: '', status: 'In Progress', priority: 'Medium', completionPercentage: 50, isCompleted: false, revisionCount: 0, clientApprovalStatus: 'Pending', isRecurring: false, visibility: 'internal' };

beforeEach(() => useStore.setState({ ...initial, currentUser: staff, users: [staff, hod, other], tasks: [{ ...task }], clients: [], projects: [], deliverables: [], serviceCycles: [], notifications: [], rolePermissions: [], backend: { ...initial.backend, mode: 'local', status: 'local', pendingMutations: 0, hasLocalChanges: false } }, true));
afterEach(() => useStore.setState(initial, true));

describe('HOD review handoff', () => {
  for (const entry of ['quick action', 'full edit']) it(`${entry} hands submitted work to its department HOD`, () => {
    const result = entry === 'quick action'
      ? useStore.getState().updateTaskStatus(task.id, 'Waiting Approval')
      : useStore.getState().updateTask(task.id, { status: 'Waiting Approval' });
    expect(result.ok).toBe(true);
    expect(useStore.getState().tasks[0]).toMatchObject({ status: 'Waiting Approval', isCompleted: false });
    expect(useStore.getState().notifications).toEqual([expect.objectContaining({ targetUserId: hod.id, title: 'Task Ready for Approval', route: { page: 'tasks', entityId: task.id } })]);
    expect(useStore.getState().updateTask(task.id, { notes: 'Review brief clarified', status: 'Waiting Approval' }).ok).toBe(true);
    expect(useStore.getState().notifications).toHaveLength(1);
    useStore.setState({ currentUser: hod });
    expect(useStore.getState().requestRevision(task.id, 'Update the artwork').ok).toBe(true);
    useStore.setState({ currentUser: staff });
    expect(useStore.getState().updateTaskStatus(task.id, 'Waiting Approval').ok).toBe(true);
    expect(useStore.getState().notifications.filter(n => n.targetUserId === hod.id)).toHaveLength(2);
  });

  it('leaves hosted handoffs to the database and avoids client-generated duplicates', () => {
    useStore.setState({ backend: { ...useStore.getState().backend, mode: 'supabase', status: 'live' } });
    expect(useStore.getState().updateTaskStatus(task.id, 'Waiting Approval').ok).toBe(true);
    expect(useStore.getState().notifications).toHaveLength(0);
  });
});
