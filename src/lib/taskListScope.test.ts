import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import { isTaskInListScope, parseTaskListScope, shouldApplyTaskListScope } from './taskListScope';
import { buildStaffWorkQueue } from './staffWorkspace';

const task = (id: string, status: string, isCompleted = status === 'Completed') => ({
  id, title: id, status, isCompleted, priority: 'Medium', revisionCount: 0, updatedAt: '2026-10-01',
} as Task);

const records = [
  task('pending', 'Pending'),
  task('progress', 'In Progress'),
  task('review', 'Waiting Approval'),
  task('approved', 'Approved'),
  task('completed', 'Completed'),
  task('legacy-completed', 'Approved', true),
  task('cancelled', 'Cancelled'),
];

describe('task list scope', () => {
  it('defaults unknown values to the active scope', () => {
    expect(parseTaskListScope(null)).toBe('active');
    expect(parseTaskListScope('anything')).toBe('active');
    expect(parseTaskListScope('completed')).toBe('completed');
    expect(parseTaskListScope('all')).toBe('all');
  });

  it('keeps reviewable and approved work active and hides completed and cancelled tasks', () => {
    expect(records.filter(item => isTaskInListScope(item, 'active')).map(item => item.id))
      .toEqual(['pending', 'progress', 'review', 'approved']);
  });

  it('does not treat Approved as Completed', () => {
    expect(isTaskInListScope(task('approved', 'Approved'), 'completed')).toBe(false);
  });

  it('keeps completed history reachable, including legacy completion flags', () => {
    expect(records.filter(item => isTaskInListScope(item, 'completed')).map(item => item.id))
      .toEqual(['completed', 'legacy-completed']);
    expect(records.filter(item => isTaskInListScope(item, 'all'))).toHaveLength(records.length);
  });

  it('lets an explicit status filter or routed task bypass the default scope', () => {
    expect(shouldApplyTaskListScope({ statusFilter: 'All' })).toBe(true);
    expect(shouldApplyTaskListScope({})).toBe(true);
    expect(shouldApplyTaskListScope({ statusFilter: 'Completed' })).toBe(false);
    expect(shouldApplyTaskListScope({ taskId: 'completed' })).toBe(false);
  });

  it('filters for display only and never changes the task records', () => {
    const snapshot = structuredClone(records);
    records.forEach(item => isTaskInListScope(item, 'active'));
    expect(records).toEqual(snapshot);
  });

  it('places finished work only in the staff Done queue', () => {
    const queue = buildStaffWorkQueue(records, '2026-10-20');
    expect(queue.done.map(item => item.id).sort()).toEqual(['cancelled', 'completed', 'legacy-completed']);
    const active = [...queue.needs_action, ...queue.up_next, ...queue.waiting].map(item => item.id);
    expect(active).not.toContain('completed');
    expect(active).not.toContain('cancelled');
  });
});
