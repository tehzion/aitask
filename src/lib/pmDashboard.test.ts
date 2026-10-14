import { describe, expect, it } from 'vitest';
import { getPortfolioReviewQueues } from './pmDashboard';
import type { Task } from '../types';
const task = (id: string, status: string, visibility: Task['visibility'] = 'client-visible', clientApprovalStatus: Task['clientApprovalStatus'] = 'Pending') => ({ id, title: id, clientName: 'Company', status, visibility, clientApprovalStatus, isCompleted: status === 'Completed' } as Task);
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
