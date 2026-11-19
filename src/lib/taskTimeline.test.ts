import { describe, expect, it } from 'vitest';
import { buildTaskTimeline } from './taskTimeline';
import type { Task, User } from '../types';

const users = [
  { id: 'pm', name: 'Pat PM', role: 'Project Manager' },
  { id: 'hod', name: 'Hana HOD', role: 'HOD' },
  { id: 'staff', name: 'Sam Staff', role: 'Staff' },
  { id: 'client', name: 'Casey Client', role: 'Client' },
] as User[];

const task = {
  id: 't1', assignedTo: 'staff', assignedBy: 'hod', assignedAt: '2026-11-01T09:00:00Z',
  internalReview: { reviewedBy: 'hod', reviewedAt: '2026-11-02T09:00:00Z', inputVersions: [] },
  approvalHistory: [
    { id: 'a2', userId: 'client', status: 'Approved', createdAt: '2026-11-04T09:00:00Z' },
    { id: 'a1', userId: 'client', status: 'Rejected', note: 'Logo too small', createdAt: '2026-11-03T09:00:00Z' },
  ],
  clientRating: { stars: 5, comment: 'Great', ratedBy: 'client', ratedAt: '2026-11-04T09:00:00Z' },
  completedAt: '2026-11-05T09:00:00Z', isCompleted: true,
} as Task;

describe('buildTaskTimeline', () => {
  it('lists the whole story newest first for the team', () => {
    const kinds = buildTaskTimeline(task, users, 'team').map(entry => entry.kind);
    expect(kinds).toEqual(['completed', 'rated', 'client_approved', 'client_changes', 'internal_review', 'assigned']);
  });

  it('numbers revision rounds in the order they happened', () => {
    const changes = buildTaskTimeline({ ...task, approvalHistory: [
      { id: 'r2', userId: 'client', status: 'Rejected', createdAt: '2026-11-04T09:00:00Z' },
      { id: 'r1', userId: 'client', status: 'Rejected', createdAt: '2026-11-03T09:00:00Z' },
    ] } as Task, users, 'team').filter(entry => entry.kind === 'client_changes');
    expect(changes.map(entry => [entry.id, entry.revision])).toEqual([['r2', 2], ['r1', 1]]);
  });

  it('keeps staff and internal steps away from a client', () => {
    const entries = buildTaskTimeline({ ...task, approvalHistory: [
      ...task.approvalHistory!, { id: 'a3', userId: 'staff', status: 'Approved', createdAt: '2026-11-04T10:00:00Z' },
    ] } as Task, users, 'client');
    expect(entries.map(entry => entry.kind)).not.toContain('assigned');
    expect(entries.map(entry => entry.kind)).not.toContain('internal_review');
    expect(entries.find(entry => entry.id === 'a3')?.actorName).toBeUndefined();
    expect(entries.find(entry => entry.id === 'a1')?.actorName).toBe('Casey Client');
  });

  it('ignores pending decisions and invalid dates', () => {
    const entries = buildTaskTimeline({ ...task, assignedAt: 'nope', internalReview: undefined, clientRating: undefined, isCompleted: false, approvalHistory: [
      { id: 'p', userId: 'client', status: 'Pending', createdAt: '2026-11-03T09:00:00Z' },
      { id: 'bad', userId: 'client', status: 'Approved', createdAt: 'garbage' },
    ] } as Task, users, 'team');
    expect(entries).toEqual([]);
  });
});
