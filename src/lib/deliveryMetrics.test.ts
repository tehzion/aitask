import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import { computeDeliveryMetrics, computePersonDeliveryMetrics, onTimeRate } from './deliveryMetrics';

const now = new Date('2026-11-19T12:00:00');
const done = (id: string, values: Partial<Task>): Task => ({
  id, title: id, status: 'Completed', isCompleted: true, revisionCount: 0, assignedTo: 'a',
  completedAt: '2026-11-10T09:00:00', dueDate: '2026-11-10', ...values,
}) as unknown as Task;

describe('delivery metrics', () => {
  it('counts a task finished on its due date as on time and a later one as late', () => {
    const metrics = computeDeliveryMetrics([
      done('on-time', { completedAt: '2026-11-10T23:00:00' }),
      done('late', { completedAt: '2026-11-11T08:00:00' }),
      done('no-due', { dueDate: '' }),
    ], now);
    expect(metrics).toMatchObject({ completed: 3, withDueDate: 2, onTime: 1 });
    expect(onTimeRate(metrics)).toBe(50);
  });
  it('ignores unfinished, cancelled and out-of-period work', () => {
    const metrics = computeDeliveryMetrics([
      done('open', { status: 'In Progress', isCompleted: false }),
      done('cancelled', { status: 'Cancelled', isCompleted: false }),
      done('old', { completedAt: '2026-01-01T00:00:00' }),
      done('future', { completedAt: '2027-01-01T00:00:00' }),
    ], now);
    expect(metrics.completed).toBe(0);
    expect(onTimeRate(metrics)).toBeUndefined();
  });
  it('reports revision rate and average rounds', () => {
    const metrics = computeDeliveryMetrics([done('r0', {}), done('r2', { revisionCount: 2 }), done('r1', { revisionCount: 1 }), done('r0b', {})], now);
    expect(metrics.revisionRate).toBe(50);
    expect(metrics.averageRevisions).toBe(0.8);
  });
  it('uses the median hours between assignment and acceptance', () => {
    const accepted = (assignedAt: string, acceptedAt: string) => ({ assignedAt, workState: { acceptedAt } }) as Partial<Task>;
    const metrics = computeDeliveryMetrics([
      done('fast', accepted('2026-11-09T09:00:00', '2026-11-09T10:00:00')),
      done('slow', accepted('2026-11-09T09:00:00', '2026-11-09T21:00:00')),
      done('mid', accepted('2026-11-09T09:00:00', '2026-11-09T12:00:00')),
      done('never', {}),
    ], now);
    expect(metrics.medianAcceptanceHours).toBe(3);
  });
  it('averages client ratings only over rated deliveries', () => {
    const rated = (stars: 1 | 2 | 3 | 4 | 5) => ({ clientRating: { stars, ratedBy: 'pm', ratedAt: '2026-11-11T00:00:00.000Z' } }) as Partial<Task>;
    const metrics = computeDeliveryMetrics([done('a', rated(5)), done('b', rated(4)), done('c', {})], now);
    expect(metrics).toMatchObject({ ratedCount: 2, averageRating: 4.5 });
  });
  it('groups by assignee, busiest first', () => {
    const rows = computePersonDeliveryMetrics([done('1', { assignedTo: 'x' }), done('2', { assignedTo: 'y' }), done('3', { assignedTo: 'y' }), done('4', { assignedTo: '' })], now);
    expect(rows.map(row => [row.userId, row.completed])).toEqual([['y', 2], ['x', 1]]);
  });
});
