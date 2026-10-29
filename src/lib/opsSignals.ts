import { differenceInCalendarDays } from 'date-fns/differenceInCalendarDays';
import { endOfDay } from 'date-fns/endOfDay';
import type { Addon, ClientServicePlan, Deliverable, Project, ServiceCycle, Task, User } from '../types';
import { parseOptionalDate } from './utils';
import { isTaskOpen } from './taskCompletion';
import { projectStatus } from './projectManagement';

/** Open work that has stalled: long overdue, or with nobody responsible yet. */
export const getStuckWork = (tasks: readonly Task[], today: Date, overdueDays = 7) => {
  const open = tasks.filter(isTaskOpen);
  const overdueLong = open
    .filter(task => {
      const due = parseOptionalDate(task.dueDate);
      return Boolean(due && differenceInCalendarDays(today, due) > overdueDays);
    })
    .sort((left, right) => (left.dueDate || '').localeCompare(right.dueDate || ''));
  const unassigned = open.filter(task => !task.assignedTo);
  return { overdueLong, unassigned };
};

export type CyclePace = 'done' | 'onTrack' | 'atRisk' | 'missed';

/**
 * Compares confirmed deliveries with how much of the cycle has passed, so a
 * month can be flagged while there is still time to recover.
 */
export const getCyclePace = (
  cycle: Pick<ServiceCycle, 'periodStart' | 'periodEnd'>,
  delivered: number,
  total: number,
  today: Date,
): CyclePace | undefined => {
  const start = parseOptionalDate(cycle.periodStart);
  const end = parseOptionalDate(cycle.periodEnd);
  if (!start || !end || total <= 0) return undefined;
  if (delivered >= total) return 'done';
  if (today > endOfDay(end)) return 'missed';
  const length = Math.max(1, differenceInCalendarDays(end, start) + 1);
  const elapsed = Math.min(1, Math.max(0, (differenceInCalendarDays(today, start) + 1) / length));
  // Behind by more than a quarter of the month's work once half of it has passed.
  return elapsed >= 0.5 && delivered / total < elapsed - 0.25 ? 'atRisk' : 'onTrack';
};

/** One-off add-ons in a cycle are the extra requests made outside the plan. */
export const getCycleExtras = (addons: readonly Addon[], cycleId: string) => {
  const extras = addons.filter(addon => addon.isActive && addon.billingMode === 'one_off' && addon.targetCycleId === cycleId);
  const billable = extras.filter(addon => addon.unitPriceMinor > 0);
  return {
    extras,
    free: extras.length - billable.length,
    billable: billable.length,
    billableMinor: billable.reduce((sum, addon) => sum + addon.unitPriceMinor * addon.quantity, 0),
  };
};

export type RenewalSignals = {
  cyclesReviewed: number;
  deliverables: number;
  onTimeRate?: number;
  revisionRate?: number;
  extras: number;
  suggestUpgrade: boolean;
};

/** Delivery record over the plan's last three cycles, for a renewal conversation. */
export const getRenewalSignals = (
  plan: Pick<ClientServicePlan, 'id' | 'clientId'>,
  cycles: readonly ServiceCycle[],
  deliverables: readonly Deliverable[],
  addons: readonly Addon[],
  tasks: readonly Task[],
  recentCycles = 3,
): RenewalSignals => {
  const recent = cycles
    .filter(cycle => cycle.planId === plan.id && cycle.clientId === plan.clientId && (cycle.status === 'Published' || cycle.status === 'Completed'))
    .sort((left, right) => right.periodStart.localeCompare(left.periodStart))
    .slice(0, recentCycles);
  const cycleIds = new Set(recent.map(cycle => cycle.id));
  const cycleEnd = new Map(recent.map(cycle => [cycle.id, parseOptionalDate(cycle.periodEnd)]));
  const due = deliverables.filter(item => cycleIds.has(item.cycleId) && item.clientId === plan.clientId);
  const onTime = due.filter(item => {
    const delivered = parseOptionalDate(item.deliveredAt?.slice(0, 10));
    const end = cycleEnd.get(item.cycleId);
    return item.status === 'Delivered' && delivered && end && delivered <= endOfDay(end);
  }).length;
  const cycleTasks = tasks.filter(task => task.clientId === plan.clientId && task.serviceCycleId && cycleIds.has(task.serviceCycleId));
  const extras = addons.filter(addon => addon.planId === plan.id && addon.billingMode === 'one_off' && addon.targetCycleId && cycleIds.has(addon.targetCycleId)).length;
  return {
    cyclesReviewed: recent.length,
    deliverables: due.length,
    onTimeRate: due.length ? onTime / due.length : undefined,
    revisionRate: cycleTasks.length ? cycleTasks.filter(task => task.revisionCount > 0).length / cycleTasks.length : undefined,
    extras,
    // Repeated requests outside the plan suggest the client needs a larger one.
    suggestUpgrade: extras >= 2,
  };
};

/** Projects with nobody accountable as Project Manager. Boss Koo administers; PMs run projects. */
export const getProjectsWithoutPm = (projects: readonly Project[], users: readonly User[]) => {
  const projectManagers = new Set(users.filter(user => user.role === 'Project Manager' && !user.isSuperAdmin).map(user => user.id));
  return projects.filter(project => projectStatus(project) !== 'Closed' && (
    project.projectManagerIds !== undefined
      ? !project.projectManagerIds.some(id => projectManagers.has(id))
      : !(project.createdBy && projectManagers.has(project.createdBy))
  ));
};
