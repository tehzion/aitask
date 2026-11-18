import type { Task } from '../types';
import { isTaskCompleted } from './taskCompletion';

export interface DeliveryMetrics {
  /** Tasks finished inside the period. */
  completed: number;
  /** Finished tasks that had a due date, and how many of those were on or before it. */
  withDueDate: number;
  onTime: number;
  /** Share of finished tasks, 0-100, that went back for at least one revision. */
  revisionRate: number;
  averageRevisions: number;
  /** Median hours from being assigned to accepting the task; undefined when no sample. */
  medianAcceptanceHours?: number;
  ratedCount: number;
  averageRating?: number;
}

export interface PersonDeliveryMetrics extends DeliveryMetrics {
  userId: string;
}

const DAY = 24 * 60 * 60 * 1000;

const median = (values: number[]) => {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** A due date is the last moment of that calendar day (local time). */
const endOfDueDate = (dueDate: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dueDate);
  if (!match) return undefined;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 23, 59, 59, 999).getTime();
};

export const isCompletedInPeriod = (task: Task, now: Date, days: number) => {
  if (!isTaskCompleted(task)) return false;
  const finished = Date.parse(task.completedAt || '');
  return Number.isFinite(finished) && finished <= now.getTime() && finished >= now.getTime() - days * DAY;
};

/**
 * Delivery quality for a set of tasks, Fiverr-style: on-time rate, revision
 * rate, speed of accepting work and client rating. Meant for coaching, so it
 * only describes finished work in the chosen period.
 */
export const computeDeliveryMetrics = (tasks: readonly Task[], now = new Date(), days = 90): DeliveryMetrics => {
  const finished = tasks.filter(task => isCompletedInPeriod(task, now, days));
  let withDueDate = 0;
  let onTime = 0;
  const acceptance: number[] = [];
  let ratedCount = 0;
  let ratingSum = 0;
  for (const task of finished) {
    const due = task.dueDate ? endOfDueDate(task.dueDate) : undefined;
    if (due !== undefined) {
      withDueDate += 1;
      if (Date.parse(task.completedAt!) <= due) onTime += 1;
    }
    const assigned = Date.parse(task.assignedAt || '');
    const accepted = Date.parse(task.workState?.acceptedAt || '');
    if (Number.isFinite(assigned) && Number.isFinite(accepted) && accepted >= assigned) acceptance.push((accepted - assigned) / (60 * 60 * 1000));
    if (task.clientRating) { ratedCount += 1; ratingSum += task.clientRating.stars; }
  }
  const revised = finished.filter(task => task.revisionCount > 0).length;
  const revisionTotal = finished.reduce((sum, task) => sum + Math.max(0, task.revisionCount || 0), 0);
  const round = (value: number) => Math.round(value * 10) / 10;
  return {
    completed: finished.length,
    withDueDate,
    onTime,
    revisionRate: finished.length ? Math.round((revised / finished.length) * 100) : 0,
    averageRevisions: finished.length ? round(revisionTotal / finished.length) : 0,
    medianAcceptanceHours: (() => { const value = median(acceptance); return value === undefined ? undefined : round(value); })(),
    ratedCount,
    averageRating: ratedCount ? round(ratingSum / ratedCount) : undefined,
  };
};

export const onTimeRate = (metrics: Pick<DeliveryMetrics, 'withDueDate' | 'onTime'>) => (
  metrics.withDueDate ? Math.round((metrics.onTime / metrics.withDueDate) * 100) : undefined
);

/** One row per assignee with finished work in the period, busiest first. */
export const computePersonDeliveryMetrics = (tasks: readonly Task[], now = new Date(), days = 90): PersonDeliveryMetrics[] => {
  const byPerson = new Map<string, Task[]>();
  for (const task of tasks) {
    if (!task.assignedTo || !isCompletedInPeriod(task, now, days)) continue;
    byPerson.set(task.assignedTo, [...(byPerson.get(task.assignedTo) || []), task]);
  }
  return [...byPerson.entries()]
    .map(([userId, list]) => ({ userId, ...computeDeliveryMetrics(list, now, days) }))
    .sort((a, b) => b.completed - a.completed || a.userId.localeCompare(b.userId));
};
