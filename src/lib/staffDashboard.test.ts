import { describe, expect, it } from 'vitest';
import type { ClientServicePlan, Task } from '../types';
import { getStaffDashboardMetrics } from './staffDashboard';

const today = new Date(2026, 9, 7);
const task = (changes: Partial<Task> = {}): Task => ({
  id: 'assigned', clientName: 'Acme', title: 'Assigned work', description: '', serviceType: 'Design',
  department: 'Designer', assignedTo: 'staff', createdBy: 'boss', startDate: '2026-10-01', dueDate: '2026-10-07',
  priority: 'Medium', status: 'Pending', completionPercentage: 0, isCompleted: false, revisionCount: 0,
  clientApprovalStatus: 'Pending', isRecurring: false, predecessorTaskIds: [], ...changes,
});
const plan = (changes: Partial<ClientServicePlan> = {}): ClientServicePlan => ({
  id: 'active', clientId: 'acme', clientName: 'Acme', name: 'Acme plan', revision: 1, status: 'Active',
  currency: 'MYR', origin: 'custom', serviceItems: [], discountType: 'none', discountValue: 0, taxRateBps: 0,
  startDate: '2026-10-01', billingDay: 1, contractEndDate: '2026-11-06', createdBy: 'boss', createdAt: '', updatedAt: '', ...changes,
});

