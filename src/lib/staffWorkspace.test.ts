import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import { buildStaffWorkQueue, getStaffFocusTask, getStaffGuidedAction } from './staffWorkspace';

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

  it('uses the latest update—not the exact future date—after priority', () => {
    const queue = buildStaffWorkQueue([
      task({ id: 'due-sooner', dueDate: '2026-08-28', priority: 'High', updatedAt: '2026-08-20T00:00:00Z' }),
      task({ id: 'updated-later', dueDate: '2026-09-08', priority: 'High', updatedAt: '2026-08-25T00:00:00Z' }),
    ], '2026-08-26');

    expect(queue.up_next.map(item => item.id)).toEqual(['updated-later', 'due-sooner']);
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
