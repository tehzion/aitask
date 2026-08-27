import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import {
  getClientDeliveryStage,
  getClientDeliveryStageLabel,
  getClientFocusTask,
  getClientLatestUpdates,
  getClientProgress,
  getClientReviewReadyTasks,
  getClientTaskStage,
  getClientUpcomingDeliveries,
  groupClientDeliveries,
} from './clientPortal';

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1',
  clientName: 'Acme',
  serviceType: 'Design',
  title: 'Campaign artwork',
  description: '',
  department: 'Client',
  assignedTo: 'staff-1',
  createdBy: 'client-portal',
  startDate: '2026-08-01',
  dueDate: '2026-08-08',
  priority: 'Medium',
  status: 'In Progress',
  completionPercentage: 50,
  isCompleted: false,
  revisionCount: 0,
  clientApprovalStatus: 'Pending',
  isRecurring: false,
  updatedAt: '2026-08-01T10:00:00.000Z',
  ...overrides,
});

describe('Client portal reporting', () => {
  it('treats completed but unapproved work as awaiting review', () => {
    const task = makeTask({ status: 'Completed', isCompleted: true, clientApprovalStatus: 'Pending' });
    expect(getClientTaskStage(task)).toBe('awaiting_review');
  });

  it('counts only client-approved work as approved', () => {
    const tasks = [
      makeTask({ id: 'active' }),
      makeTask({ id: 'review', status: 'Waiting Approval' }),
      makeTask({ id: 'completed', status: 'Completed', isCompleted: true }),
      makeTask({ id: 'approved', status: 'Completed', isCompleted: true, clientApprovalStatus: 'Approved' }),
      makeTask({ id: 'cancelled', status: 'Cancelled' }),
    ];

    expect(getClientProgress(tasks)).toEqual({ active: 1, awaitingReview: 2, approved: 1, cancelled: 1, total: 4 });
  });

  it('orders review-ready work by due date and keeps missing dates last', () => {
    const tasks = [
      makeTask({ id: 'missing', status: 'Waiting Approval', dueDate: '' }),
      makeTask({ id: 'later', status: 'Completed', isCompleted: true, dueDate: '2026-08-10' }),
      makeTask({ id: 'first', status: 'Waiting Approval', dueDate: '2026-08-04' }),
    ];

    expect(getClientReviewReadyTasks(tasks).map(task => task.id)).toEqual(['first', 'later', 'missing']);
  });

  it('orders active deliveries by due date and excludes approved, review, cancelled, and undated work', () => {
    const tasks = [
      makeTask({ id: 'later', dueDate: '2026-08-10' }),
      makeTask({ id: 'first', dueDate: '2026-08-04' }),
      makeTask({ id: 'undated', dueDate: '' }),
      makeTask({ id: 'review', dueDate: '2026-08-03', status: 'Waiting Approval' }),
      makeTask({ id: 'approved', dueDate: '2026-08-02', clientApprovalStatus: 'Approved' }),
      makeTask({ id: 'cancelled', dueDate: '2026-08-01', status: 'Cancelled' }),
    ];

    expect(getClientUpcomingDeliveries(tasks).map(task => task.id)).toEqual(['first', 'later']);
  });

  it('sorts latest updates by the server timestamp and ignores malformed values', () => {
    const tasks = [
      makeTask({ id: 'older', updatedAt: '2026-08-01T09:00:00.000Z' }),
      makeTask({ id: 'invalid', updatedAt: 'not-a-date' }),
      makeTask({ id: 'newer', updatedAt: '2026-08-01T11:00:00.000Z' }),
    ];

    expect(getClientLatestUpdates(tasks).map(task => task.id)).toEqual(['newer', 'older']);
  });

  it('derives client delivery stages without exposing internal task statuses', () => {
    const now = new Date(2026, 7, 10, 12);
    expect(getClientDeliveryStage(makeTask({ status: 'Waiting Approval' }), now)).toBe('needs_review');
    expect(getClientDeliveryStage(makeTask({ status: 'In Progress' }), now)).toBe('timing_changed');
    expect(getClientDeliveryStage(makeTask({ status: 'In Progress', dueDate: '2026-08-12' }), now)).toBe('in_delivery');
    expect(getClientDeliveryStage(makeTask({ status: 'Pending', dueDate: '2026-08-12' }), now)).toBe('scheduled');
    expect(getClientDeliveryStage(makeTask({ clientApprovalStatus: 'Approved' }), now)).toBe('delivered');
    expect(getClientDeliveryStage(makeTask({ status: 'Cancelled' }), now)).toBe('cancelled');
    expect(getClientDeliveryStageLabel(makeTask({ status: 'Custom production', dueDate: '2026-08-12' }), now)).toBe('In delivery');
  });

  it('selects review work before the earliest expected delivery and breaks ties by update time', () => {
    const now = new Date(2026, 7, 1, 12);
    const tasks = [
      makeTask({ id: 'delivery', dueDate: '2026-08-02' }),
      makeTask({ id: 'review-older', status: 'Waiting Approval', dueDate: '2026-08-05', updatedAt: '2026-08-01T09:00:00.000Z' }),
      makeTask({ id: 'review-newer', status: 'Waiting Approval', dueDate: '2026-08-05', updatedAt: '2026-08-01T11:00:00.000Z' }),
    ];
    expect(getClientFocusTask(tasks, now)?.id).toBe('review-newer');
    expect(getClientFocusTask(tasks.filter(task => task.status !== 'Waiting Approval'), now)?.id).toBe('delivery');
  });

  it('groups timing changes separately from scheduled and active delivery work', () => {
    const now = new Date(2026, 7, 10, 12);
    const groups = groupClientDeliveries([
      makeTask({ id: 'late', dueDate: '2026-08-09' }),
      makeTask({ id: 'active', dueDate: '2026-08-11' }),
      makeTask({ id: 'scheduled', status: 'Pending', dueDate: '2026-08-12' }),
    ], now);
    expect(groups.timing_changed.map(task => task.id)).toEqual(['late']);
    expect(groups.in_delivery.map(task => task.id)).toEqual(['active']);
    expect(groups.scheduled.map(task => task.id)).toEqual(['scheduled']);
  });
});
