import type { Task, TaskDateChange } from '../types';

export const MAX_DATE_REASON_LENGTH = 200;

const isDay = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

/**
 * Records that an existing due date moved so the client can see it, with an
 * optional reason. Setting a first date, clearing a date or saving the same
 * date records nothing and keeps whatever change was already recorded. Moving
 * back to the date it had before the last change clears the notice.
 */
export const nextDateChange = (
  task: Pick<Task, 'dueDate' | 'dateChange'>,
  newDueDate: string | undefined,
  reason: string | undefined,
  userId: string,
  nowIso: string,
): TaskDateChange | undefined => {
  const previous = task.dueDate;
  if (!isDay(previous) || !isDay(newDueDate) || previous === newDueDate) return task.dateChange;
  if (task.dateChange?.from === newDueDate) return undefined;
  const trimmed = reason?.trim().slice(0, MAX_DATE_REASON_LENGTH);
  return { from: previous, reason: trimmed || undefined, changedBy: userId, changedAt: nowIso };
};
