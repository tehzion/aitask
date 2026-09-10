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
});
