import { describe, expect, it } from 'vitest';
import { assessProjectHealth, getPortfolioReviewQueues } from './pmDashboard';
import type { Project, Task } from '../types';
const task = (id: string, status: string, visibility: Task['visibility'] = 'client-visible', clientApprovalStatus: Task['clientApprovalStatus'] = 'Pending') => ({ id, title: id, clientName: 'Company', status, visibility, clientApprovalStatus, isCompleted: status === 'Completed' } as Task);
const project: Project = { id: 'project-1', clientName: 'Company', projectName: 'Launch', services: ['Design'], startDate: '2026-10-01', deadline: '2026-10-30' };
describe('PM review queues', () => {
  it('keeps a client-visible internal submission in the department queue', () => {
    const result = getPortfolioReviewQueues([task('submitted', 'Waiting Approval')]);
    expect(result.internal.map(task => task.id)).toEqual(['submitted']);
    expect(result.client).toEqual([]);
    expect(result.completion).toEqual([]);
  });
  it('includes signed work for finalization and counts overlapping acceptance only once', () => {
    const result = getPortfolioReviewQueues([task('approved', 'Approved'), task('accepted', 'Approved', 'client-visible', 'Approved'), task('internal', 'Approved', 'internal'), task('completed', 'Completed'), task('done', 'Completed', 'client-visible', 'Approved'), task('cancelled', 'Cancelled')]);
    expect(result.completion.map(task => task.id)).toEqual(['approved', 'accepted', 'internal']);
    expect(result.client.map(task => task.id)).toEqual(['approved', 'completed']);
    expect(result.waitingCount).toBe(4);
  });
});

describe('project health assessment', () => {
  const now = new Date(2026, 9, 20, 12);

  it('marks overdue work at risk and calculates task progress', () => {
    const result = assessProjectHealth(project, [
      { ...task('late', 'In Progress'), projectId: project.id, dueDate: '2026-10-19' },
      { ...task('done', 'Completed'), projectId: project.id },
      { ...task('cancelled', 'Cancelled'), projectId: project.id },
    ], now);

    expect(result).toMatchObject({
      health: 'atRisk', taskCount: 2, completedCount: 1, openCount: 1,
      overdueCount: 1, progressPercent: 50,
    });
  });

  it('marks near-term deadlines and outstanding review as attention required', () => {
    const result = assessProjectHealth(project, [
      { ...task('soon', 'In Progress'), projectId: project.id, dueDate: '2026-10-24', assignedTo: 'staff-a' },
      { ...task('review', 'Waiting Approval'), projectId: project.id, dueDate: '2026-11-10' },
    ], now);

    expect(result).toMatchObject({ health: 'attentionRequired', upcomingCount: 1, pendingApprovalCount: 1 });
    expect(result.assignedMemberIds).toEqual(['staff-a']);
  });

  it('keeps future or completed work on track', () => {
    const result = assessProjectHealth(project, [
      { ...task('later', 'In Progress'), projectId: project.id, dueDate: '2026-11-10' },
      { ...task('done', 'Completed'), projectId: project.id },
    ], now);

    expect(result.health).toBe('onTrack');
    expect(result.progressPercent).toBe(50);
    expect(result.nextDueDate).toBe('2026-10-30');
  });
});
