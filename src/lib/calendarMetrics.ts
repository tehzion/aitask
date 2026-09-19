import { isBefore, isSameDay, startOfDay } from 'date-fns';
import type { Task } from '../types';
import { isTaskCompleted } from './taskCompletion';
import { parseDateOnlyLocal } from './utils';

export type CalendarFilter = 'all' | 'open' | 'due-today' | 'overdue' | 'completed' | 'no-due-date';

export interface CalendarOverview {
  total: number;
  open: number;
  dueToday: number;
  overdue: number;
  completed: number;
  noDueDate: number;
}

export interface CalendarTaskSummary {
  total: number;
  open: number;
  completed: number;
  overdue: number;
}

export const isCalendarTaskOpen = (task: Task) => !isTaskCompleted(task) && task.status !== 'Cancelled';

const getDueDate = (task: Task) => parseDateOnlyLocal(task.dueDate);

export const getCalendarOverview = (tasks: Task[], now = new Date()): CalendarOverview => {
  const today = startOfDay(now);
  return {
    total: tasks.length,
    open: tasks.filter(isCalendarTaskOpen).length,
    dueToday: tasks.filter(task => {
      const dueDate = getDueDate(task);
      return Boolean(dueDate && isSameDay(dueDate, today));
    }).length,
    overdue: tasks.filter(task => {
      const dueDate = getDueDate(task);
      return Boolean(isCalendarTaskOpen(task) && dueDate && isBefore(dueDate, today));
    }).length,
    completed: tasks.filter(isTaskCompleted).length,
    noDueDate: tasks.filter(task => !getDueDate(task)).length,
  };
};

export const getCalendarTaskSummary = (tasks: Task[], now = new Date()): CalendarTaskSummary => {
  const overview = getCalendarOverview(tasks, now);
  return {
    total: overview.total,
    open: overview.open,
    completed: overview.completed,
    overdue: overview.overdue,
  };
};

export const filterCalendarTasks = (
  tasks: Task[],
  filter: CalendarFilter,
  now = new Date(),
): Task[] => {
  if (filter === 'all') return tasks;
  const today = startOfDay(now);
  return tasks.filter(task => {
    const dueDate = getDueDate(task);
    if (filter === 'open') return isCalendarTaskOpen(task);
    if (filter === 'due-today') return Boolean(dueDate && isSameDay(dueDate, today));
    if (filter === 'overdue') return Boolean(isCalendarTaskOpen(task) && dueDate && isBefore(dueDate, today));
    if (filter === 'completed') return isTaskCompleted(task);
    return !dueDate;
  });
};
