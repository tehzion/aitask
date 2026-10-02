import {
  addMonths,
  addWeeks,
  endOfMonth,
  isAfter,
  isBefore,
  isEqual,
  isValid,
  parseISO,
  startOfMonth,
} from 'date-fns';
import type { Deliverable, ServiceCycle, Task, User } from '../types';
import { getClientTaskStage } from './clientPortal';
import { getWorkWeekRange } from './workWeek';
import { formatLocalizedDate, formatLocalizedMonth, type AppLocale } from './i18n';

export type DeliveryTrackerPeriod = 'week' | 'month' | 'all';
export type DeliveryTrackerStatusFilter = 'all' | 'open' | 'overdue' | 'completed';

export interface DeliveryPeriodRange {
  start: Date;
  end: Date;
  label: string;
}

export interface ClientDeliverySummary {
  clientName: string;
  tasks: Task[];
  deliverables: Deliverable[];
  cycle?: ServiceCycle;
  open: number;
  inProgress: number;
  review: number;
  overdue: number;
  completed: number;
  included: number;
  delivered: number;
  remaining: number;
  progress: number;
  nextDeadline?: string;
  assigneeIds: string[];
}

const atStartOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate());

const dateValue = (value?: string) => {
  if (!value) return null;
  const parsed = parseISO(value);
  return isValid(parsed) ? parsed : null;
};

const isWithin = (value: Date | null, range: DeliveryPeriodRange) => Boolean(value && (
  (isAfter(value, range.start) || isEqual(value, range.start))
  && (isBefore(value, range.end) || isEqual(value, range.end))
));

const isTaskCompleted = (task: Task) => task.isCompleted || task.status === 'Completed';
const isTaskCancelled = (task: Task) => task.status === 'Cancelled';

export const getDeliveryPeriodRange = (
  period: DeliveryTrackerPeriod,
  anchor: Date,
  locale: AppLocale = 'en',
): DeliveryPeriodRange => {
  if (period === 'all') {
    // The range remains available to consumers, while the summary builder uses
    // the period itself to include every visible record.
    return { start: new Date(2000, 0, 1), end: new Date(2100, 11, 31), label: locale === 'zh' ? '全部工作' : 'All work' };
  }
  if (period === 'week') {
    const { start, end } = getWorkWeekRange(anchor);
    return { start, end, label: `${formatLocalizedDate(start, locale)} – ${formatLocalizedDate(end, locale)}` };
  }
  const start = startOfMonth(anchor);
  const end = endOfMonth(anchor);
  return { start, end, label: formatLocalizedMonth(start, locale) };
};

export const moveDeliveryPeriod = (
  period: DeliveryTrackerPeriod,
  anchor: Date,
  amount: number,
) => period === 'week' ? addWeeks(anchor, amount) : period === 'month' ? addMonths(anchor, amount) : anchor;

export const taskAppearsInDeliveryPeriod = (
  task: Task,
  range: DeliveryPeriodRange,
  today = new Date(),
  clientView = false,
) => {
  const taskCompleted = clientView ? getClientTaskStage(task) === 'approved' : isTaskCompleted(task);
  const due = dateValue(task.dueDate);
  const completed = dateValue(task.completedAt);
  if (isWithin(due, range) || isWithin(completed, range)) return true;

  // Open overdue work carries forward so it cannot disappear from the tracker.
  const end = atStartOfDay(range.end);
  const start = dateValue(task.startDate);
  const openAndStarted = !taskCompleted && (!start || !isAfter(start, end));
  const overdueByPeriodEnd = due && isBefore(atStartOfDay(due), end);
  const selectedPeriodHasStarted = !isAfter(atStartOfDay(range.start), atStartOfDay(today));
  if (openAndStarted && overdueByPeriodEnd && selectedPeriodHasStarted) return true;

  // No-deadline work belongs to the period in which it started and the active
  // period while it remains open. It must not appear in arbitrary past/future
  // periods just because it has no deadline.
  const todayStart = atStartOfDay(today);
  const startedByToday = !start || !isAfter(atStartOfDay(start), todayStart);
  const activePeriod = isWithin(todayStart, range);
  return Boolean(!due && !taskCompleted && startedByToday && (
    isWithin(start, range) || activePeriod
  ));
};

const cycleOverlaps = (cycle: ServiceCycle, range: DeliveryPeriodRange) => {
  const start = dateValue(cycle.periodStart);
  const end = dateValue(cycle.periodEnd);
  return Boolean(start && end && !isAfter(start, range.end) && !isBefore(end, range.start));
};

const normalize = (value: string | null | undefined) => value?.trim().toLowerCase() || '';

