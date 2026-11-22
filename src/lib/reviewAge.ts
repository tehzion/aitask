import type { Task } from '../types';

const DAY_MS = 86_400_000;

/** Whole days a submitted task has waited for a decision; undefined when it is not waiting or has no submit time. */
export const getReviewWaitDays = (task: Pick<Task, 'status' | 'workState'>, now: Date = new Date()): number | undefined => {
  if (task.status !== 'Waiting Approval') return undefined;
  const since = Date.parse(task.workState?.reviewRequestedAt || '');
  if (!Number.isFinite(since)) return undefined;
  return Math.max(0, Math.floor((now.getTime() - since) / DAY_MS));
};

/** A review that has waited this many days or more is flagged as slow. */
export const SLOW_REVIEW_DAYS = 2;

/** Oldest submission first; tasks without a submit time keep their order after dated ones. */
export const compareByReviewAge = (a: Task, b: Task): number => {
  const timeA = Date.parse(a.workState?.reviewRequestedAt || '');
  const timeB = Date.parse(b.workState?.reviewRequestedAt || '');
  const hasA = Number.isFinite(timeA);
  const hasB = Number.isFinite(timeB);
  if (hasA && hasB) return timeA - timeB;
  if (hasA !== hasB) return hasA ? -1 : 1;
  return 0;
};
