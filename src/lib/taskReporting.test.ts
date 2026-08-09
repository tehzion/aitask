import { describe, expect, it } from 'vitest';
import type { Task, User } from '../types';
import {
  getAgencyPulseMetrics,
  getNeedsAttentionTasks,
  getOperationsPeriod,
  getRecentCompletionTasks,
  getTeamMemberTaskGroups,
  getTeamWorkloadSummaries,
  getTrackedWeeklyCompletions,
} from './taskReporting';

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1',
  clientName: 'Acme',
  serviceType: 'Design',
  title: 'Campaign artwork',
  description: '',
  department: 'Designer',
  assignedTo: 'staff-1',
  createdBy: 'admin-1',
  startDate: '2026-07-27',
  dueDate: '2026-07-31',
  priority: 'Medium',
  status: 'Pending',
  completionPercentage: 0,
  isCompleted: false,
  revisionCount: 0,
  clientApprovalStatus: 'Pending',
  isRecurring: false,
  ...overrides,
});

const users: User[] = [
  { id: 'staff-1', name: 'Alex', role: 'Staff', departments: ['Designer'], department: 'Designer' },
  { id: 'staff-2', name: 'Bea', role: 'Staff', departments: ['Video Editor'], department: 'Video Editor' },
  { id: 'client-1', name: 'Client', role: 'Client', departments: ['Client'], department: 'Client', companyName: 'Acme' },
];

describe('Boss operations reporting', () => {
  const now = new Date(2026, 6, 31, 12, 0, 0);

  it('uses a Monday-to-Sunday local week and displays the exact range', () => {
    const period = getOperationsPeriod(now);
    expect(period.start.getDay()).toBe(1);
    expect(period.end.getDay()).toBe(0);
    expect(period.label).toBe('27 Jul - 2 Aug 2026');
  });

  it('separates today, week, overdue, and all-time metrics', () => {
    const completedToday = makeTask({
      id: 'completed-today',
      status: 'Completed',
      isCompleted: true,
      completedAt: new Date(2026, 6, 31, 0, 5).toISOString(),
    });
    const completedEarlier = makeTask({
      id: 'completed-earlier',
      dueDate: '2026-07-29',
      status: 'Completed',
      isCompleted: true,
      completedAt: new Date(2026, 6, 28, 23, 55).toISOString(),
    });
    const historical = makeTask({ id: 'historical', status: 'Completed', isCompleted: true, completedAt: undefined });
    const overdue = makeTask({ id: 'overdue', dueDate: '2026-07-26', status: 'In Progress' });
    const waiting = makeTask({ id: 'waiting', dueDate: '', status: 'Waiting Approval' });
    const cancelled = makeTask({ id: 'cancelled', status: 'Cancelled' });
    const metrics = getAgencyPulseMetrics([completedToday, completedEarlier, historical, overdue, waiting, cancelled], now);

    expect(metrics.today).toEqual({ completed: 1, due: 2, open: 0 });
    expect(metrics.week.completed).toBe(2);
    expect(metrics.week.overdue).toBe(1);
    expect(metrics.overall).toEqual({ open: 2, inProgress: 1, waitingApproval: 1, completed: 3 });
    expect(metrics.untrackedHistoricalCompletions).toBe(1);
  });

  it('orders overdue tasks before waiting approval and excludes cancelled work', () => {
    const tasks = [
      makeTask({ id: 'waiting', dueDate: '', status: 'Waiting Approval' }),
      makeTask({ id: 'later-overdue', dueDate: '2026-07-20' }),
      makeTask({ id: 'earlier-overdue', dueDate: '2026-07-10' }),
      makeTask({ id: 'cancelled', dueDate: '2026-07-01', status: 'Cancelled' }),
    ];
    expect(getNeedsAttentionTasks(tasks, now).map(task => task.id))
      .toEqual(['earlier-overdue', 'later-overdue', 'waiting']);
  });

  it('excludes untracked historical completions from period lists and charts', () => {
    const tracked = makeTask({
      id: 'tracked',
      status: 'Completed',
      isCompleted: true,
      completedAt: new Date(2026, 6, 31, 9, 0).toISOString(),
    });
    const historical = makeTask({ id: 'historical', status: 'Completed', isCompleted: true });

    expect(getRecentCompletionTasks([tracked, historical], 'week', now).map(task => task.id)).toEqual(['tracked']);
    expect(getTrackedWeeklyCompletions([tracked, historical], now, 1)[0]?.completed).toBe(1);
  });

  it('summarizes every internal member without treating clients as team workload', () => {
    const tasks = [
      makeTask({ id: 'today', dueDate: '2026-07-31' }),
      makeTask({ id: 'overdue', dueDate: '2026-07-25', status: 'In Progress' }),
      makeTask({ id: 'review', dueDate: '', status: 'Waiting Approval' }),
      makeTask({
        id: 'completed',
        status: 'Completed',
        isCompleted: true,
        completedAt: new Date(2026, 6, 30, 10, 0).toISOString(),
      }),
    ];

    const summaries = getTeamWorkloadSummaries(tasks, users, 'week', now);

    expect(summaries.map(summary => summary.member.id)).toEqual(['staff-1', 'staff-2']);
    expect(summaries[0]).toMatchObject({
      dueToday: 1,
      dueThisWeek: 1,
      open: 3,
      overdue: 1,
      waitingApproval: 1,
      completedThisWeek: 1,
      periodOpen: 1,
      signal: 'attention',
    });
    expect(summaries[1]).toMatchObject({ open: 0, periodOpen: 0, signal: 'available' });
  });

  it('groups a member task list without duplicating overdue, today, and future work', () => {
    const tasks = [
      makeTask({ id: 'overdue', dueDate: '2026-07-25' }),
      makeTask({ id: 'today', dueDate: '2026-07-31' }),
      makeTask({ id: 'week', dueDate: '2026-08-01' }),
      makeTask({ id: 'later', dueDate: '2026-08-05' }),
      makeTask({ id: 'unscheduled', dueDate: '' }),
      makeTask({
        id: 'completed',
        status: 'Completed',
        isCompleted: true,
        completedAt: new Date(2026, 6, 29, 9, 0).toISOString(),
      }),
      makeTask({ id: 'other-member', assignedTo: 'staff-2' }),
    ];

    const groups = getTeamMemberTaskGroups(tasks, 'staff-1', now);

    expect(groups.overdue.map(task => task.id)).toEqual(['overdue']);
    expect(groups.today.map(task => task.id)).toEqual(['today']);
    expect(groups.thisWeek.map(task => task.id)).toEqual(['week']);
    expect(groups.later.map(task => task.id)).toEqual(['later']);
    expect(groups.noDueDate.map(task => task.id)).toEqual(['unscheduled']);
    expect(groups.completedThisWeek.map(task => task.id)).toEqual(['completed']);
  });
});
