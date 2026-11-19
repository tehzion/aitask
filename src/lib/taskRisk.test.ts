import { describe, expect, it } from 'vitest';
import { getTaskRisk, isTaskAtRisk } from './taskRisk';
import type { Task } from '../types';

const now = new Date(2026, 10, 19, 10, 0, 0);
const base = { id: 't', status: 'In Progress', isCompleted: false, dueDate: '2026-11-20', updatedAt: '2026-11-19T08:00:00' } as Task;

describe('getTaskRisk', () => {
  it('flags unstarted work due within two days', () => {
    expect(getTaskRisk({ ...base, status: 'Pending', dueDate: '2026-11-21' }, now)).toBe('not_started');
  });
  it('flags quiet in-progress work due soon', () => {
    expect(getTaskRisk({ ...base, updatedAt: '2026-11-17T09:00:00' }, now)).toBe('quiet');
  });
  it('leaves recently touched in-progress work alone', () => {
    expect(isTaskAtRisk(base, now)).toBe(false);
  });
  it('leaves work with a distant or missing due date alone', () => {
    expect(isTaskAtRisk({ ...base, status: 'Pending', dueDate: '2026-11-30' }, now)).toBe(false);
    expect(isTaskAtRisk({ ...base, status: 'Pending', dueDate: '' }, now)).toBe(false);
  });
  it('reports overdue work as overdue, not at risk', () => {
    expect(isTaskAtRisk({ ...base, status: 'Pending', dueDate: '2026-11-18' }, now)).toBe(false);
  });
  it('does not blame the doer while the work waits on a reviewer or client', () => {
    expect(isTaskAtRisk({ ...base, status: 'Waiting Approval', updatedAt: '2026-11-10T00:00:00' }, now)).toBe(false);
  });
  it('ignores finished and cancelled work', () => {
    expect(isTaskAtRisk({ ...base, status: 'Pending', isCompleted: true, completedAt: '2026-11-18T00:00:00Z' }, now)).toBe(false);
    expect(isTaskAtRisk({ ...base, status: 'Cancelled' }, now)).toBe(false);
  });
  it('counts a task due today that has not started', () => {
    expect(getTaskRisk({ ...base, status: 'Pending', dueDate: '2026-11-19' }, now)).toBe('not_started');
  });
});
