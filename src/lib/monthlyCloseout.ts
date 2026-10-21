import type { Deliverable, ServiceCycle, Task } from '../types';
import { isTaskOpen, isTaskOverdue } from './taskReporting';

export interface MonthlyCycleCloseout {
  deliverables: number;
  delivered: number;
  inProgress: number;
  planned: number;
  openTasks: number;
  overdueTasks: number;
  waitingApproval: number;
  completionPercent: number;
  isReadyToClose: boolean;
}

/**
 * Summarises one cycle without mutating any of its historical records. Tasks
 * are scoped by cycle first, then by linked deliverable as a defensive
 * fallback for legacy rows that predate serviceCycleId.
 */
export const getMonthlyCycleCloseout = (
  cycle: Pick<ServiceCycle, 'id'>,
  deliverables: readonly Deliverable[],
  tasks: readonly Task[],
  today: Date,
): MonthlyCycleCloseout => {
  const cycleDeliverables = deliverables.filter(item => item.cycleId === cycle.id);
  const cycleDeliverableIds = new Set(cycleDeliverables.map(item => item.id));
  const cycleTasks = tasks.filter(task => task.serviceCycleId === cycle.id
    || (task.deliverableId ? cycleDeliverableIds.has(task.deliverableId) : false));
  const delivered = cycleDeliverables.filter(item => item.status === 'Delivered').length;
  const inProgress = cycleDeliverables.filter(item => item.status === 'In Progress' || item.status === 'Ready').length;
  const planned = cycleDeliverables.filter(item => item.status === 'Planned').length;
  const open = cycleTasks.filter(isTaskOpen);
  const overdueTasks = open.filter(task => isTaskOverdue(task, today)).length;
  const waitingApproval = open.filter(task => task.status === 'Waiting Approval').length;
  const completionPercent = cycleDeliverables.length === 0
    ? 0
    : Math.round((delivered / cycleDeliverables.length) * 100);
  return {
    deliverables: cycleDeliverables.length,
    delivered,
    inProgress,
    planned,
    openTasks: open.length,
    overdueTasks,
    waitingApproval,
    completionPercent,
    isReadyToClose: cycleDeliverables.length > 0 && delivered === cycleDeliverables.length && open.length === 0,
  };
};
