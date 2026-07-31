import {
  endOfDay,
  endOfWeek,
  format,
  isSameMonth,
  isWithinInterval,
  startOfDay,
  startOfWeek,
  subMonths,
  subWeeks,
} from 'date-fns';
import type { Task } from '../types';
import { parseOptionalDate } from './utils';
import { isTaskCompleted } from './taskCompletion';

const mondayWeek = { weekStartsOn: 1 as const };

export interface OperationsPeriod {
  start: Date;
  end: Date;
  label: string;
}

export interface AgencyPulseMetrics {
  period: OperationsPeriod;
  today: {
    completed: number;
    due: number;
    open: number;
  };
  week: {
    completed: number;
    due: number;
    remaining: number;
    overdue: number;
  };
  overall: {
    open: number;
    inProgress: number;
    waitingApproval: number;
    completed: number;
  };
  untrackedHistoricalCompletions: number;
}

const isCancelled = (task: Task) => task.status === 'Cancelled';
const isOpen = (task: Task) => !isTaskCompleted(task) && !isCancelled(task);

const isInPeriod = (value: string | undefined, start: Date, end: Date) => {
  const date = parseOptionalDate(value);
  return Boolean(date && isWithinInterval(date, { start, end }));
};

export const getOperationsPeriod = (now = new Date()): OperationsPeriod => {
  const start = startOfWeek(now, mondayWeek);
  const end = endOfWeek(now, mondayWeek);
  return {
    start,
    end,
    label: `${format(start, 'd MMM')} - ${format(end, 'd MMM yyyy')}`,
  };
};

export const getAgencyPulseMetrics = (tasks: Task[], now = new Date()): AgencyPulseMetrics => {
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const period = getOperationsPeriod(now);
  const dueToday = tasks.filter(task => !isCancelled(task) && isInPeriod(task.dueDate, todayStart, todayEnd));
  const dueThisWeek = tasks.filter(task => !isCancelled(task) && isInPeriod(task.dueDate, period.start, period.end));

  return {
    period,
    today: {
      completed: tasks.filter(task => isTaskCompleted(task) && isInPeriod(task.completedAt, todayStart, todayEnd)).length,
      due: dueToday.length,
      open: dueToday.filter(isOpen).length,
    },
    week: {
      completed: tasks.filter(task => isTaskCompleted(task) && isInPeriod(task.completedAt, period.start, period.end)).length,
      due: dueThisWeek.length,
      remaining: dueThisWeek.filter(isOpen).length,
      overdue: tasks.filter(task => {
        const dueDate = parseOptionalDate(task.dueDate);
        return Boolean(isOpen(task) && dueDate && dueDate < todayStart);
      }).length,
    },
    overall: {
      open: tasks.filter(isOpen).length,
      inProgress: tasks.filter(task => isOpen(task) && task.status === 'In Progress').length,
      waitingApproval: tasks.filter(task => isOpen(task) && task.status === 'Waiting Approval').length,
      completed: tasks.filter(isTaskCompleted).length,
    },
    untrackedHistoricalCompletions: tasks.filter(task => isTaskCompleted(task) && !parseOptionalDate(task.completedAt)).length,
  };
};

export const getNeedsAttentionTasks = (tasks: Task[], now = new Date()) => {
  const todayStart = startOfDay(now);
  const overdue = tasks
    .filter(task => {
      const dueDate = parseOptionalDate(task.dueDate);
      return Boolean(isOpen(task) && dueDate && dueDate < todayStart);
    })
    .sort((a, b) => (parseOptionalDate(a.dueDate)?.getTime() || 0) - (parseOptionalDate(b.dueDate)?.getTime() || 0));
  const overdueIds = new Set(overdue.map(task => task.id));
  const waitingApproval = tasks
    .filter(task => isOpen(task) && task.status === 'Waiting Approval' && !overdueIds.has(task.id))
    .sort((a, b) => (parseOptionalDate(a.dueDate)?.getTime() || Number.MAX_SAFE_INTEGER) - (parseOptionalDate(b.dueDate)?.getTime() || Number.MAX_SAFE_INTEGER));
  return [...overdue, ...waitingApproval];
};

export type CompletionSegment = 'today' | 'week' | 'all';

export const getRecentCompletionTasks = (
  tasks: Task[],
  segment: CompletionSegment,
  now = new Date(),
) => {
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const week = getOperationsPeriod(now);
  return tasks
    .filter(task => {
      if (!isTaskCompleted(task)) return false;
      const completedAt = parseOptionalDate(task.completedAt);
      if (!completedAt) return false;
      if (segment === 'today') return isWithinInterval(completedAt, { start: todayStart, end: todayEnd });
      if (segment === 'week') return isWithinInterval(completedAt, { start: week.start, end: week.end });
      return true;
    })
    .sort((a, b) => (parseOptionalDate(b.completedAt)?.getTime() || 0) - (parseOptionalDate(a.completedAt)?.getTime() || 0));
};

export const getTrackedMonthlyCompletions = (tasks: Task[], now = new Date(), months = 6) => (
  Array.from({ length: months }, (_, index) => months - index - 1).map(offset => {
    const month = subMonths(now, offset);
    return {
      name: format(month, 'MMM'),
      completed: tasks.filter(task => {
        const completedAt = parseOptionalDate(task.completedAt);
        return Boolean(isTaskCompleted(task) && completedAt && isSameMonth(completedAt, month));
      }).length,
    };
  })
);

export const getTrackedWeeklyCompletions = (tasks: Task[], now = new Date(), weeks = 4) => {
  const currentWeek = startOfWeek(now, mondayWeek);
  return Array.from({ length: weeks }, (_, index) => weeks - index - 1).map(offset => {
    const weekStart = subWeeks(currentWeek, offset);
    const weekEnd = endOfWeek(weekStart, mondayWeek);
    const dueTasks = tasks.filter(task => isInPeriod(task.dueDate, weekStart, weekEnd));
    return {
      name: format(weekStart, 'MMM d'),
      completed: tasks.filter(task => isTaskCompleted(task) && isInPeriod(task.completedAt, weekStart, weekEnd)).length,
      pending: dueTasks.filter(task => isOpen(task)).length,
    };
  });
};
