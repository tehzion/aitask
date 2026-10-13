import type { CustomRole, Task, User } from '../types';
import { canEditTask, isBossKoo, isHodUser } from './access';
import { isMemberInDepartment } from './departments';

export const canReviewTaskInternally = (user: User | null | undefined, task: Task, roles: CustomRole[] = []) => Boolean(user
  && (isBossKoo(user) || (isHodUser(user, roles) && isMemberInDepartment(user, task.department))));

export const canRequestTaskRevision = (user: User | null | undefined, task: Task, roles: CustomRole[] = []) => Boolean(user
  && (user.role === 'Project Manager' || canReviewTaskInternally(user, task, roles)));

export const taskTransitionError = (user: User | null | undefined, before: Task | undefined, after: Pick<Task, 'status' | 'isCompleted' | 'department'>, roles: CustomRole[] = []) => {
  if (before?.status === after.status && before.isCompleted === after.isCompleted) return undefined;
  if (after.status === 'Approved' && (!before || before.status !== 'Waiting Approval'
    || !canReviewTaskInternally(user, before, roles))) return 'Only the department HOD can approve submitted work.';
  if ((after.status === 'Completed' || after.isCompleted) && !isBossKoo(user)
    && (user?.role !== 'Project Manager' || before?.status !== 'Approved')) return 'Only a project manager can confirm completion after HOD approval.';
  if (before && ['Waiting Approval', 'Approved', 'Completed'].includes(before.status) && !canRequestTaskRevision(user, before, roles)) return 'Ask the HOD or project manager to return approved work for revision.';
  if (before && after.status === 'Revision' && !canRequestTaskRevision(user, before, roles)) return 'Ask the HOD or project manager to return approved work for revision.';
  return undefined;
};

export const getTaskStatusOptions = (user: User | null | undefined, task: Task, statuses: readonly string[], roles: CustomRole[] = []) => [...new Set([...statuses, 'Approved', task.status].map(status => status.toLowerCase() === 'approved' ? 'Approved' : status))]
  .filter(status => status === task.status || !taskTransitionError(user, task, { status, isCompleted: status === 'Completed', department: task.department }, roles));

// Task access still applies at every store/database mutation boundary.
export const canApproveTaskInternally = (user: User | null | undefined, task: Task, roles: CustomRole[] = [], scope: Parameters<typeof canEditTask>[3] = {}) =>
  task.status === 'Waiting Approval' && canReviewTaskInternally(user, task, roles) && canEditTask(user, task, roles, scope);
