import type { Task } from '../types';
import { isTaskOpen } from './taskCompletion';
import { isTaskOverdue } from './taskReporting';
import { parseOptionalDate } from './utils';

/** Days ahead a due date counts as "close". */
export const AT_RISK_WINDOW_DAYS = 2;
/** Hours without any change before in-progress work counts as quiet. */
export const QUIET_HOURS = 48;

export type TaskRiskReason = 'not_started' | 'quiet';

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

/** Work that is waiting on someone else is not at risk because of the doer. */
const WAITING_STATUSES = new Set(['Waiting Approval', 'Approved']);

/**
 * Early warning before work turns Overdue: due within two days and either not
 * started or silent for two days. Returns why, or undefined when not at risk.
 * Overdue work is reported as Overdue, never as at risk.
 */
export const getTaskRisk = (task: Task, now = new Date()): TaskRiskReason | undefined => {
  if (!isTaskOpen(task) || isTaskOverdue(task, now) || WAITING_STATUSES.has(task.status)) return undefined;
  const due = parseOptionalDate(task.dueDate);
  if (!due) return undefined;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  // The due date is the last moment of that calendar day.
  const dueEnd = new Date(due.getFullYear(), due.getMonth(), due.getDate(), 23, 59, 59, 999).getTime();
  if (dueEnd - startOfToday > (AT_RISK_WINDOW_DAYS + 1) * DAY) return undefined;
  if (task.status === 'Pending') return 'not_started';
  const updated = Date.parse(task.updatedAt || '');
  if (Number.isFinite(updated) && now.getTime() - updated >= QUIET_HOURS * HOUR) return 'quiet';
  return undefined;
};

export const isTaskAtRisk = (task: Task, now = new Date()) => getTaskRisk(task, now) !== undefined;
