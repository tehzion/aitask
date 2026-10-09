import { describe, expect, it } from 'vitest';
import { parseISO } from 'date-fns';
import {
  buildCalendarWeekLayout,
  normalizeCalendarTaskRange,
  resizeCalendarTaskRange,
  shiftCalendarTaskRange,
  taskOccursOnCalendarDate,
} from './calendarRanges';

describe('calendar task ranges', () => {
  it('treats a task without a due date as a one-day range on its start date', () => {
    expect(normalizeCalendarTaskRange({
      id: 'task-1',
      startDate: '2026-07-10',
      dueDate: '',
    })).toMatchObject({
      taskId: 'task-1',
      startDate: '2026-07-10',
      endDate: '2026-07-10',
      hasDueDate: false,
      durationDays: 1,
    });
  });

  it('includes every calendar day from start through due date', () => {
    const task = { id: 'task-1', startDate: '2026-07-10', dueDate: '2026-07-12' };
    expect(taskOccursOnCalendarDate(task, parseISO('2026-07-09'))).toBe(false);
    expect(taskOccursOnCalendarDate(task, parseISO('2026-07-10'))).toBe(true);
    expect(taskOccursOnCalendarDate(task, new Date('2026-07-10T18:30:00'))).toBe(true);
    expect(taskOccursOnCalendarDate(task, parseISO('2026-07-11'))).toBe(true);
    expect(taskOccursOnCalendarDate(task, parseISO('2026-07-12'))).toBe(true);
    expect(taskOccursOnCalendarDate(task, parseISO('2026-07-13'))).toBe(false);
  });

  it('moves a whole range using the grabbed day as its anchor', () => {
    expect(shiftCalendarTaskRange(
      { id: 'task-1', startDate: '2026-07-10', dueDate: '2026-07-12' },
      '2026-07-11',
      '2026-07-15',
    )).toEqual({
      ok: true,
      startDate: '2026-07-14',
      dueDate: '2026-07-16',
    });
  });

  it('moves only the start date when the task has no due date', () => {
    expect(shiftCalendarTaskRange(
      { id: 'task-1', startDate: '2026-07-10', dueDate: '' },
      '2026-07-10',
      '2026-07-15',
    )).toEqual({
      ok: true,
      startDate: '2026-07-15',
      dueDate: '',
    });
  });

  it('validates both resize edges and lets the due edge create a due date', () => {
    const task = { id: 'task-1', startDate: '2026-07-10', dueDate: '2026-07-12' };
    expect(resizeCalendarTaskRange(task, 'start', '2026-07-13')).toEqual({
      ok: false,
      error: 'Start date cannot be later than the due date.',
    });
    expect(resizeCalendarTaskRange(task, 'due', '2026-07-09')).toEqual({
      ok: false,
      error: 'Due date cannot be earlier than the start date.',
    });
    expect(resizeCalendarTaskRange(
      { id: 'task-2', startDate: '2026-07-10', dueDate: '' },
      'due',
      '2026-07-14',
    )).toEqual({
      ok: true,
      startDate: '2026-07-10',
      dueDate: '2026-07-14',
    });
  });

  it('splits a range at week boundaries and marks continuation edges', () => {
    const tasks = [{ id: 'task-1', startDate: '2026-07-10', dueDate: '2026-07-15' }];
    const firstWeek = buildCalendarWeekLayout(tasks, parseISO('2026-07-06'), 3);
    const secondWeek = buildCalendarWeekLayout(tasks, parseISO('2026-07-13'), 3);

    expect(firstWeek.segments[0]).toMatchObject({
      startDate: '2026-07-10',
      endDate: '2026-07-11',
      startColumn: 5,
      spanDays: 2,
      isActualStart: true,
      isActualEnd: false,
      continuesAfter: true,
    });
    expect(secondWeek.segments[0]).toMatchObject({
      startDate: '2026-07-13',
      endDate: '2026-07-15',
      startColumn: 1,
      spanDays: 3,
      isActualStart: false,
      isActualEnd: true,
      continuesBefore: true,
    });
  });

  it('excludes Sunday-only ranges and clips full weeks to Saturday', () => {
    const layout = buildCalendarWeekLayout([
      { id: 'sunday', startDate: '2026-10-11', dueDate: '2026-10-11' },
      { id: 'full', startDate: '2026-10-05', dueDate: '2026-10-11' },
    ], parseISO('2026-10-05'), 3);
    expect(layout.weekEnd).toBe('2026-10-10');
    expect(layout.segments).toHaveLength(1);
    expect(layout.segments[0]).toMatchObject({ taskId: 'full', startColumn: 1, spanDays: 6, continuesAfter: true, isActualEnd: false });
  });

  it('assigns stable non-overlapping lanes and reports hidden ranges by day', () => {
    const layout = buildCalendarWeekLayout([
      { id: 'a', startDate: '2026-07-05', dueDate: '2026-07-08' },
      { id: 'b', startDate: '2026-07-06', dueDate: '2026-07-09' },
      { id: 'c', startDate: '2026-07-07', dueDate: '2026-07-10' },
    ], parseISO('2026-07-06'), 2);

    expect(layout.segments.map(segment => ({
      id: segment.taskId,
      lane: segment.lane,
      hidden: segment.hidden,
    }))).toEqual([
      { id: 'a', lane: 0, hidden: false },
      { id: 'b', lane: 1, hidden: false },
      { id: 'c', lane: 2, hidden: true },
    ]);
    expect(layout.overflowByDate).toEqual({
      '2026-07-07': 1,
      '2026-07-08': 1,
      '2026-07-09': 1,
      '2026-07-10': 1,
    });
  });
});
