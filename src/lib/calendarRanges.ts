import {
  addDays,
  differenceInCalendarDays,
  format,
  isAfter,
  isBefore,
  isSameDay,
  isValid,
  parseISO,
} from 'date-fns';

export interface CalendarRangeSource {
  id: string;
  startDate: string;
  dueDate?: string;
}

export interface CalendarTaskRange {
  taskId: string;
  start: Date;
  end: Date;
  startDate: string;
  endDate: string;
  hasDueDate: boolean;
  durationDays: number;
}

export interface CalendarRangeSegment {
  taskId: string;
  startDate: string;
  endDate: string;
  startColumn: number;
  spanDays: number;
  lane: number;
  hidden: boolean;
  isActualStart: boolean;
  isActualEnd: boolean;
  continuesBefore: boolean;
  continuesAfter: boolean;
}

export interface CalendarWeekLayout {
  weekStart: string;
  weekEnd: string;
  segments: CalendarRangeSegment[];
  overflowByDate: Record<string, number>;
}

export type CalendarRangeResizeResult =
  | { ok: true; startDate: string; dueDate: string }
  | { ok: false; error: string };

const dateKey = (date: Date) => format(date, 'yyyy-MM-dd');

const parseDate = (value?: string) => {
  if (!value) return null;
  const parsed = parseISO(value);
  return isValid(parsed) ? parsed : null;
};

export const normalizeCalendarTaskRange = (task: CalendarRangeSource): CalendarTaskRange | null => {
  const start = parseDate(task.startDate);
  if (!start) return null;

  const parsedDue = parseDate(task.dueDate);
  const hasDueDate = Boolean(parsedDue && !isBefore(parsedDue, start));
  const end = hasDueDate && parsedDue ? parsedDue : start;

  return {
    taskId: task.id,
    start,
    end,
    startDate: dateKey(start),
    endDate: dateKey(end),
    hasDueDate,
    durationDays: differenceInCalendarDays(end, start) + 1,
  };
};

export const taskOccursOnCalendarDate = (task: CalendarRangeSource, day: Date) => {
  const range = normalizeCalendarTaskRange(task);
  const calendarDay = parseISO(dateKey(day));
  return Boolean(range && !isBefore(calendarDay, range.start) && !isAfter(calendarDay, range.end));
};

export const shiftCalendarTaskRange = (
  task: CalendarRangeSource,
  anchorDate: string,
  targetDate: string,
): CalendarRangeResizeResult => {
  const range = normalizeCalendarTaskRange(task);
  const anchor = parseDate(anchorDate);
  const target = parseDate(targetDate);
  if (!range || !anchor || !target) return { ok: false, error: 'Choose valid task dates.' };

  const offset = differenceInCalendarDays(target, anchor);
  return {
    ok: true,
    startDate: dateKey(addDays(range.start, offset)),
    dueDate: range.hasDueDate ? dateKey(addDays(range.end, offset)) : '',
  };
};

export const resizeCalendarTaskRange = (
  task: CalendarRangeSource,
  edge: 'start' | 'due',
  targetDate: string,
): CalendarRangeResizeResult => {
  const range = normalizeCalendarTaskRange(task);
  const target = parseDate(targetDate);
  if (!range || !target) return { ok: false, error: 'Choose a valid date.' };

  if (edge === 'start') {
    if (range.hasDueDate && isAfter(target, range.end)) {
      return { ok: false, error: 'Start date cannot be later than the due date.' };
    }
    return {
      ok: true,
      startDate: dateKey(target),
      dueDate: range.hasDueDate ? range.endDate : '',
    };
  }

  if (isBefore(target, range.start)) {
    return { ok: false, error: 'Due date cannot be earlier than the start date.' };
  }
  return {
    ok: true,
    startDate: range.startDate,
    dueDate: dateKey(target),
  };
};

export const buildCalendarWeekLayout = (
  tasks: CalendarRangeSource[],
  weekStartDate: Date,
  maxVisibleLanes: number,
): CalendarWeekLayout => {
  const weekStart = parseISO(dateKey(weekStartDate));
  const weekEnd = addDays(weekStart, 6);
  const ranges = tasks
    .map(normalizeCalendarTaskRange)
    .filter((range): range is CalendarTaskRange => Boolean(
      range && !isAfter(range.start, weekEnd) && !isBefore(range.end, weekStart),
    ))
    .sort((a, b) => {
      const startOrder = a.start.getTime() - b.start.getTime();
      if (startOrder !== 0) return startOrder;
      const durationOrder = b.durationDays - a.durationDays;
      return durationOrder !== 0 ? durationOrder : a.taskId.localeCompare(b.taskId);
    });

  const laneEnds: Date[] = [];
  const overflowByDate: Record<string, number> = {};
  const segments = ranges.map(range => {
    const segmentStart = isBefore(range.start, weekStart) ? weekStart : range.start;
    const segmentEnd = isAfter(range.end, weekEnd) ? weekEnd : range.end;
    let lane = laneEnds.findIndex(end => isBefore(end, segmentStart));
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = segmentEnd;

    const hidden = lane >= maxVisibleLanes;
    if (hidden) {
      for (
        let day = segmentStart;
        !isAfter(day, segmentEnd);
        day = addDays(day, 1)
      ) {
        const key = dateKey(day);
        overflowByDate[key] = (overflowByDate[key] || 0) + 1;
      }
    }

    return {
      taskId: range.taskId,
      startDate: dateKey(segmentStart),
      endDate: dateKey(segmentEnd),
      startColumn: differenceInCalendarDays(segmentStart, weekStart) + 1,
      spanDays: differenceInCalendarDays(segmentEnd, segmentStart) + 1,
      lane,
      hidden,
      isActualStart: isSameDay(range.start, segmentStart),
      isActualEnd: isSameDay(range.end, segmentEnd),
      continuesBefore: isBefore(range.start, weekStart),
      continuesAfter: isAfter(range.end, weekEnd),
    };
  });

  return {
    weekStart: dateKey(weekStart),
    weekEnd: dateKey(weekEnd),
    segments,
    overflowByDate,
  };
};
