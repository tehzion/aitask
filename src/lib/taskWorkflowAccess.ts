import type { CustomRole, Department, Project, Task, User } from '../types';
import { canAssignTasksToOthers, canEditTask, isBossKoo, isHodUser, isTaskInOwnedPortfolio, type VisibilityScope } from './access';
import { isEligibleTaskAssignee, isMemberInDepartment } from './departments';
import { getEffectiveTaskApprovalMode } from './projectManagement';

export const TASK_ASSIGNMENT_LOCKED_STATUSES = ['Waiting Approval', 'Approved', 'Completed', 'Cancelled'] as const;
export type TaskAssignmentLockedStatus = typeof TASK_ASSIGNMENT_LOCKED_STATUSES[number];

export const isTaskAssignmentLocked = (task: Pick<Task, 'status' | 'isCompleted'>) => task.isCompleted
  || TASK_ASSIGNMENT_LOCKED_STATUSES.includes(task.status as TaskAssignmentLockedStatus);

export const isIndependentTaskReviewer = (user: User, task: Partial<Task>) => user.id !== task.assignedTo && user.id !== task.workState?.reviewRequestedBy;
export const canBeTaskReviewLead = (user: User, task: Task, roles: CustomRole[] = [], scope: VisibilityScope = {}) => user.hasLogin !== false
  && ((isHodUser(user, roles) && isMemberInDepartment(user, task.department)) || user.role === 'Project Manager' && canEditTask(user, task, roles, scope));
const isResponsibleProjectManager = (user: User | null | undefined, task: Task, scope: VisibilityScope) => Boolean(user && (isBossKoo(user) || user.role === 'Project Manager'
  && (task.projectId
    ? isTaskInOwnedPortfolio(user, task, scope)
    : task.createdBy === user.id || task.assignedTo === user.id || !task.assignedTo && task.assignedBy === user.id || isTaskInOwnedPortfolio(user, task, scope))));
export const canManageTaskReview = (user: User | null | undefined, task: Task, roles: CustomRole[] = [], scope: VisibilityScope = {}) => Boolean(user && isResponsibleProjectManager(user, task, scope) && canEditTask(user, task, roles, scope));
export const canReviewTaskInternally = (user: User | null | undefined, task: Task, roles: CustomRole[] = [], scope: VisibilityScope = {}) => {
  if (!user || user.hasLogin === false) return false;
  const approvalMode = getEffectiveTaskApprovalMode(task, scope.projects || []);
  if (approvalMode === 'none') return false;
  // Boss Koo must stay independent or provide an explicit self-approval reason.
  if (isBossKoo(user)) return isIndependentTaskReviewer(user, task);
  // Prefer the actor-bound server decision when a hosted context is present.
  if (task.reviewAccess && (!task.reviewAccess.expiresAt || Date.parse(task.reviewAccess.expiresAt) > Date.now())) return task.reviewAccess.actorId === user.id && task.reviewAccess.canApprove;
  // The responsible PM is the project-scoped authority above the HOD lane,
  // including when the PM requested or was assigned the review.
  if (user.role === 'Project Manager' && canManageTaskReview(user, task, roles, scope)) return true;
  if (approvalMode === 'pm') return false;
  if (!isIndependentTaskReviewer(user, task)) return false;
  const cover = task.reviewCover && Date.parse(task.reviewCover.expiresAt) > Date.now() ? task.reviewCover : undefined;
  if (cover && scope.users?.some(member => member.id === cover.reviewerId && canBeTaskReviewLead(member, task, roles, scope) && isIndependentTaskReviewer(member, task))) return user.id === cover.reviewerId;
  return canEditTask(user, task, roles, scope)
    && (isHodUser(user, roles) && isMemberInDepartment(user, task.department)
      || Boolean(scope.users && getDepartmentReviewers(scope.users, task, roles, scope).some(reviewer => reviewer.id === user.id)));
};

export const canRequestTaskRevision = (user: User | null | undefined, task: Task, roles: CustomRole[] = [], scope: VisibilityScope = {}) => Boolean(user
  && (isResponsibleProjectManager(user, task, scope) || canReviewTaskInternally(user, task, roles, scope)));

