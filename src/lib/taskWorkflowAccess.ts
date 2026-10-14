import type { CustomRole, Task, User } from '../types';
import { canEditTask, isBossKoo, isHodUser, type VisibilityScope } from './access';
import { isMemberInDepartment } from './departments';

export const canReviewTaskInternally = (user: User | null | undefined, task: Task, roles: CustomRole[] = [], scope: VisibilityScope = {}) => Boolean(user
  && (isBossKoo(user) || (isHodUser(user, roles) && isMemberInDepartment(user, task.department))
    || (user.role === 'Project Manager' && task.department === 'Designer'
      && (task.reviewAccess ? task.reviewAccess.actorId === user.id && task.reviewAccess.canApprove
        : Boolean(scope.users && getDepartmentReviewers(scope.users, task, roles, scope).some(reviewer => reviewer.id === user.id))))));

export const canRequestTaskRevision = (user: User | null | undefined, task: Task, roles: CustomRole[] = []) => Boolean(user
  && (user.role === 'Project Manager' || canReviewTaskInternally(user, task, roles)));

export const taskTransitionError = (user: User | null | undefined, before: Task | undefined, after: Pick<Task, 'status' | 'isCompleted' | 'department'> & Partial<Task>, roles: CustomRole[] = [], scope: VisibilityScope = {}) => {
  const protectedOutput = before?.status === 'Approved' ? ['title', 'description', 'notes', 'attachmentLink', 'attachmentName'] as const
    : before?.status === 'Completed' ? ['title', 'description', 'attachmentLink', 'attachmentName'] as const : [];
  if (before && ['Approved', 'Completed'].includes(after.status) && protectedOutput.some(field => Object.prototype.hasOwnProperty.call(after, field) && (before[field] || '') !== (after[field] || ''))) return 'Ask the HOD or project manager to return approved work for revision.';
  if (before && before.status !== after.status && ['Approved', 'Completed'].includes(after.status)
    && ['assignedTo', 'department'].some(field => Object.prototype.hasOwnProperty.call(after, field) && before[field as 'assignedTo' | 'department'] !== after[field as 'assignedTo' | 'department'])) return 'Reassign work before submitting it for review.';
  if (before?.status === after.status && before.isCompleted === after.isCompleted) return undefined;
  if (after.status === 'Approved' && (!before || before.status !== 'Waiting Approval'
    || !canReviewTaskInternally(user, before, roles, scope))) return 'Only the department reviewer can approve submitted work.';
  if ((after.status === 'Completed' || after.isCompleted) && !isBossKoo(user)
    && (user?.role !== 'Project Manager' || before?.status !== 'Approved')) return 'Only a project manager can confirm completion after internal approval.';
  if (before && ['Waiting Approval', 'Approved', 'Completed'].includes(before.status) && !canRequestTaskRevision(user, before, roles)) return 'Ask the HOD or project manager to return approved work for revision.';
  if (before && after.status === 'Revision' && !canRequestTaskRevision(user, before, roles)) return 'Ask the HOD or project manager to return approved work for revision.';
  return undefined;
};

export const getTaskStatusOptions = (user: User | null | undefined, task: Task, statuses: readonly string[], roles: CustomRole[] = [], scope: VisibilityScope = {}) => [...new Set([...statuses, 'Approved', task.status].map(status => status.toLowerCase() === 'approved' ? 'Approved' : status))]
  .filter(status => status === task.status || !taskTransitionError(user, task, { status, isCompleted: status === 'Completed', department: task.department }, roles, scope));

// Task access still applies at every store/database mutation boundary.
export const canApproveTaskInternally = (user: User | null | undefined, task: Task, roles: CustomRole[] = [], scope: Parameters<typeof canEditTask>[3] = {}) =>
  task.status === 'Waiting Approval' && canReviewTaskInternally(user, task, roles, scope) && canEditTask(user, task, roles, scope);

export const TASK_HOD_REQUIRED = 'No reviewer is configured for this task. Ask your project manager to configure a reviewer before submitting.';
export const getDepartmentReviewers = (users: readonly User[], task: Pick<Task, 'department'> & Partial<Task>, roles: CustomRole[] = [], scope: VisibilityScope = {}) => {
  const hods = users.filter(user => isHodUser(user, roles) && isMemberInDepartment(user, task.department));
  if (hods.length || task.department !== 'Designer') return hods;
  return users.filter(user => user.role === 'Project Manager' && canEditTask(user, task as Task, roles, scope));
};