describe('Staff dashboard scoped metrics', () => {
  it('counts accessible predecessors assigned to others without adding their tasks to the queue', () => {
    const assigned = task({ predecessorTaskIds: ['visible-predecessor', 'hidden'] });
    const predecessor = task({ id: 'visible-predecessor', assignedTo: 'other', createdBy: 'staff' });
    const metrics = getStaffDashboardMetrics([assigned], [assigned, predecessor], [], today);
    expect(metrics.blockedCount).toBe(1);
    expect(metrics.dueToday).toBe(1);
    expect(getStaffDashboardMetrics([assigned], [assigned], [], today).blockedCount).toBe(0);
    expect(getStaffDashboardMetrics([task({ ...assigned, status: 'Completed' })], [predecessor], [], today).blockedCount).toBe(0);
  });

  it('counts clients and plans from assigned work, excluding tasks merely created by Staff', () => {
    const assigned = task();
    const created = task({ id: 'created', assignedTo: 'other', createdBy: 'staff', clientName: 'Other company' });
    const metrics = getStaffDashboardMetrics([assigned], [assigned, created], [plan(), plan({ id: 'other', clientId: 'other', clientName: 'Other company' })], today);
    expect(metrics.assignedClientCount).toBe(1);
    expect(metrics.activePlanCount).toBe(1);
    expect(metrics.renewals).toBe(1);
  });

  it('normalizes and deduplicates company names and ignores blank names', () => {
    const metrics = getStaffDashboardMetrics([task({ clientName: ' Acme ' }), task({ id: 'same', clientName: 'acme' }), task({ id: 'blank', clientName: ' ' })], [], [plan({ clientName: 'ACME' })], today);
    expect(metrics.assignedClientCount).toBe(1);
    expect(metrics.activePlanCount).toBe(1);
  });

  it('includes today and day 30 renewals and excludes expired, day 31, invalid and absent dates', () => {
    const plans = ['2026-10-07', '2026-11-06', '2026-11-07', '2026-10-06', 'invalid', undefined]
      .map((contractEndDate, index) => plan({ id: `plan-${index}`, contractEndDate }));
    plans.push(plan({ id: 'paused', status: 'Paused' }), plan({ id: 'draft', status: 'Draft' }), plan({ id: 'outside', clientId: 'other', clientName: 'Other' }));
    const metrics = getStaffDashboardMetrics([task()], [], plans, today);
    expect(metrics.renewals).toBe(2);
    expect(metrics.activePlanCount).toBe(6);
  });

  it('keeps the 30-day boundary independent of local time of day', () => {
    for (const hour of [0, 12, 23]) {
      expect(getStaffDashboardMetrics([task()], [], [plan()], new Date(2026, 9, 7, hour, 30)).renewals).toBe(1);
    }
  });

  it('excludes completed and cancelled work from open metrics and counts unique historical output links', () => {
    const tasks = [
      task({ revisionCount: 1, deliverableId: 'one' }),
      task({ id: 'waiting', status: 'Waiting Approval', deliverableId: 'two' }),
      task({ id: 'completed', status: 'Completed', isCompleted: false, revisionCount: 10, deliverableId: 'one' }),
      task({ id: 'flag', status: 'Pending', isCompleted: true, revisionCount: 10 }),
      task({ id: 'cancelled', status: 'Cancelled', revisionCount: 10, deliverableId: 'cancelled-output' }),
    ];
    expect(getStaffDashboardMetrics(tasks, tasks, [], today)).toMatchObject({ dueToday: 2, waitingReview: 1, revisions: 1, linkedOutputs: 2 });
  });

  it('recomputes date-sensitive metrics when the local day changes', () => {
    const tasks = [task(), task({ id: 'waiting', status: 'Waiting Approval' }), task({ id: 'tomorrow', dueDate: '2026-10-08' })];
    expect(getStaffDashboardMetrics(tasks, tasks, [], today).dueToday).toBe(2);
    expect(getStaffDashboardMetrics(tasks, tasks, [], new Date(2026, 9, 8)).dueToday).toBe(1);
  });

  it('matches plans and renewals by ID despite stale names after a rename', () => {
    const metrics = getStaffDashboardMetrics([task({ clientId: 'acme', clientName: 'Old Acme' })], [], [plan()], today);
    expect(metrics).toMatchObject({ assignedClientCount: 1, activePlanCount: 1, renewals: 1 });
  });

  it('counts one company for the same ID under different names, including a blank name', () => {
    const tasks = [task({ clientId: 'acme' }), task({ id: 'old', clientId: 'acme', clientName: 'Old Acme' }), task({ id: 'blank', clientId: 'acme', clientName: '' })];
    expect(getStaffDashboardMetrics(tasks, tasks, [plan()], today)).toMatchObject({ assignedClientCount: 1, activePlanCount: 1 });
  });

  it('keeps distinct IDs separate even when their names are identical', () => {
    const assigned = task({ clientId: 'company-a' });
    expect(getStaffDashboardMetrics([assigned], [], [plan({ clientId: 'company-b' })], today))
      .toMatchObject({ assignedClientCount: 1, activePlanCount: 0, renewals: 0 });
    expect(getStaffDashboardMetrics([assigned, task({ id: 'second', clientId: 'company-b' })], [], [], today).assignedClientCount).toBe(2);
  });

  it('deduplicates legacy names with a uniquely identified company', () => {
    const tasks = [task(), task({ id: 'identified', clientId: 'acme', clientName: ' ACME ' })];
    expect(getStaffDashboardMetrics(tasks, tasks, [plan()], today)).toMatchObject({ assignedClientCount: 1, activePlanCount: 1 });
  });

  it('uses canonical profiles to connect legacy names to plans with stale names', () => {
    expect(getStaffDashboardMetrics([task()], [], [plan({ clientName: 'Old Acme' })], today, [{ id: 'acme', clientName: 'Acme' }]))
      .toMatchObject({ assignedClientCount: 1, activePlanCount: 1, renewals: 1 });
  });

  it('does not infer an ID from an ambiguous legacy company name', () => {
    const clients = [{ id: 'acme', clientName: 'Acme' }, { id: 'other', clientName: ' ACME ' }];
    expect(getStaffDashboardMetrics([task()], [], [plan()], today, clients))
      .toMatchObject({ assignedClientCount: 1, activePlanCount: 0, renewals: 0 });
    expect(getStaffDashboardMetrics([task()], [], [plan({ clientId: '' })], today, clients).activePlanCount).toBe(0);
  });

  it('counts tasks with unavailable dependencies separately from confirmed blockers', () => {
    const assigned = task({ predecessorTaskIds: ['hidden', 'hidden', 'visible'] });
    const predecessor = task({ id: 'visible', assignedTo: 'other' });
    const completed = task({ id: 'completed', status: 'Completed', predecessorTaskIds: ['hidden'] });
    const cancelled = task({ id: 'cancelled', status: 'Cancelled', predecessorTaskIds: ['hidden'] });
    const tasks = [assigned, completed, cancelled];
    expect(getStaffDashboardMetrics(tasks, [...tasks, predecessor], [], today))
      .toMatchObject({ unavailableDependencyTaskCount: 1, blockedCount: 1 });
    expect(getStaffDashboardMetrics(tasks, tasks, [], today))
      .toMatchObject({ unavailableDependencyTaskCount: 1, blockedCount: 0 });
    expect(getStaffDashboardMetrics([predecessor], [predecessor], [], today).unavailableDependencyTaskCount).toBe(0);
  });
});