// A task whose responsible project manager opted it out of the internal-approval
// checkpoint. Internal-review workflow steps can never be opted out.
const isApprovalOptOut = (task: Partial<Task> | undefined) => task?.requiresInternalApproval === false
  && task.workflowStepKind !== 'internal_review';
const canSkipInternalApproval = (task: Partial<Task> | undefined) => task?.status === 'Waiting Approval' && isApprovalOptOut(task);

export const canCompleteWithoutInternalApproval = (task: Partial<Task> | undefined) => canSkipInternalApproval(task);

export const taskTransitionError = (user: User | null | undefined, before: Task | undefined, after: Pick<Task, 'status' | 'isCompleted' | 'department'> & Partial<Task>, roles: CustomRole[] = [], scope: VisibilityScope = {}) => {
  const protectedOutput = before?.status === 'Approved' ? ['title', 'description', 'notes', 'attachmentLink', 'attachmentName', 'outputAttachments'] as const
    : before?.status === 'Completed' ? ['title', 'description', 'attachmentLink', 'attachmentName', 'outputAttachments'] as const : [];
  if (before && ['Approved', 'Completed'].includes(after.status) && protectedOutput.some(field => Object.prototype.hasOwnProperty.call(after, field) && JSON.stringify(before[field] || '') !== JSON.stringify(after[field] || ''))) return 'Ask the HOD or project manager to return approved work for revision.';
  if (before && before.status !== after.status && ['Approved', 'Completed'].includes(after.status)
    && ['assignedTo', 'department'].some(field => Object.prototype.hasOwnProperty.call(after, field) && before[field as 'assignedTo' | 'department'] !== after[field as 'assignedTo' | 'department'])) return 'Reassign work before submitting it for review.';
  if (before?.status === after.status && before.isCompleted === after.isCompleted) return undefined;
  const override = Boolean(user && isBossKoo(user) && after.reviewOverrideReason?.trim() && after.reviewOverrideReason.trim().length <= 2000);
  // HODs and covers handle the department lane; the responsible PM can also
  // approve within their portfolio. Boss Koo's self-approval needs a reason.
  if (after.status === 'Approved' && (!before || before.status !== 'Waiting Approval'
    || (!canReviewTaskInternally(user, before, roles, scope) && !override
      && !(isApprovalOptOut(before) && isResponsibleProjectManager(user, before, scope))))) return 'Only an authorized project manager, department reviewer, or Boss Koo can approve submitted work.';
  // Client review and PM finalization are independent. The responsible PM may
  // complete client-visible work at 100%; customer acceptance remains available
  // as a separate, audited decision and does not have to happen first.
  if ((after.status === 'Completed' || after.isCompleted) && !isBossKoo(user)
    && (user?.role !== 'Project Manager' || !before || !isResponsibleProjectManager(user, before, scope)
      || (before.status !== 'Approved' && !canCompleteWithoutInternalApproval(before)))) return 'Only a project manager can confirm completion after internal approval.';
  if (before && ['Waiting Approval', 'Approved', 'Completed'].includes(before.status) && !canRequestTaskRevision(user, before, roles, scope)) return 'Ask the HOD or project manager to return approved work for revision.';
  if (before && after.status === 'Revision' && !canRequestTaskRevision(user, before, roles, scope)) return 'Ask the HOD or project manager to return approved work for revision.';
  return undefined;
};

export const getTaskStatusOptions = (user: User | null | undefined, task: Task, statuses: readonly string[], roles: CustomRole[] = [], scope: VisibilityScope = {}) => [...new Set([...statuses, 'Approved', 'Completed', task.status].map(status => status.toLowerCase() === 'approved' ? 'Approved' : status.toLowerCase() === 'completed' ? 'Completed' : status))]
  .filter(status => status === task.status || !taskTransitionError(user, task, { status, isCompleted: status === 'Completed', department: task.department }, roles, scope));

// Task access still applies at every store/database mutation boundary.
export const canApproveTaskInternally = (user: User | null | undefined, task: Task, roles: CustomRole[] = [], scope: Parameters<typeof canEditTask>[3] = {}) =>
  task.status === 'Waiting Approval' && canReviewTaskInternally(user, task, roles, scope) && canEditTask(user, task, roles, scope);

