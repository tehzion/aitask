import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import { filterCalendarTasks, getCalendarOverview, getCalendarTaskSummary } from './calendarMetrics';

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1',
  clientName: 'Acme',
  serviceType: 'Design',
  title: 'Campaign artwork',
  description: '',
  department: 'Designer',
  assignedTo: 'staff-1',
  createdBy: 'boss-1',
  startDate: '2026-09-14',
  dueDate: '2026-09-19',
  priority: 'Medium',
  status: 'Pending',
  completionPercentage: 0,
  isCompleted: false,
  revisionCount: 0,
  clientApprovalStatus: 'Pending',
  isRecurring: false,
  ...overrides,
});

describe('calendar overview metrics and filters', () => {
  const now = new Date(2026, 8, 19, 12, 0, 0);
  const tasks = [
    makeTask({ id: 'open-today', dueDate: '2026-09-19' }),
    makeTask({ id: 'overdue', dueDate: '2026-09-18', status: 'In Progress' }),
    makeTask({ id: 'completed', dueDate: '2026-09-19', status: 'Completed', isCompleted: true, completionPercentage: 100 }),
    makeTask({ id: 'cancelled', dueDate: '2026-09-18', status: 'Cancelled' }),
    makeTask({ id: 'no-due-date', dueDate: '' }),
  ];

  it('counts visible work using local date boundaries', () => {
    expect(getCalendarOverview(tasks, now)).toEqual({
      total: 5,
      open: 3,
      dueToday: 2,
      overdue: 1,
      completed: 1,
      noDueDate: 1,
    });
    expect(getCalendarTaskSummary(tasks, now)).toEqual({ total: 5, open: 3, completed: 1, overdue: 1 });
  });

  it('filters tasks without including cancelled work in open or overdue views', () => {
    expect(filterCalendarTasks(tasks, 'all', now).map(task => task.id)).toEqual([
      'open-today', 'overdue', 'completed', 'cancelled', 'no-due-date',
    ]);
    expect(filterCalendarTasks(tasks, 'open', now).map(task => task.id)).toEqual(['open-today', 'overdue', 'no-due-date']);
    expect(filterCalendarTasks(tasks, 'due-today', now).map(task => task.id)).toEqual(['open-today', 'completed']);
    expect(filterCalendarTasks(tasks, 'overdue', now).map(task => task.id)).toEqual(['overdue']);
    expect(filterCalendarTasks(tasks, 'completed', now).map(task => task.id)).toEqual(['completed']);
    expect(filterCalendarTasks(tasks, 'no-due-date', now).map(task => task.id)).toEqual(['no-due-date']);
  });
});
