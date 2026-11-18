import type { Task } from '../types';
import { isAwaitingClientReview } from './clientPortal';

/** Days a delivery may wait for the client before the PM is nudged to follow up. */
export const CLIENT_REVIEW_FOLLOW_UP_DAYS = 3;

const DAY = 24 * 60 * 60 * 1000;

/** When the delivery was handed to the client: its completion, else its last change. */
export const clientReviewWaitingSince = (task: Task): number | undefined => {
  const moment = Date.parse(task.completedAt || task.updatedAt || '');
  return Number.isFinite(moment) ? moment : undefined;
};

/**
 * Deliveries the client has had for at least `days` days without accepting or
 * asking for changes, oldest first. Fiverr completes such orders on its own
 * after three days; here the PM decides, so this only surfaces them.
 */
export const getClientReviewFollowUps = (tasks: readonly Task[], now = new Date(), days = CLIENT_REVIEW_FOLLOW_UP_DAYS): Task[] => (
  tasks
    .filter(task => isAwaitingClientReview(task))
    .map(task => ({ task, since: clientReviewWaitingSince(task) }))
    .filter((item): item is { task: Task; since: number } => item.since !== undefined && now.getTime() - item.since >= days * DAY)
    .sort((a, b) => a.since - b.since)
    .map(item => item.task)
);

export const daysWaitingForClient = (task: Task, now = new Date()) => {
  const since = clientReviewWaitingSince(task);
  return since === undefined ? 0 : Math.max(0, Math.floor((now.getTime() - since) / DAY));
};
