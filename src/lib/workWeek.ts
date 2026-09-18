import { addDays, endOfDay, startOfDay, startOfWeek } from 'date-fns';

/**
 * AiTask runs on a Monday-to-Saturday work week. Sunday is never part of a
 * reporting, workload, delivery, or calendar week.
 */
export const WORK_WEEK_STARTS_ON = { weekStartsOn: 1 } as const;
export const WORK_WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export const DAYS_IN_WORK_WEEK = 6;

export const getWorkWeekRange = (anchor: Date): { start: Date; end: Date } => {
  const start = startOfDay(startOfWeek(anchor, WORK_WEEK_STARTS_ON));
  return { start, end: endOfDay(addDays(start, DAYS_IN_WORK_WEEK - 1)) };
};

export const getWorkWeekStart = (anchor: Date): Date => getWorkWeekRange(anchor).start;

export const isWorkWeekDay = (date: Date): boolean => date.getDay() !== 0;
