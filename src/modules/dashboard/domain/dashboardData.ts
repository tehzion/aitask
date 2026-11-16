import { differenceInCalendarDays } from 'date-fns/differenceInCalendarDays';
import { startOfDay } from 'date-fns/startOfDay';
import { isTaskCompleted } from '../../../shared/rules/taskCompletion';
import type { ClientProfile, ClientServicePlan, Deliverable, ServiceCycle, Task, User } from '../../../shared/types/index';
import { parseOptionalDate } from '../../../shared/utils/utils';
import { isTaskOpen } from '../../reports/domain/taskReporting';
import { hasInvalidDeliveryLink, isTaskLinkedToDeliverable } from '../../services/domain/deliveryLinks';
export { hasInvalidDeliveryLink, isTaskLinkedToDeliverable } from '../../services/domain/deliveryLinks';

export const getContractDaysRemaining = (contractEndDate: string | undefined, today: Date): number | null => {
  const end = parseOptionalDate(contractEndDate);
  return end ? differenceInCalendarDays(end, today) : null;
};

export const getCurrentPlanCycle = (
  plan: Pick<ClientServicePlan, 'id' | 'clientId'>,
  cycles: readonly ServiceCycle[],
  today: Date,
  options: { includeDraft?: boolean } = {},
): ServiceCycle | undefined => {
  const day = startOfDay(today);
  return cycles
    .filter(cycle => {
      if (cycle.clientId !== plan.clientId || cycle.planId !== plan.id) return false;
      if (cycle.status !== 'Published' && cycle.status !== 'Completed'
        && !(options.includeDraft && cycle.status === 'Draft')) return false;
      const start = parseOptionalDate(cycle.periodStart);
      const end = parseOptionalDate(cycle.periodEnd);
      return Boolean(start && end && startOfDay(start) <= day && day <= startOfDay(end));
    })
    .sort((left, right) => right.periodStart.localeCompare(left.periodStart))[0];
};

// Published delivery and task completion are separate measures. Never convert
// draft planning or unrelated completed tasks into confirmed delivery output.
export const getPlanDeliverySummary = (
  plan: Pick<ClientServicePlan, 'id' | 'clientId'>,
  cycles: readonly ServiceCycle[],
  deliverables: readonly Deliverable[],
  visibleTasks: readonly Task[],
  today: Date,
) => {
  const currentCycle = getCurrentPlanCycle(plan, cycles, today);
  const draftCycle = currentCycle ? undefined : getCurrentPlanCycle(
    plan, cycles.filter(cycle => cycle.status === 'Draft'), today, { includeDraft: true },
  );
  const cycleDeliverables = currentCycle
    ? deliverables.filter(item => item.cycleId === currentCycle.id && item.clientId === plan.clientId)
    : [];
  const completedUnlinked = getUnlinkedWorkSummary(
    visibleTasks.filter(task => task.clientId === plan.clientId),
    deliverables,
  ).unlinked;
  const count = (status: Deliverable['status']) => cycleDeliverables.filter(item => item.status === status).length;
  return {
    currentCycle, draftCycle, completedUnlinked,
    total: cycleDeliverables.length, delivered: count('Delivered'),
    ready: count('Ready'), inProgress: count('In Progress'), planned: count('Planned'),
  };
};

/** The caller supplies permission-filtered tasks; no hidden work is counted. */
export const getCompanyTaskActivity = (
  clientId: string,
  visibleTasks: readonly Task[],
  members: readonly Pick<User, 'id' | 'name'>[],
  today: Date,
) => {
  const tasks = visibleTasks.filter(task => task.clientId === clientId);
  let completedThisMonth = 0;
  let completionDateUnavailable = 0;
  let unassignedOpen = 0;
  const counts = new Map<string, number>();
  for (const task of tasks) {
    if (isTaskCompleted(task)) {
      const date = parseOptionalDate(task.completedAt);
      if (!date) completionDateUnavailable += 1;
      else if (date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth()) completedThisMonth += 1;
    } else if (isTaskOpen(task)) {
      if (!task.assignedTo?.trim()) unassignedOpen += 1;
      else counts.set(task.assignedTo, (counts.get(task.assignedTo) || 0) + 1);
    }
  }
  const names = new Map(members.map(member => [member.id, member.name.trim()]));
  const handlers = [...counts].map(([id, open]) => ({ id, name: names.get(id) || null, open }))
    .sort((a, b) => b.open - a.open || (a.name || '').localeCompare(b.name || '') || a.id.localeCompare(b.id));
  return { completedThisMonth, completionDateUnavailable, unassignedOpen, handlers };
};

/** Hosted Clients receive a boolean only; local workspaces can derive it. */
export const isAwaitingPublication = (client: ClientProfile | undefined, plan: Pick<ClientServicePlan, 'id' | 'clientId'> | undefined,
  cycles: readonly ServiceCycle[], today: Date) => Boolean(client?.awaitingPublication
    || (plan && getCurrentPlanCycle(plan, cycles.filter(cycle => cycle.status === 'Draft'), today, { includeDraft: true })));

/**
 * One canonical completed-work partition for every delivery surface. A task is
 * linked when it has a valid forward or reverse link, invalid when a link is
 * dangling/cross-company/cycle-mismatched, and unlinked when it has no link at
 * all. Cancelled work is never completed. This lets dashboard, tracker, review
 * and report totals reconcile instead of each using a different predicate.
 */
export const getUnlinkedWorkSummary = (
  visibleTasks: readonly Task[],
  deliverables: readonly Deliverable[],
) => {
  const completed = visibleTasks.filter(isTaskCompleted);
  const invalid = completed.filter(task => hasInvalidDeliveryLink(task, deliverables));
  const unlinked = completed.filter(task => !isTaskLinkedToDeliverable(task, deliverables)
    && !hasInvalidDeliveryLink(task, deliverables));
  return {
    completed: completed.length,
    linked: completed.length - invalid.length - unlinked.length,
    invalid: invalid.length,
    unlinked: unlinked.length,
  };
};

export const getDeliveryReviewRecords = (
  visibleTasks: readonly Task[], cycles: readonly ServiceCycle[], deliverables: readonly Deliverable[], today: Date,
) => {
  const day = startOfDay(today);
  return {
    invalidLinkedTasks: visibleTasks.filter(task => task.clientId && hasInvalidDeliveryLink(task, deliverables)),
    unlinkedTasks: visibleTasks.filter(task => isTaskCompleted(task) && Boolean(task.clientId || task.clientName) && !isTaskLinkedToDeliverable(task, deliverables)),
    expiredDraftCycles: cycles.filter(cycle => {
      const end = parseOptionalDate(cycle.periodEnd);
      return cycle.status === 'Draft' && Boolean(end && startOfDay(end) < day);
    }),
    draftCycles: cycles.filter(cycle => {
      const start = parseOptionalDate(cycle.periodStart);
      const end = parseOptionalDate(cycle.periodEnd);
      return cycle.status === 'Draft' && Boolean(start && end && startOfDay(start) <= day && day <= startOfDay(end));
    }),
  };
};
