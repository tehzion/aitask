import { describe, expect, it, vi } from 'vitest';
import type { Task, User } from '../types';

vi.mock('./access', () => ({
  getVisibleTasks: (_user: User, tasks: Task[]) => tasks.filter(task => task.clientId !== 'hidden'),
  isHodUser: (user: User) => user.role === 'HOD',
}));
vi.mock('./taskWorkflowAccess', async importOriginal => ({
  ...await importOriginal<typeof import('./taskWorkflowAccess')>(),
  // The real check is covered by its own tests; here the HOD reviews the
  // department lane ('hod') and never the PM lane ('pm').
  canApproveTaskInternally: (_user: User, task: Task) => task.status === 'Waiting Approval' && task.approvalMode === 'hod',
}));

const { getHodWaitingCounts } = await import('./hodWaiting');

const hod = { id: 'hod', role: 'HOD', name: 'Mabel' } as User;
const task = (id: string, extra: Partial<Task> = {}) => ({ id, title: id, clientId: 'c1', status: 'Pending', isCompleted: false, ...extra } as Task);

describe('HOD waiting-for-me count', () => {
  it('counts tasks to assign and reviews where the HOD is the reviewer', () => {
    const tasks = [
      task('assign', { assignmentState: 'pending_hod', responsibleHodId: 'hod' }),
      task('other-hod', { assignmentState: 'pending_hod', responsibleHodId: 'someone-else' }),
      task('handled', { assignmentState: 'pending_hod', responsibleHodId: 'hod', assignedTo: 'hod', status: 'In Progress' }),
      task('hidden', { assignmentState: 'pending_hod', responsibleHodId: 'hod', clientId: 'hidden' }),
      task('review', { status: 'Waiting Approval', approvalMode: 'hod' }),
      task('pm-review', { status: 'Waiting Approval', approvalMode: 'pm' }),
    ];
    expect(getHodWaitingCounts(hod, tasks)).toEqual({ toAssign: 1, toReview: 1, total: 2 });
  });

  it('is empty for anyone who is not an HOD', () => {
    expect(getHodWaitingCounts({ ...hod, role: 'Staff' } as User, [task('a', { assignmentState: 'pending_hod', responsibleHodId: 'hod' })]).total).toBe(0);
    expect(getHodWaitingCounts(null, []).total).toBe(0);
  });
});
