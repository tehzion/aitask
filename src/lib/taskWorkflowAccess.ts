import type { CustomRole, Department, Task, User } from '../types';
import { canEditTask, isBossKoo, isHodUser, isTaskInOwnedPortfolio, type VisibilityScope } from './access';
import { isEligibleTaskAssignee, isMemberInDepartment } from './departments';

export const isIndependentTaskReviewer = (user: User, task: Partial<Task>) => user.id !== task.assignedTo && user.id !== task.workState?.reviewRequestedBy;
export const canBeTaskReviewLead = (user: User, task: Task, roles: CustomRole[] = [], scope: VisibilityScope = {}) => user.hasLogin !== false
  && ((isHodUser(user, roles) && isMemberInDepartment(user, task.department)) || user.role === 'Project Manager' && canEditTask(user, task, roles, scope));
const isResponsibleProjectManager = (user: User | null | undefined, task: Task, scope: VisibilityScope) => Boolean(user && (isBossKoo(user) || user.role === 'Project Manager'
  && (task.createdBy === user.id || task.assignedTo === user.id || isTaskInOwnedPortfolio(user, task, scope))));
export const canManageTaskReview = (user: User | null | undefined, task: Task, roles: CustomRole[] = [], scope: VisibilityScope = {}) => Boolean(user && isResponsibleProjectManager(user, task, scope) && canEditTask(user, task, roles, scope));
export const canReviewTaskInternally = (user: User | null | undefined, task: Task, roles: CustomRole[] = [], scope: VisibilityScope = {}) => {
  if (!user || user.hasLogin === false || !isIndependentTaskReviewer(user, task)) return false;
  if (isBossKoo(user)) return true;
  if (task.reviewAccess && (!task.reviewAccess.expiresAt || Date.parse(task.reviewAccess.expiresAt) > Date.now())) return task.reviewAccess.actorId === user.id && task.reviewAccess.canApprove;
  const cover = task.reviewCover && Date.parse(task.reviewCover.expiresAt) > Date.now() ? task.reviewCover : undefined;
  if (cover && scope.users?.some(member => member.id === cover.reviewerId && canBeTaskReviewLead(member, task, roles, scope) && isIndependentTaskReviewer(member, task))) return user.id === cover.reviewerId;
  return isHodUser(user, roles) && isMemberInDepartment(user, task.department)
    || Boolean(scope.users && getDepartmentReviewers(scope.users, task, roles, scope).some(reviewer => reviewer.id === user.id));
};

export const canRequestTaskRevision = (user: User | null | undefined, task: Task, roles: CustomRole[] = []) => Boolean(user
  && (user.role === 'Project Manager' || canReviewTaskInternally(user, task, roles)));

export const canCompleteWithoutInternalApproval = (task: Partial<Task> | undefined) => task?.status === 'Waiting Approval'
  && task.requiresInternalApproval === false && task.workflowStepKind !== 'internal_review';

export const taskTransitionError = (user: User | null | undefined, before: Task | undefined, after: Pick<Task, 'status' | 'isCompleted' | 'department'> & Partial<Task>, roles: CustomRole[] = [], scope: VisibilityScope = {}) => {
  const protectedOutput = before?.status === 'Approved' ? ['title', 'description', 'notes', 'attachmentLink', 'attachmentName', 'outputAttachments'] as const
    : before?.status === 'Completed' ? ['title', 'description', 'attachmentLink', 'attachmentName', 'outputAttachments'] as const : [];
  if (before && ['Approved', 'Completed'].includes(after.status) && protectedOutput.some(field => Object.prototype.hasOwnProperty.call(after, field) && JSON.stringify(before[field] || '') !== JSON.stringify(after[field] || ''))) return 'Ask the HOD or project manager to return approved work for revision.';
  if (before && before.status !== after.status && ['Approved', 'Completed'].includes(after.status)
    && ['assignedTo', 'department'].some(field => Object.prototype.hasOwnProperty.call(after, field) && before[field as 'assignedTo' | 'department'] !== after[field as 'assignedTo' | 'department'])) return 'Reassign work before submitting it for review.';
  if (before?.status === after.status && before.isCompleted === after.isCompleted) return undefined;
  const override = Boolean(user && isBossKoo(user) && after.reviewOverrideReason?.trim() && after.reviewOverrideReason.trim().length <= 2000);
  if (after.status === 'Approved' && (!before || before.status !== 'Waiting Approval'
    || (!canReviewTaskInternally(user, before, roles, scope) && !override))) return 'Only the department reviewer can approve submitted work.';
  if ((after.status === 'Completed' || after.isCompleted) && !isBossKoo(user)
    && (user?.role !== 'Project Manager' || !before || !isResponsibleProjectManager(user, before, scope)
      || (before.status !== 'Approved' && !canCompleteWithoutInternalApproval(before)))) return 'Only a project manager can confirm completion after internal approval.';
  if (before && ['Waiting Approval', 'Approved', 'Completed'].includes(before.status) && !canRequestTaskRevision(user, before, roles)) return 'Ask the HOD or project manager to return approved work for revision.';
  if (before && after.status === 'Revision' && !canRequestTaskRevision(user, before, roles)) return 'Ask the HOD or project manager to return approved work for revision.';
  return undefined;
};

