import type { TaskStatus, User } from '../types';

const REVIEW_STATUSES: readonly string[] = ['Waiting Approval', 'Approved', 'Completed'];
const WORKING_STATUSES: readonly string[] = ['Pending', 'In Progress', 'Revision'];

/**
 * Status moves Boss Koo should hear about: work being approved, finished or
 * cancelled, or sent back after review. Everyday moves (Pending to In
 * Progress, and so on) stay with the people doing the work; Boss Koo sees them
 * on the dashboard instead of as hundreds of notifications.
 */
export const isBossMilestoneStatusMove = (previous: TaskStatus | string, next: TaskStatus | string) => {
  if (previous === next) return false;
  if (next === 'Approved' || next === 'Completed' || next === 'Cancelled') return true;
  return REVIEW_STATUSES.includes(previous) && WORKING_STATUSES.includes(next);
};

/** Drops Boss Koo from a routine status notice unless the move is a milestone. */
export const withoutRoutineBossNotice = (
  recipientIds: readonly string[],
  users: readonly Pick<User, 'id' | 'isSuperAdmin'>[],
  previous: TaskStatus | string,
  next: TaskStatus | string,
): string[] => {
  if (isBossMilestoneStatusMove(previous, next)) return [...recipientIds];
  const bosses = new Set(users.filter(user => user.isSuperAdmin).map(user => user.id));
  return recipientIds.filter(id => !bosses.has(id));
};

/** A rating this low needs a person to follow up, so it is an action item. */
export const LOW_RATING_STARS = 2;
export const isLowClientRating = (stars: number | undefined) => typeof stars === 'number' && stars >= 1 && stars <= LOW_RATING_STARS;

/** Adds the reason a date moved to the notice, kept short. */
export const dateChangeNoticeMessage = (title: string, actorName: string, reason?: string) => {
  const base = `The start date or due date for "${title}" was updated by ${actorName}.`;
  const clean = reason?.trim();
  return clean ? `${base} Reason: ${clean.length > 200 ? `${clean.slice(0, 199)}…` : clean}` : base;
};
