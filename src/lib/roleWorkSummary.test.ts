import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import { getRoleWorkSummary } from './roleWorkSummary';

const task = (id: string, extra: Partial<Task> = {}) => ({ id, title: id, status: 'Pending', isCompleted: false, revisionCount: 0, ...extra } as Task);
const now = new Date(2026, 10, 9, 15, 0);

describe('team feedback F5: one work summary for every role', () => {
  const tasks = [
    task('late', { dueDate: '2026-11-08' }),
    task('today', { dueDate: '2026-11-09' }),
    task('later', { dueDate: '2026-11-20' }),
    task('review', { status: 'Waiting Approval', dueDate: '2026-11-01' }),
    task('approved', { status: 'Approved' }),
    task('done', { status: 'Completed', isCompleted: true, dueDate: '2026-11-01', clientApprovalStatus: 'Approved' }),
    task('cancelled', { status: 'Cancelled', dueDate: '2026-11-01' }),
  ];
  const summary = getRoleWorkSummary(tasks, now);

  it('counts open work without closed or cancelled tasks', () => {
    expect(summary.open.map(item => item.id)).toEqual(['late', 'today', 'later', 'review', 'approved']);
  });

  it('treats due today as due, not overdue', () => {
    expect(summary.overdue.map(item => item.id)).toEqual(['late', 'review']);
    expect(summary.dueToday.map(item => item.id)).toEqual(['today']);
  });

  it('counts review queues the same way the PM portfolio does', () => {
    expect(summary.waitingReviewCount).toBe(2);
    expect(summary.done.map(item => item.id)).toEqual(['done']);
  });
});