export const getTaskAssignmentUnavailableReason = (
  user: User | null | undefined,
  task: Pick<Task, 'status' | 'isCompleted' | 'department'> & Partial<Task>,
  customRoles: CustomRole[] = [],
  scope: VisibilityScope = {},
) => {
  if (task.status === 'Waiting Approval') return 'This task is waiting for approval. Assignment changes are unavailable at this stage.';
  if (task.status === 'Approved') return 'This task has been approved and can no longer be reassigned.';
  if (task.status === 'Completed' || task.isCompleted) return 'This task has been completed and can no longer be reassigned.';
  if (task.status === 'Cancelled') return 'This task has been cancelled and can no longer be reassigned.';
  if (!canAssignTasksToOthers(user, customRoles, task as Task, scope)) return 'Your current role does not have permission to perform this action.';
  return undefined;
};

export const TASK_HOD_REQUIRED = 'No reviewer is configured for this task. Ask your project manager to configure a reviewer before submitting.';
export const TASK_HOD_ASSIGNMENT_REQUIRED = 'Assign this task to the department HOD first. The HOD then delegates it to staff.';

/** True when the task's department has at least one active HOD to delegate through. */
export const departmentHasHod = (department: Department | undefined, users: readonly User[], roles: CustomRole[] = []) =>
  Boolean(department) && users.some(user => user.hasLogin !== false && isHodUser(user, roles) && isMemberInDepartment(user, department!));

/**
 * Resolves HODs who may receive a new task handoff. Project-linked tasks use
 * the project's explicit HOD membership; projectless tasks retain the
 * workspace department fallback used by legacy tasks.
 */
export const eligibleTaskHods = (
  department: Department | undefined,
  project: Project | undefined,
  users: readonly User[],
  roles: CustomRole[] = [],
) => {
  if (!department) return [];
  const projectHodIds = project?.hodMemberIds;
  return users
    .filter(user => user.hasLogin !== false && isHodUser(user, roles) && isMemberInDepartment(user, department))
    .filter(user => !project || projectHodIds === undefined || projectHodIds.includes(user.id))
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
};

export const resolveTaskAssignmentState = (
  assignedTo: string | undefined,
  responsibleHodId: string | undefined,
  assignedUser?: User,
): Task['assignmentState'] => {
  if (!assignedTo && !responsibleHodId) return 'needs_hod';
  if (assignedTo && responsibleHodId && assignedTo === responsibleHodId) return 'pending_hod';
  if (assignedTo && assignedUser && !isHodUser(assignedUser)) return 'assigned_staff';
  return responsibleHodId ? 'pending_hod' : 'needs_hod';
};

/** Staff eligible for HOD delegation within a project and department. */
export const eligibleTaskStaff = (
  department: Department | undefined,
  project: Project | undefined,
  users: readonly User[],
  roles: CustomRole[] = [],
) => {
  if (!department) return [];
  const projectStaffIds = project?.staffMemberIds;
  return users
    .filter(user => user.hasLogin !== false && user.role === 'Staff' && !isHodUser(user, roles))
    .filter(user => isEligibleTaskAssignee(user, department))
    .filter(user => !project || projectStaffIds === undefined || projectStaffIds.includes(user.id))
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
};

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
  const approvalMode = getEffectiveTaskApprovalMode(task, scope.projects || []);
  if (approvalMode === 'none') return [];
  const eligible = users.filter(user => user.hasLogin !== false && isIndependentTaskReviewer(user, task));
  const cover = task.reviewCover && Date.parse(task.reviewCover.expiresAt) > Date.now() ? eligible.find(user => user.id === task.reviewCover?.reviewerId && canBeTaskReviewLead(user, task as Task, roles, scope)) : undefined;
  const hods = eligible.filter(user => isHodUser(user, roles) && isMemberInDepartment(user, task.department));
  const pms = eligible.filter(user => user.role === 'Project Manager' && canEditTask(user, task as Task, roles, scope));
  const fallback = approvalMode === 'pm'
    ? (pms.length ? pms : users.filter(user => user.hasLogin !== false && isBossKoo(user)))
    : cover ? [cover] : hods.length ? hods : pms.length ? pms : users.filter(user => user.hasLogin !== false && isBossKoo(user));
  const responsiblePms = users.filter(user => user.hasLogin !== false && user.role === 'Project Manager'
    && canManageTaskReview(user, task as Task, roles, scope));
  return [...new Map([...fallback, ...responsiblePms].map(user => [user.id, user])).values()];
};
