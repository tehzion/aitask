import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import { isTaskAwaitingAcceptance, resolveTaskCompletedAt } from './taskCompletion';

const state = (overrides: Partial<Pick<Task, 'isCompleted' | 'status' | 'completedAt'>> = {}) => ({
  isCompleted: false,
  status: 'In Progress',
  ...overrides,
});

describe('task completion timestamps', () => {
  it('sets the timestamp when work first becomes completed', () => {
    expect(resolveTaskCompletedAt(state(), true, '2026-07-31T03:00:00.000Z'))
      .toBe('2026-07-31T03:00:00.000Z');
  });

  it('preserves the original timestamp during unrelated completed-task edits', () => {
    expect(resolveTaskCompletedAt(state({
      isCompleted: true,
      status: 'Completed',
      completedAt: '2026-07-30T08:00:00.000Z',
    }), true, '2026-07-31T03:00:00.000Z')).toBe('2026-07-30T08:00:00.000Z');
  });

  it('keeps historical completion time unknown instead of estimating it', () => {
    expect(resolveTaskCompletedAt(state({ isCompleted: true, status: 'Completed' }), true)).toBeUndefined();
  });

  it('clears the timestamp when a task is reopened', () => {
    expect(resolveTaskCompletedAt(state({
      isCompleted: true,
      status: 'Completed',
      completedAt: '2026-07-30T08:00:00.000Z',
    }), false)).toBeUndefined();
  });
});

describe('awaiting acceptance', () => {
  const task = (status: string, acceptedBy?: string) => ({ isCompleted: false, status, assignedTo: 'staff-1', workState: acceptedBy ? { acceptedBy } : undefined }) as Pick<Task, 'isCompleted' | 'status' | 'assignedTo' | 'workState'>;

  it('counts only unstarted assignments the assignee has not accepted', () => {
    expect(isTaskAwaitingAcceptance(task('Pending'))).toBe(true);
    expect(isTaskAwaitingAcceptance(task('Pending', 'staff-1'))).toBe(false);
    expect(isTaskAwaitingAcceptance(task('In Progress'))).toBe(false);
    expect(isTaskAwaitingAcceptance(task('Waiting Approval'))).toBe(false);
    expect(isTaskAwaitingAcceptance({ ...task('Pending'), assignedTo: '' })).toBe(false);
  });
});