export const getTaskStatusOptions = (user: User | null | undefined, task: Task, statuses: readonly string[], roles: CustomRole[] = [], scope: VisibilityScope = {}) => [...new Set([...statuses, 'Approved', 'Completed', task.status].map(status => status.toLowerCase() === 'approved' ? 'Approved' : status.toLowerCase() === 'completed' ? 'Completed' : status))]
  .filter(status => status === task.status || !taskTransitionError(user, task, { status, isCompleted: status === 'Completed', department: task.department }, roles, scope));

// Task access still applies at every store/database mutation boundary.
export const canApproveTaskInternally = (user: User | null | undefined, task: Task, roles: CustomRole[] = [], scope: Parameters<typeof canEditTask>[3] = {}) =>
  task.status === 'Waiting Approval' && canReviewTaskInternally(user, task, roles, scope) && canEditTask(user, task, roles, scope);

export const TASK_HOD_REQUIRED = 'No reviewer is configured for this task. Ask your project manager to configure a reviewer before submitting.';
export const TASK_HOD_ASSIGNMENT_REQUIRED = 'Assign this task to the department HOD first. The HOD then delegates it to staff.';

/** True when the task's department has at least one active HOD to delegate through. */
export const departmentHasHod = (department: Department | undefined, users: readonly User[], roles: CustomRole[] = []) =>
  Boolean(department) && users.some(user => user.hasLogin !== false && isHodUser(user, roles) && isMemberInDepartment(user, department!));

/**
 * Stage 1 of the workflow: a Project Manager hands work to the department HOD,
 * who then delegates to staff (stage 2). When a department has an HOD, a PM may
 * not assign its tasks straight to staff. Departments without an HOD keep the
 * project-manager fallback and allow direct staff assignment. Boss Koo and
 * non-PM actors are unaffected (HOD/Staff delegation rules apply elsewhere).
 */
export const taskAssignmentStageError = (
  actor: User | null | undefined,
  task: Pick<Task, 'department'> | undefined,
  nextAssigneeId: string | undefined,
  users: readonly User[],
  roles: CustomRole[] = [],
  options: { allowDirectStaff?: boolean } = {},
): string | undefined => {
  if (!actor || isBossKoo(actor) || actor.role !== 'Project Manager') return undefined;
  if (options.allowDirectStaff) return undefined;
  const nextAssignee = nextAssigneeId ? users.find(user => user.id === nextAssigneeId) : undefined;
  if (!nextAssignee) return undefined;
  if (isHodUser(nextAssignee, roles)) return undefined;
  if (nextAssignee.role === 'Project Manager') return undefined;
  return departmentHasHod(task?.department, users, roles) ? TASK_HOD_ASSIGNMENT_REQUIRED : undefined;
};

/**
 * Assignee options for a task in a department, filtered by eligibility and the
 * stage-1 HOD-first rule so the UI never offers a choice the store/DB rejects.
 */
export const assignableTaskAssignees = (
  actor: User | null | undefined,
  department: Department | undefined,
  users: readonly User[],
  roles: CustomRole[] = [],
  options: { allowDirectStaff?: boolean } = {},
): User[] => {
  if (!department) return [];
  return users.filter(user => isEligibleTaskAssignee(user, department)
    && !taskAssignmentStageError(actor, { department }, user.id, users, roles, options));
};
export const getDepartmentReviewers = (users: readonly User[], task: Pick<Task, 'department'> & Partial<Task>, roles: CustomRole[] = [], scope: VisibilityScope = {}) => {
  const eligible = users.filter(user => user.hasLogin !== false && isIndependentTaskReviewer(user, task));
  const cover = task.reviewCover && Date.parse(task.reviewCover.expiresAt) > Date.now() ? eligible.find(user => user.id === task.reviewCover?.reviewerId && canBeTaskReviewLead(user, task as Task, roles, scope)) : undefined;
  if (cover) return [cover];
  const hods = eligible.filter(user => isHodUser(user, roles) && isMemberInDepartment(user, task.department));
  if (hods.length) return hods;
  const pms = eligible.filter(user => user.role === 'Project Manager' && canEditTask(user, task as Task, roles, scope));
  return pms.length ? pms : users.filter(user => user.hasLogin !== false && isBossKoo(user));
};
