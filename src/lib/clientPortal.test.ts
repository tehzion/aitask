import { describe, expect, it } from 'vitest';
import type { ClientServicePlan, ServiceCycle, Task } from '../types';
import {
  getClientCurrentCycle,
  getClientApprovalDate,
  getClientServicePlan,
  getClientDeliveryStage,
  getClientDeliveryStageLabel,
  getClientDeliveryStageTone,
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
  it('does not classify malformed dates as overdue', () => {
    const today = new Date(2026, 9, 7);
    expect(getClientDeliveryStage(makeTask({ dueDate: '0000-invalid' }), today)).toBe('in_delivery');
    expect(getClientDeliveryStage(makeTask({ dueDate: '2026-10-99' }), today)).toBe('in_delivery');
  });

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

  it('uses client-stage colors for tracker badges', () => {
    const now = new Date(2026, 7, 10, 12);
    expect(getClientDeliveryStageTone(makeTask({ status: 'Completed', isCompleted: true }), now)).toBe('amber');
    expect(getClientDeliveryStageTone(makeTask({ clientApprovalStatus: 'Approved' }), now)).toBe('emerald');
    expect(getClientDeliveryStageTone(makeTask({ status: 'Pending', dueDate: '2026-08-12' }), now)).toBe('slate');
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

const makeCycle = (overrides: Partial<ServiceCycle> = {}): ServiceCycle => ({
  id: 'current', clientId: 'acme', clientName: 'Acme', planId: 'plan',
  planRevision: 1, periodStart: '2026-10-01', periodEnd: '2026-10-31',
  status: 'Published', currency: 'MYR', serviceItems: [], addonSnapshots: [],
  discountType: 'none', discountValue: 0, taxRateBps: 0,
  createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
  ...overrides,
});

describe('Client current delivery period', () => {
  const now = new Date(2026, 9, 2, 12);
  const current = makeCycle();
  const past = makeCycle({ id: 'past', periodStart: '2026-09-01', periodEnd: '2026-09-30', status: 'Completed' });
  const next = makeCycle({ id: 'next', periodStart: '2026-11-01', periodEnd: '2026-11-30' });
  const later = makeCycle({ id: 'later', periodStart: '2026-12-01', periodEnd: '2026-12-31' });

  it('keeps the current period visible when future periods are published', () => {
    expect(getClientCurrentCycle([next, past, current, later], 'acme', now)?.id).toBe('current');
    expect(getClientCurrentCycle([current, next], 'acme', new Date(2026, 9, 31, 23))?.id).toBe('current');
  });

  it('falls back to the latest past period or earliest upcoming period', () => {
    expect(getClientCurrentCycle([next, past, later], 'acme', now)?.id).toBe('past');
    expect(getClientCurrentCycle([later, next], 'acme', now)?.id).toBe('next');
  });

  it('excludes foreign, unpublished, cancelled, and malformed periods', () => {
    const hidden = [
      makeCycle({ clientId: 'foreign' }),
      makeCycle({ status: 'Draft' }),
      makeCycle({ status: 'Cancelled' }),
      makeCycle({ periodStart: 'invalid' }),
      makeCycle({ periodEnd: 'invalid' }),
      makeCycle({ periodEnd: '2026-09-30' }),
    ];
    expect(getClientCurrentCycle(hidden, 'acme', now)).toBeUndefined();
    expect(getClientCurrentCycle([current], undefined, now)).toBeUndefined();
  });
});

describe('Client service scope updates', () => {
  const plan: ClientServicePlan = {
    id: 'old', clientId: 'acme', clientName: 'Acme', name: 'Scope', origin: 'custom',
    revision: 1, status: 'Active', currency: 'MYR', serviceItems: [],
    discountType: 'none', discountValue: 0, taxRateBps: 0, startDate: '2026-10-01',
    billingDay: 1, createdBy: 'pm', createdAt: '2026-10-01', updatedAt: '2026-10-01',
  };
  it('shows the latest published plan revision regardless of record order', () => {
    const latest = { ...plan, id: 'latest', revision: 2, status: 'Paused' as const };
    expect(getClientServicePlan([plan, latest, { ...plan, id: 'draft', revision: 3, status: 'Draft' }], 'acme')?.id).toBe('latest');
    expect(getClientServicePlan([latest, plan], 'acme')?.id).toBe('latest');
  });
  it('excludes other companies and ended plans', () => {
    expect(getClientServicePlan([{ ...plan, clientId: 'other' }, { ...plan, status: 'Ended' }], 'acme')).toBeUndefined();
    expect(getClientServicePlan([plan], undefined)).toBeUndefined();
  });
});

describe('recorded client approval timing', () => {
  it('uses the newest valid approval event rather than task update or completion time', () => {
    const approved = makeTask({ clientApprovalStatus: 'Approved', completedAt: '2026-10-01', updatedAt: '2026-10-05',
      approvalHistory: [
        { id: 'new', userId: 'client', status: 'Approved', createdAt: '2026-10-03T12:00:00Z' },
        { id: 'old', userId: 'client', status: 'Approved', createdAt: '2026-10-02T12:00:00Z' },
        { id: 'invalid', userId: 'client', status: 'Approved', createdAt: 'invalid' },
      ] });
    expect(getClientApprovalDate(approved)?.toISOString()).toBe('2026-10-03T12:00:00.000Z');
  });
  it('keeps missing history unknown and does not reuse approval from a reopened delivery', () => {
    expect(getClientApprovalDate(makeTask({ clientApprovalStatus: 'Approved' }))).toBeNull();
    expect(getClientApprovalDate(makeTask({ clientApprovalStatus: 'Rejected', approvalHistory: [
      { id: 'old', userId: 'client', status: 'Approved', createdAt: '2026-10-02T12:00:00Z' },
    ] }))).toBeNull();
  });
});
