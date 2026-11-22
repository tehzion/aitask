import { describe, expect, it } from 'vitest';
import type { Task, User } from '../types';
import { getPersonalReviewQueues } from './pmDashboard';

const boss = { id: 'boss', name: 'Boss', role: 'Project Manager', isSuperAdmin: true, department: 'Management', departments: ['Management'] } as unknown as User;
const waiting = (id: string, submitted: string) => ({
  id, title: id, clientName: 'Co', status: 'Waiting Approval', isCompleted: false, department: 'Management', assignedTo: 'worker', createdBy: 'worker',
  visibility: 'internal', workState: { reviewRequestedAt: submitted }, predecessorTaskIds: [],
}) as unknown as Task;

describe('review queue order', () => {
  it('lists the longest-waiting submission first', () => {
    const tasks = [waiting('newest', '2026-11-22T00:00:00Z'), waiting('oldest', '2026-11-18T00:00:00Z'), waiting('middle', '2026-11-20T00:00:00Z')];
    const { mine, department } = getPersonalReviewQueues(tasks, { user: boss, users: [boss] });
    const ids = (mine.length ? mine : department).map(task => task.id);
    expect(ids).toEqual(['oldest', 'middle', 'newest']);
  });
});
