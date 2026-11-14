import { describe, expect, it } from 'vitest';
import type { Deliverable, Project, ServiceCycle, Task, User } from '../types';
import { getCyclePace, getProjectsWithoutPm, getRenewalSignals, getStuckWork } from './opsSignals';

const today = new Date(2026, 9, 28);
const task = (overrides: Partial<Task>): Task => ({
  id: 't', title: 'Task', description: '', clientName: 'Co', serviceType: 'Design', department: 'Designer', createdBy: 'pm',
  assignedTo: 'staff', startDate: '2026-10-01', dueDate: '2026-10-30', priority: 'Medium', status: 'Pending', isCompleted: false,
  completionPercentage: 0, revisionCount: 0, clientApprovalStatus: 'Pending', isRecurring: false, ...overrides,
}) as Task;
const cycle = (overrides: Partial<ServiceCycle> = {}): ServiceCycle => ({
  id: 'c1', clientId: 'co', clientName: 'Co', planId: 'p1', planRevision: 1, periodStart: '2026-10-01', periodEnd: '2026-10-31',
  status: 'Published', currency: 'MYR', serviceItems: [], discountType: 'none', discountValue: 0, taxRateBps: 0,
  createdAt: '', updatedAt: '', ...overrides,
});

describe('stuck work', () => {
  it('lists work overdue by more than seven days, oldest first, and open work with no assignee', () => {
    const tasks = [
      task({ id: 'recent', dueDate: '2026-10-24' }),
      task({ id: 'old', dueDate: '2026-10-10' }),
      task({ id: 'older', dueDate: '2026-09-01' }),
      task({ id: 'done', dueDate: '2026-09-01', status: 'Completed', isCompleted: true }),
      task({ id: 'nobody', assignedTo: '' }),
    ];
    const stuck = getStuckWork(tasks, today);
    expect(stuck.overdueLong.map(item => item.id)).toEqual(['older', 'old']);
    expect(stuck.unassigned.map(item => item.id)).toEqual(['nobody']);
  });
});

describe('cycle pace', () => {
  it('flags a month at risk once deliveries fall well behind the calendar', () => {
    expect(getCyclePace(cycle(), 1, 10, today)).toBe('atRisk');
    expect(getCyclePace(cycle(), 7, 10, today)).toBe('onTrack');
    expect(getCyclePace(cycle(), 0, 10, new Date(2026, 9, 5))).toBe('onTrack');
    expect(getCyclePace(cycle(), 10, 10, today)).toBe('done');
    expect(getCyclePace(cycle({ periodEnd: '2026-10-20' }), 4, 5, today)).toBe('missed');
    expect(getCyclePace(cycle(), 0, 0, today)).toBeUndefined();
  });
});

describe('renewal signals', () => {
  it('summarises on-time delivery and revisions over recent cycles', () => {
    const cycles = [cycle({ id: 'c1' }), cycle({ id: 'c0', periodStart: '2026-09-01', periodEnd: '2026-09-30' })];
    const deliverables = [
      { id: 'd1', clientId: 'co', cycleId: 'c1', status: 'Delivered', deliveredAt: '2026-10-20T03:00:00Z' },
      { id: 'd2', clientId: 'co', cycleId: 'c0', status: 'Delivered', deliveredAt: '2026-10-05T03:00:00Z' },
      { id: 'd3', clientId: 'co', cycleId: 'c0', status: 'In Progress' },
    ] as Deliverable[];
    const tasks = [task({ id: 'a', clientId: 'co', serviceCycleId: 'c1', revisionCount: 1 }), task({ id: 'b', clientId: 'co', serviceCycleId: 'c0' })];
    const signals = getRenewalSignals({ id: 'p1', clientId: 'co' }, cycles, deliverables, tasks);
    expect(signals).toMatchObject({ cyclesReviewed: 2, deliverables: 3 });
    expect(signals.onTimeRate).toBeCloseTo(1 / 3);
    expect(signals.revisionRate).toBe(0.5);
  });
});

describe('projects without a Project Manager', () => {
  it('treats Boss Koo as the administrator, not the project manager', () => {
    const users = [
      { id: 'boss', name: 'Boss', role: 'Project Manager', isSuperAdmin: true },
      { id: 'pm', name: 'PM', role: 'Project Manager' },
    ] as User[];
    const base = { clientName: 'Co', projectName: 'P', services: [], startDate: '', deadline: '' };
    const projects = [
      { ...base, id: 'boss-only', createdBy: 'boss' },
      { ...base, id: 'pm-created', createdBy: 'pm' },
      { ...base, id: 'assigned', createdBy: 'boss', projectManagerIds: ['pm'] },
      { ...base, id: 'empty-list', createdBy: 'pm', projectManagerIds: [] },
      { ...base, id: 'closed', createdBy: 'boss', status: 'Closed' },
    ] as Project[];
    expect(getProjectsWithoutPm(projects, users).map(project => project.id)).toEqual(['boss-only', 'empty-list']);
  });
});
