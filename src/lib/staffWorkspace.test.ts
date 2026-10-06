import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import { buildStaffWorkQueue, getStaffFocusTask, getStaffGuidedAction, getTaskBlockers, getHodScopeTasks } from './staffWorkspace';

const task = (overrides: Partial<Task>): Task => ({
  id: overrides.id || crypto.randomUUID(),
  clientName: 'UrbanEats',
  serviceType: 'Video',
  title: 'Edit video',
  description: '',
  department: 'Video Editor',
  assignedTo: 'staff-1',
  createdBy: 'admin-1',
  startDate: '2026-08-01',
  dueDate: '2026-08-30',
  priority: 'Medium',
  status: 'Pending',
  completionPercentage: 0,
  isCompleted: false,
  revisionCount: 0,
  clientApprovalStatus: 'Pending',
  isRecurring: false,
  ...overrides,
});

describe('staff workspace queue', () => {
  it('buckets and ranks revisions, overdue, today, in-progress, future and undated work', () => {
    const queue = buildStaffWorkQueue([
      task({ id: 'future', dueDate: '2026-09-02' }),
      task({ id: 'undated', dueDate: '' }),
      task({ id: 'today', dueDate: '2026-08-26' }),
      task({ id: 'overdue', dueDate: '2026-08-20' }),
      task({ id: 'revision', revisionCount: 1, dueDate: '2026-09-03' }),
      task({ id: 'progress', status: 'In Progress', dueDate: '2026-09-01' }),
      task({ id: 'waiting', status: 'Waiting Approval' }),
      task({ id: 'done', status: 'Completed', isCompleted: true, completedAt: '2026-08-25T10:00:00Z' }),
      task({ id: 'cancelled', status: 'Cancelled' }),
    ], '2026-08-26');

    expect(queue.needs_action.map(item => item.id)).toEqual(['revision', 'overdue', 'today', 'progress']);
    expect(queue.up_next.map(item => item.id)).toEqual(['future', 'undated']);
    expect(queue.waiting.map(item => item.id)).toEqual(['waiting']);
    expect(queue.done.map(item => item.id)).toEqual(['done', 'cancelled']);
    expect(getStaffFocusTask(queue)?.id).toBe('revision');
  });

  it('breaks equal urgency by priority and then update time', () => {
    const queue = buildStaffWorkQueue([
      task({ id: 'medium-old', dueDate: '2026-08-26', priority: 'Medium', updatedAt: '2026-08-20T00:00:00Z' }),
      task({ id: 'urgent', dueDate: '2026-08-26', priority: 'Urgent' }),
      task({ id: 'medium-new', dueDate: '2026-08-26', priority: 'Medium', updatedAt: '2026-08-25T00:00:00Z' }),
    ], '2026-08-26');

    expect(queue.needs_action.map(item => item.id)).toEqual(['urgent', 'medium-new', 'medium-old']);
  });

  it('orders future work by due date before priority and update time', () => {
    const queue = buildStaffWorkQueue([
      task({ id: 'due-sooner', dueDate: '2026-08-28', priority: 'High', updatedAt: '2026-08-20T00:00:00Z' }),
      task({ id: 'updated-later', dueDate: '2026-09-08', priority: 'High', updatedAt: '2026-08-25T00:00:00Z' }),
    ], '2026-08-26');

    expect(queue.up_next.map(item => item.id)).toEqual(['due-sooner', 'updated-later']);
  });
});

describe('staff guided task actions', () => {
  const statuses = ['Pending', 'In Progress', 'Waiting Approval', 'Completed', 'Cancelled'];

  it('maps standard workflow states to one next action', () => {
    expect(getStaffGuidedAction(task({ status: 'Pending' }), statuses)).toMatchObject({ label: 'Start work', targetStatus: 'In Progress' });
    expect(getStaffGuidedAction(task({ status: 'Pending', revisionCount: 2 }), statuses)).toMatchObject({ label: 'Start revision', targetStatus: 'In Progress' });
    expect(getStaffGuidedAction(task({ status: 'In Progress' }), statuses)).toMatchObject({ label: 'Send for review', targetStatus: 'Waiting Approval' });
    expect(getStaffGuidedAction(task({ status: 'Waiting Approval' }), statuses)).toMatchObject({ label: 'Waiting for review', disabled: true });
  });

  it('falls back to the status picker for custom or incomplete workflows', () => {
    expect(getStaffGuidedAction(task({ status: 'QA review' }), statuses)).toMatchObject({ kind: 'picker', label: 'Update status' });
    expect(getStaffGuidedAction(task({ status: 'Pending' }), ['Pending', 'Completed'])).toMatchObject({ kind: 'picker' });
  });

  it('renders completed and cancelled work as terminal states', () => {
    expect(getStaffGuidedAction(task({ status: 'Completed', isCompleted: true }), statuses)).toEqual({ kind: 'terminal', label: 'Completed', disabled: true });
    expect(getStaffGuidedAction(task({ status: 'Cancelled' }), statuses)).toEqual({ kind: 'terminal', label: 'Cancelled', disabled: true });
  });
});


describe('HOD oversight', () => {
  it('keeps older overdue deadlines ahead of newer urgent work', () => {
    const queue = buildStaffWorkQueue([
      task({ id: 'oldest', dueDate: '2026-08-01', priority: 'Low' }),
      task({ id: 'urgent', dueDate: '2026-08-25', priority: 'Urgent', updatedAt: '2026-08-26' }),
    ], '2026-08-26');
    expect(getStaffFocusTask(queue)?.id).toBe('oldest');
  });

  it('counts only open, visible predecessors of open tasks', () => {
    const work = task({ predecessorTaskIds: ['open', 'completed', 'cancelled', 'hidden'] });
    const visible = [
      task({ id: 'open' }),
      task({ id: 'completed', status: 'Completed', isCompleted: false }),
      task({ id: 'cancelled', status: 'Cancelled', isCompleted: false }),
    ];
    expect(getTaskBlockers(work, visible).map(item => item.id)).toEqual(['open']);
    expect(getTaskBlockers({ ...work, isCompleted: true }, visible)).toEqual([]);
    expect(getTaskBlockers({ ...work, status: 'Cancelled' }, visible)).toEqual([]);
  });

  it('separates personal assignments from created or reassigned delegation', () => {
    const visible = [
      task({ id: 'mine', assignedTo: 'hod', createdBy: 'pm' }),
      task({ id: 'created', assignedTo: 'staff', createdBy: 'hod' }),
      task({ id: 'reassigned', assignedTo: 'staff', assignedBy: 'hod', createdBy: 'pm' }),
      task({ id: 'unassigned', assignedTo: '', createdBy: 'hod' }),
      task({ id: 'oversight', assignedTo: 'staff', createdBy: 'pm' }),
    ];
    expect(getHodScopeTasks(visible, 'hod', 'mine').map(item => item.id)).toEqual(['mine']);
    expect(getHodScopeTasks(visible, 'hod', 'delegated').map(item => item.id)).toEqual(['created', 'reassigned']);
    expect(getHodScopeTasks(visible, 'hod', 'department')).toEqual(visible);
    expect(getHodScopeTasks(visible, undefined, 'delegated')).toEqual([]);
  });
});
