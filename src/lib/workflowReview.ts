import type { CustomRole, Deliverable, ServiceCycle, Task, User, WorkflowStepKind } from '../types';
import { canEditTask, canManageServiceCycles, isBossKoo, isHodUser, type VisibilityScope } from './access';
import { isMemberInDepartment } from './departments';
import { isTaskCompleted } from './taskCompletion';

export const INTERNAL_REVIEW_PERMISSION_MESSAGE = 'Only the department HOD, responsible Project Manager or Boss Koo can approve internal review.';
export const isWorkflowTask = (task: Task) => Boolean(task.generatedFromDeliverable || task.workflowStepId);

export const getWorkflowStepKind = (task: Task, cycles: ServiceCycle[] = [], deliverables: Deliverable[] = []): WorkflowStepKind | undefined => {
  const output = deliverables.find(item => item.id === task.deliverableId && item.clientId === task.clientId);
  const cycle = cycles.find(item => item.id === task.serviceCycleId && item.clientId === task.clientId);
  const workflow = cycle?.serviceItems.find(item => item.id === output?.serviceItemId)?.workflow;
  return workflow?.steps.find(step => step.id === task.workflowStepId)?.kind || task.workflowStepKind;
};

export const canApproveInternalReview = (user: User | null | undefined, task: Task, roles: CustomRole[] = [], scope: VisibilityScope = {}) =>
  Boolean(user && canEditTask(user, task, roles, scope) && (isBossKoo(user)
    || (isHodUser(user, roles) && isMemberInDepartment(user, task.department))
    || (user.role === 'Project Manager' && canManageServiceCycles(user, roles))));

export const isWorkflowTaskSatisfied = (task: Task, tasks: Task[]) => {
  if (task.status === 'Cancelled' && task.workflowStepRequired === false) return true;
  if (!isTaskCompleted(task)) return false;
  if (task.workflowStepKind !== 'internal_review') return true;
  const review = task.internalReview;
  if (!review?.reviewedBy || !review.reviewedAt) return false;
  return [...new Set(task.predecessorTaskIds || [])].every(id => {
    const input = tasks.find(item => item.id === id);
    const recorded = review.inputVersions.find(item => item.taskId === id);
    return recorded && (input
      ? recorded.outputVersion === (input.workflowOutputVersion || 1) && (isTaskCompleted(input) || (input.status === 'Cancelled' && input.workflowStepRequired === false))
      : task.workflowDependenciesReady === true);
  });
};

const outputFields = ['title', 'description', 'notes', 'attachmentLink', 'attachmentName', 'status', 'isCompleted', 'revisionCount'] as const;
const outputChanged = (before: Task, after: Task) => outputFields.some(key => (before[key] ?? '') !== (after[key] ?? ''));

export const workflowTransitionError = (task: Task, next: Task, user: User | null | undefined, tasks: Task[], cycles: ServiceCycle[] = [], deliverables: Deliverable[] = [], roles: CustomRole[] = [], scope: VisibilityScope = {}) => {
  if (!isWorkflowTask(task) || !(isTaskCompleted(next) || next.status === 'Waiting Approval')) return null;
  const kind = getWorkflowStepKind(task, cycles, deliverables);
  if (!kind) return 'Workflow details are unavailable. Refresh before completing this step.';
  if (task.workflowDependenciesReady === false
    || [...new Set(task.predecessorTaskIds || [])].some(id => {
      const predecessor = tasks.find(item => item.id === id);
      return predecessor ? !isWorkflowTaskSatisfied(predecessor, tasks) : task.workflowDependenciesReady !== true;
    })) return 'Complete every required predecessor before submitting or completing this step.';
  if (kind === 'internal_review' && isTaskCompleted(next)
    && (!isWorkflowTaskSatisfied(task, tasks) || outputChanged(task, next))
    && !canApproveInternalReview(user, task, roles, scope)) {
    return INTERNAL_REVIEW_PERMISSION_MESSAGE;
  }
  return null;
};

/** Local output counters mirror the server. Secure commands omit this metadata:
 * PostgreSQL stamps the reviewer and input versions from canonical records. */
export const prepareWorkflowTasks = (tasks: Task[], previous: Task[], user: User | null | undefined, cycles: ServiceCycle[], deliverables: Deliverable[], invalidate: boolean, roles: CustomRole[] = [], scope: VisibilityScope = {}): Task[] => {
  let next = tasks.map(task => {
    if (!isWorkflowTask(task)) return task;
    const before = previous.find(item => item.id === task.id);
    const kind = getWorkflowStepKind(task, cycles, deliverables);
    const changed = before && outputChanged(before, task);
    let review = task.internalReview;
    if (!isTaskCompleted(task)) review = undefined;
    else if (kind === 'internal_review' && user && before !== task && (!before?.internalReview || changed)
      && canApproveInternalReview(user, task, roles, scope)) {
      review = { reviewedBy: user.id, reviewedAt: new Date().toISOString(), inputVersions: [...new Set(task.predecessorTaskIds || [])].map(id => ({ taskId: id, outputVersion: tasks.find(item => item.id === id)?.workflowOutputVersion || 1 })) };
    }
    const reviewChanged = before && review !== before.internalReview;
    return { ...task, workflowStepKind: kind, workflowOutputVersion: (before?.workflowOutputVersion || task.workflowOutputVersion || 1) + (changed || reviewChanged ? 1 : 0), internalReview: review };
  });
  if (!invalidate) return next;
  const changedIds = new Set(next.filter(task => {
    const before = previous.find(item => item.id === task.id);
    return before && (before.workflowOutputVersion || 1) !== (task.workflowOutputVersion || 1);
  }).map(task => task.id));
  const affectedIds = new Set<string>();
  // Reopening propagates through the immutable chain, so completed client
  // approvals/publication cannot remain accepted after an upstream revision.
  for (let pass = 0; pass < next.length; pass++) {
    let changed = false;
    next = next.map(task => {
      if (!affectedIds.has(task.id) && (task.predecessorTaskIds || []).some(id => changedIds.has(id) || affectedIds.has(id))) {
        affectedIds.add(task.id);
        changed = true;
      }
      if (!isWorkflowTask(task) || !(isTaskCompleted(task) || task.status === 'Waiting Approval')) return task;
      const staleReview = task.workflowStepKind === 'internal_review' && !isWorkflowTaskSatisfied(task, next);
      const blocked = (task.predecessorTaskIds || []).some(id => {
        const predecessor = next.find(item => item.id === id);
        return predecessor ? !isWorkflowTaskSatisfied(predecessor, next) : task.workflowDependenciesReady !== true;
      });
      if (!affectedIds.has(task.id) && !staleReview && !blocked) return task;
      changed = true;
      return { ...task, status: 'Pending', isCompleted: false, completedAt: undefined, clientApprovalStatus: 'Pending' as const, internalReview: undefined, completionPercentage: Math.min(task.completionPercentage, 90), workflowOutputVersion: (task.workflowOutputVersion || 1) + 1, updatedAt: new Date().toISOString() };
    });
    if (!changed) break;
  }
  return next.map(task => !isWorkflowTask(task) ? task : { ...task, workflowDependenciesReady: (task.predecessorTaskIds || []).every(id => {
    const predecessor = next.find(item => item.id === id);
    return predecessor ? isWorkflowTaskSatisfied(predecessor, next) : task.workflowDependenciesReady === true;
  }) });
};
