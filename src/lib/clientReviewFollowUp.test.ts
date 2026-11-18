import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import { daysWaitingForClient, getClientReviewFollowUps } from './clientReviewFollowUp';

const now = new Date('2026-11-19T12:00:00Z');
const delivery = (id: string, values: Partial<Task>): Task => ({
  id, title: id, status: 'Completed', isCompleted: true, visibility: 'client-visible', clientApprovalStatus: 'Pending',
  completedAt: '2026-11-10T00:00:00Z', ...values,
}) as unknown as Task;

describe('client review follow-up', () => {
  it('lists deliveries the client has had for three days or more, oldest first', () => {
    const list = getClientReviewFollowUps([
      delivery('fresh', { completedAt: '2026-11-18T12:00:00Z' }),
      delivery('exactly-three', { completedAt: '2026-11-16T12:00:00Z' }),
      delivery('old', { completedAt: '2026-11-01T00:00:00Z' }),
    ], now);
    expect(list.map(task => task.id)).toEqual(['old', 'exactly-three']);
  });
  it('skips accepted, internal and unfinished work', () => {
    const list = getClientReviewFollowUps([
      delivery('accepted', { clientApprovalStatus: 'Approved' }),
      delivery('internal', { visibility: 'internal' }),
      delivery('open', { status: 'In Progress', isCompleted: false }),
    ], now);
    expect(list).toEqual([]);
  });
  it('falls back to the last change when there is no completion time', () => {
    const list = getClientReviewFollowUps([delivery('no-completed-at', { completedAt: undefined, updatedAt: '2026-11-01T00:00:00Z' })], now);
    expect(list.map(task => task.id)).toEqual(['no-completed-at']);
  });
  it('counts whole days waiting', () => {
    expect(daysWaitingForClient(delivery('d', { completedAt: '2026-11-14T10:00:00Z' }), now)).toBe(5);
  });
});
