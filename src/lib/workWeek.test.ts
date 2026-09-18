import { describe, expect, it } from 'vitest';
import { getWorkWeekRange, isWorkWeekDay, WORK_WEEKDAYS, DAYS_IN_WORK_WEEK } from './workWeek';

describe('work week', () => {
  it('runs Monday through Saturday with no Sunday', () => {
    const { start, end } = getWorkWeekRange(new Date(2026, 6, 31, 12)); // Friday 31 Jul 2026
    expect(start.getDay()).toBe(1);
    expect(start.getDate()).toBe(27);
    expect(end.getDay()).toBe(6);
    expect(end.getDate()).toBe(1);
    expect(DAYS_IN_WORK_WEEK).toBe(6);
    expect(WORK_WEEKDAYS).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
    expect(isWorkWeekDay(new Date(2026, 7, 1))).toBe(true);
    expect(isWorkWeekDay(new Date(2026, 7, 2))).toBe(false);
  });

  it('puts a Sunday anchor in the preceding Monday-to-Saturday week', () => {
    const { start, end } = getWorkWeekRange(new Date(2026, 7, 2, 12)); // Sunday 2 Aug 2026
    expect(start.getDate()).toBe(27);
    expect(end.getDate()).toBe(1);
  });
});