export const buildClientDeliverySummaries = ({
  clientNames,
  tasks,
  deliverables,
  cycles,
  users,
  period,
  range,
  today = new Date(),
  clientView = false,
  searchQuery = '',
}: {
  clientNames: string[];
  tasks: Task[];
  deliverables: Deliverable[];
  cycles: ServiceCycle[];
  users: User[];
  period: DeliveryTrackerPeriod;
  range: DeliveryPeriodRange;
  today?: Date;
  clientView?: boolean;
  searchQuery?: string;
}): ClientDeliverySummary[] => {
  const query = searchQuery.trim().toLowerCase();
  const matches = (values: (string | undefined)[]) => !query || values.some(value => value?.toLowerCase().includes(query));
  tasks = tasks.filter(task => matches([task.clientName, task.title, task.serviceType]));
  const matchingTaskIds = new Set(tasks.map(task => task.id));
  deliverables = deliverables.filter(item => matches([item.clientName, item.title])
    || Boolean(item.primaryTaskId && matchingTaskIds.has(item.primaryTaskId))
    || (item.taskIds || []).some(id => matchingTaskIds.has(id)));
  const completedForView = (item: Task) => clientView ? getClientTaskStage(item) === 'approved' : isTaskCompleted(item);
  const userIds = new Set(users.filter(user => user.role !== 'Client').map(user => user.id));

  return clientNames.map(clientName => {
    const key = normalize(clientName);
    const clientTasks = tasks.filter(task => (
      normalize(task.clientName) === key && (period === 'all' || taskAppearsInDeliveryPeriod(task, range, today, clientView))
    ));
    const clientTaskIds = new Set(clientTasks.map(task => task.id));
    const clientCycles = cycles
      .filter(cycle => normalize(cycle.clientName) === key && (!clientView || ['Published', 'Completed'].includes(cycle.status)) && (period === 'all' || cycleOverlaps(cycle, range)))
      .sort((left, right) => right.periodStart.localeCompare(left.periodStart));
    const cycleIds = new Set(clientCycles.map(cycle => cycle.id));
    const clientDeliverables = deliverables.filter(deliverable => {
      if (normalize(deliverable.clientName) !== key) return false;
      if (clientView && !cycles.some(cycle => cycle.id === deliverable.cycleId && normalize(cycle.clientName) === key && ['Published', 'Completed'].includes(cycle.status))) return false;
      if (period === 'all') return true;
      const deliveredInPeriod = isWithin(
        dateValue(deliverable.deliveredAt || (deliverable.status === 'Delivered' ? deliverable.updatedAt : undefined)),
        range,
      );
      const linkedToTrackedTask = (Array.isArray(deliverable.taskIds) ? deliverable.taskIds : [])
        .some(id => clientTaskIds.has(id))
        || Boolean(deliverable.primaryTaskId && clientTaskIds.has(deliverable.primaryTaskId));
      if (period === 'month' && deliverable.cycleId && cycleIds.has(deliverable.cycleId)) return true;
      return deliveredInPeriod || linkedToTrackedTask;
    });

    const openTasks = clientTasks.filter(task => !completedForView(task) && !isTaskCancelled(task));
    const completed = clientTasks.filter(task => completedForView(task) && !isTaskCancelled(task)).length;
    const inProgress = openTasks.filter(task => task.status === 'In Progress' && (!clientView || getClientTaskStage(task) === 'active')).length;
    const review = openTasks.filter(task => clientView ? getClientTaskStage(task) === 'awaiting_review' : task.status === 'Waiting Approval').length;
    const todayStart = atStartOfDay(today);
    const overdue = openTasks.filter(task => {
      const due = dateValue(task.dueDate);
      return Boolean(due && (!clientView || getClientTaskStage(task) === 'active') && isBefore(atStartOfDay(due), todayStart));
    }).length;
    const delivered = clientDeliverables.filter(item => item.status === 'Delivered').length;
    const included = clientDeliverables.length;
    const totalForProgress = included || clientTasks.filter(task => !isTaskCancelled(task)).length;
    const completeForProgress = included ? delivered : completed;
    const nextDeadline = openTasks
      .map(task => ({ raw: task.dueDate, parsed: dateValue(task.dueDate) }))
      .filter((value): value is { raw: string; parsed: Date } => Boolean(value.raw && value.parsed))
      .sort((left, right) => left.parsed.getTime() - right.parsed.getTime())[0]?.raw;

    return {
      clientName,
      tasks: clientTasks.sort((left, right) => (left.dueDate || '9999').localeCompare(right.dueDate || '9999')),
      deliverables: clientDeliverables.sort((left, right) => left.sequence - right.sequence),
      cycle: clientCycles[0],
      open: openTasks.length,
      inProgress,
      review,
      overdue,
      completed,
      included,
      delivered,
      remaining: Math.max(0, included - delivered),
      progress: totalForProgress ? Math.round((completeForProgress / totalForProgress) * 100) : 0,
      nextDeadline,
      assigneeIds: Array.from(new Set(clientTasks.map(task => task.assignedTo).filter(id => userIds.has(id)))),
    };
  });
};
