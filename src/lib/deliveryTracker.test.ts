import { describe, expect, it } from 'vitest';
import type { Deliverable, ServiceCycle, Task, User } from '../types';
import {
  buildClientDeliverySummaries,
  getDeliveryPeriodRange,
  moveDeliveryPeriod,
  taskAppearsInDeliveryPeriod,
} from './deliveryTracker';

const task = (data: Partial<Task> & Pick<Task, 'id' | 'clientName'>): Task => ({
  id: data.id,
  clientName: data.clientName,
  serviceType: 'Design',
  title: data.id,
  description: '',
  department: 'Designer',
  assignedTo: 'staff-1',
  createdBy: 'boss',
  startDate: '2026-09-01',
  dueDate: '2026-09-09',
  priority: 'Medium',
  status: 'Pending',
  completionPercentage: 0,
  isCompleted: false,
  revisionCount: 0,
  clientApprovalStatus: 'Pending',
  isRecurring: false,
  ...data,
});
const cycle: ServiceCycle = {
  id: 'cycle-1', clientId: 'client-1', clientName: 'Acme', planId: 'plan-1', planRevision: 1,
  periodStart: '2026-09-01', periodEnd: '2026-09-30', status: 'Published', currency: 'MYR',
  serviceItems: [], addonSnapshots: [], discountType: 'none', discountValue: 0, taxRateBps: 0,
  createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
};

const deliverable = (data: Partial<Deliverable> & Pick<Deliverable, 'id'>): Deliverable => ({
  id: data.id, clientId: 'client-1', clientName: 'Acme', planId: 'plan-1', cycleId: cycle.id,
  serviceItemId: 'service-1', sequence: 1, title: data.id, status: 'Planned', taskIds: [], attachments: [],
  createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
  ...data,
});

const users: User[] = [{
  id: 'staff-1', name: 'Staff One', role: 'Staff', departments: ['Designer'], department: 'Designer',
}];

describe('delivery tracker periods', () => {
  it('uses Monday through Sunday and moves one whole period', () => {
    const range = getDeliveryPeriodRange('week', new Date(2026, 8, 10, 12));
    expect(range.start.getDay()).toBe(1);
    expect(range.end.getDay()).toBe(0);
    expect(moveDeliveryPeriod('week', range.start, 1).getDate()).toBe(14);
  });

  it('includes due and completed work and carries open overdue work forward', () => {
    const range = getDeliveryPeriodRange('week', new Date(2026, 8, 10, 12));
    expect(taskAppearsInDeliveryPeriod(task({ id: 'due', clientName: 'Acme', dueDate: '2026-09-09' }), range, new Date(2026, 8, 10))).toBe(true);
    expect(taskAppearsInDeliveryPeriod(task({ id: 'done', clientName: 'Acme', dueDate: '2026-08-01', completedAt: '2026-09-10T08:00:00.000Z', isCompleted: true, status: 'Completed' }), range)).toBe(true);
    expect(taskAppearsInDeliveryPeriod(task({ id: 'overdue', clientName: 'Acme', dueDate: '2026-09-01' }), range, new Date(2026, 8, 10))).toBe(true);
  });

  it('keeps no-deadline work in its start period and the active period only', () => {
    const startedRange = getDeliveryPeriodRange('week', new Date(2026, 8, 10, 12));
    const laterRange = getDeliveryPeriodRange('week', new Date(2026, 8, 17, 12));
    const earlierRange = getDeliveryPeriodRange('week', new Date(2026, 7, 12, 12));
    const started = task({ id: 'no-deadline-started', clientName: 'Acme', startDate: '2026-09-08', dueDate: '' });
    const noStart = task({ id: 'no-deadline-no-start', clientName: 'Acme', startDate: '', dueDate: '' });
    const today = new Date(2026, 8, 10);

    expect(taskAppearsInDeliveryPeriod(started, startedRange, today)).toBe(true);
    expect(taskAppearsInDeliveryPeriod(noStart, startedRange, today)).toBe(true);
    expect(taskAppearsInDeliveryPeriod(started, laterRange, today)).toBe(false);
    expect(taskAppearsInDeliveryPeriod(noStart, laterRange, today)).toBe(false);
    expect(taskAppearsInDeliveryPeriod(noStart, earlierRange, today)).toBe(false);
  });

  it('summarizes monthly cycle deliverables and task status per client', () => {
    const range = getDeliveryPeriodRange('month', new Date(2026, 8, 10, 12));
    const summaries = buildClientDeliverySummaries({
      clientNames: ['Acme'],
      tasks: [
        task({ id: 'open', clientName: 'Acme', dueDate: '2026-09-12', status: 'In Progress' }),
        task({ id: 'done', clientName: 'Acme', dueDate: '2026-09-08', completedAt: '2026-09-08T08:00:00.000Z', isCompleted: true, status: 'Completed' }),
      ],
      deliverables: [
        deliverable({ id: 'delivered', status: 'Delivered', deliveredAt: '2026-09-08T08:00:00.000Z' }),
        deliverable({ id: 'planned', sequence: 2 }),
      ],
      cycles: [cycle],
      users,
      period: 'month',
      range,
      today: new Date(2026, 8, 10),
    });

    expect(summaries[0]).toMatchObject({ open: 1, inProgress: 1, completed: 1, included: 2, delivered: 1, remaining: 1, progress: 50 });
    expect(summaries[0].assigneeIds).toEqual(['staff-1']);
  });

  it('keeps uncoupled monthly deliverables and ignores malformed legacy fields', () => {
    const range = getDeliveryPeriodRange('month', new Date(2026, 8, 10, 12));
    const summaries = buildClientDeliverySummaries({
      clientNames: ['Acme'],
      tasks: [
        task({ id: 'linked', clientName: 'Acme', dueDate: '2026-09-11' }),
        task({ id: 'legacy-null-client', clientName: null as unknown as string, dueDate: '' }),
        task({ id: 'late-lexical', clientName: 'Acme', dueDate: '2026-09-02T23:00:00-10:00' }),
        task({ id: 'early-timestamp', clientName: 'Acme', dueDate: '2026-09-03T01:00:00+08:00' }),
        task({ id: 'invalid-deadline', clientName: 'Acme', dueDate: 'not-a-date' }),
      ],
      deliverables: [
        deliverable({ id: 'uncoupled', cycleId: '' as never, taskIds: ['linked'] }),
        deliverable({ id: 'legacy-null-fields', clientName: null as unknown as string, taskIds: null as unknown as string[] }),
      ],
      cycles: [],
      users,
      period: 'month',
      range,
      today: new Date(2026, 8, 10),
    });

    expect(summaries[0]).toMatchObject({ included: 1, remaining: 1, nextDeadline: '2026-09-03T01:00:00+08:00' });
  });

  it('falls back to delivery evidence when a legacy monthly cycle link is stale', () => {
    const range = getDeliveryPeriodRange('month', new Date(2026, 8, 10, 12));
    const summaries = buildClientDeliverySummaries({
      clientNames: ['Acme'],
      tasks: [],
      deliverables: [
        deliverable({
          id: 'stale-cycle',
          cycleId: 'missing-cycle',
          status: 'Delivered',
          deliveredAt: '2026-09-08T08:00:00.000Z',
        }),
      ],
      cycles: [],
      users,
      period: 'month',
      range,
      today: new Date(2026, 8, 10),
    });

    expect(summaries[0]).toMatchObject({ included: 1, delivered: 1, remaining: 0, progress: 100 });
  });
});
