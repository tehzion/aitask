import { isSameDay } from 'date-fns';
import type { Task } from '../types';
import { getPortfolioReviewQueues } from './pmDashboard';
import { isTaskCompleted, isTaskOpen } from './taskCompletion';
import { isTaskOverdue } from './taskReporting';
import { parseOptionalDate } from './utils';

export interface RoleWorkSummary {
  open: Task[];
  overdue: Task[];
  dueToday: Task[];
  /** Internal review, approved-but-not-closed, and client review (deduplicated). */
  waitingReviewCount: number;
  done: Task[];
}

/**
 * One definition of open / overdue / due today / waiting review / done
 * (team feedback F5), so the Boss briefing, PM portfolio, HOD and Staff homes
 * show the same numbers for the same tasks. Callers pass the tasks already
 * scoped to the role.
 */
export const getRoleWorkSummary = (tasks: readonly Task[], now = new Date()): RoleWorkSummary => {
  const open = tasks.filter(isTaskOpen);
  return {
    open,
    overdue: open.filter(task => isTaskOverdue(task, now)),
    dueToday: open.filter(task => {
      const due = parseOptionalDate(task.dueDate);
      return Boolean(due && isSameDay(due, now));
    }),
    waitingReviewCount: getPortfolioReviewQueues(tasks).waitingCount,
    done: tasks.filter(isTaskCompleted),
  };
};
