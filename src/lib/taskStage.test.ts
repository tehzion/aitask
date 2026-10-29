import { describe, expect, it } from 'vitest';
import type { Project, Task } from '../types';
import { countTasksByStageFilter, getTaskStage, getTaskWorkflowSteps, isTaskInStageFilter, parseTaskStageFilter } from './taskStage';
import { isTaskInListScope } from './taskListScope';

const task = (id: string, status: string, extra: Partial<Task> = {}) => ({
  id, title: id, status, isCompleted: status === 'Completed', priority: 'Medium', revisionCount: 0, updatedAt: '2026-10-01', ...extra,
} as Task);

const records = [
  task('pending', 'Pending'),
  task('revision', 'Revision'),
  task('progress', 'In Progress'),
  task('review', 'Waiting Approval'),
  task('approved', 'Approved'),
  task('completed', 'Completed'),
  task('legacy-completed', 'Approved', { isCompleted: true }),
  task('cancelled', 'Cancelled'),
];

const ids = (filter: Parameters<typeof isTaskInStageFilter>[1]) => records.filter(item => isTaskInStageFilter(item, filter)).map(item => item.id);

describe('task stages', () => {
  it('maps every lifecycle status to one display stage without changing it', () => {
    expect(records.map(item => [item.id, getTaskStage(item)])).toEqual([
      ['pending', 'todo'],
      ['revision', 'todo'],
      ['progress', 'in_progress'],
      ['review', 'review'],
      ['approved', 'review'],
      ['completed', 'completed'],
      ['legacy-completed', 'completed'],
      ['cancelled', 'cancelled'],
    ]);
    expect(records[4].status).toBe('Approved');
  });

  it('keeps Review approved out of Completed until completion is confirmed', () => {
    expect(ids('review')).toEqual(['review', 'approved']);
    expect(ids('completed')).toEqual(['completed', 'legacy-completed']);
  });

  it('matches the existing active and all list scopes exactly', () => {
    expect(ids('active')).toEqual(records.filter(item => isTaskInListScope(item, 'active')).map(item => item.id));
    expect(ids('all')).toEqual(records.map(item => item.id));
  });

  it('lists cancelled work only under All', () => {
    (['active', 'todo', 'in_progress', 'review', 'completed'] as const).forEach(filter => expect(ids(filter)).not.toContain('cancelled'));
  });

  it('counts each tab from the same rules', () => {
    expect(countTasksByStageFilter(records)).toEqual({ active: 5, todo: 2, in_progress: 1, review: 2, completed: 2, all: 8 });
  });

  it('falls back to Active for unknown tab values', () => {
    expect(parseTaskStageFilter(null)).toBe('active');
    expect(parseTaskStageFilter('Waiting Approval')).toBe('active');
    expect(parseTaskStageFilter('review')).toBe('review');
  });
});

describe('task workflow steps', () => {
  const projects = [{ id: 'reviewed', defaultApprovalMode: 'hod' }, { id: 'direct', defaultApprovalMode: 'none' }] as Project[];

  it('includes review steps when the task needs internal review', () => {
    expect(getTaskWorkflowSteps(task('a', 'In Progress'), projects)).toEqual({ steps: ['todo', 'in_progress', 'review', 'approved', 'completed'], current: 1 });
  });

  it('omits review steps when internal review is disabled', () => {
    expect(getTaskWorkflowSteps(task('a', 'Pending', { requiresInternalApproval: false }), projects)).toEqual({ steps: ['todo', 'in_progress', 'completed'], current: 0 });
    expect(getTaskWorkflowSteps(task('a', 'In Progress', { approvalMode: 'inherit', projectId: 'direct' }), projects)?.steps).toEqual(['todo', 'in_progress', 'completed']);
  });

  it('keeps a submitted task on its review step even if review was later disabled', () => {
    expect(getTaskWorkflowSteps(task('a', 'Waiting Approval', { requiresInternalApproval: false }), projects)).toEqual({ steps: ['todo', 'in_progress', 'review', 'approved', 'completed'], current: 2 });
  });

  it('never shows Review approved as finished', () => {
    const result = getTaskWorkflowSteps(task('a', 'Approved'), projects)!;
    expect(result.steps[result.current]).toBe('approved');
    expect(result.current).toBeLessThan(result.steps.length - 1);
  });

  it('has no workflow position for cancelled work', () => {
    expect(getTaskWorkflowSteps(task('a', 'Cancelled'), projects)).toBeNull();
  });
});
