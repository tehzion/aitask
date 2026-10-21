import { describe, expect, it } from 'vitest';
import type { Deliverable, ServiceCycle, Task } from '../types';
import { getMonthlyCycleCloseout } from './monthlyCloseout';

const cycle: ServiceCycle = {
  id: 'cycle-oct', clientId: 'client-1', clientName: 'Acme', planId: 'plan-1', planRevision: 1,
  periodStart: '2026-10-01', periodEnd: '2026-10-31', status: 'Published', currency: 'MYR',
  serviceItems: [], addonSnapshots: [], discountType: 'none', discountValue: 0, taxRateBps: 0,
  createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
};
const deliverable = (id: string, status: Deliverable['status']): Deliverable => ({
  id, clientId: 'client-1', clientName: 'Acme', planId: 'plan-1', cycleId: cycle.id,
  serviceItemId: 'service-1', sequence: 1, title: id, status, taskIds: [], attachments: [],
  createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
});
const task = (id: string, dueDate: string, status: Task['status'] = 'Pending'): Task => ({
  id, serviceCycleId: cycle.id, clientId: 'client-1', clientName: 'Acme', serviceType: 'Social Media',
  title: id, description: '', department: 'Operation', assignedTo: '', createdBy: 'pm',
  startDate: '2026-10-01', dueDate, priority: 'Medium', status, completionPercentage: 0,
  isCompleted: false, revisionCount: 0, clientApprovalStatus: 'Pending', isRecurring: false,
});

describe('monthly cycle closeout', () => {
  it('keeps delivery progress and unresolved task signals separate', () => {
    const result = getMonthlyCycleCloseout(
      cycle,
      [deliverable('delivered', 'Delivered'), deliverable('active', 'In Progress'), deliverable('planned', 'Planned')],
      [task('late', '2026-10-10'), task('review', '2026-10-31', 'Waiting Approval')],
      new Date('2026-10-21T12:00:00.000Z'),
    );
    expect(result).toMatchObject({
      deliverables: 3, delivered: 1, inProgress: 1, planned: 1,
      openTasks: 2, overdueTasks: 1, waitingApproval: 1, completionPercent: 33,
      isReadyToClose: false,
    });
  });

  it('only reports ready when every delivery is complete and no task remains open', () => {
    const result = getMonthlyCycleCloseout(
      cycle,
      [deliverable('one', 'Delivered')],
      [task('done', '2026-10-10', 'Completed')],
      new Date('2026-10-21T12:00:00.000Z'),
    );
    expect(result.isReadyToClose).toBe(true);
  });
});
