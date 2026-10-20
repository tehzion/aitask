import type { CustomRole, Deliverable, ServiceCycle, Task, User, WorkflowStepKind } from '../types';
import { canEditTask, type VisibilityScope } from './access';
import { canReviewTaskInternally } from './taskWorkflowAccess';
import { isTaskCompleted } from './taskCompletion';
import { getTaskProgress } from './taskProgress';

export const INTERNAL_REVIEW_PERMISSION_MESSAGE = 'Only an authorized project manager, department reviewer, or Boss Koo can approve internal review.';
export const isWorkflowTask = (task: Task) => Boolean(task.generatedFromDeliverable || task.workflowStepId);

export const getWorkflowStepKind = (task: Task, cycles: ServiceCycle[] = [], deliverables: Deliverable[] = []): WorkflowStepKind | undefined => {
  const output = deliverables.find(item => item.id === task.deliverableId && item.clientId === task.clientId);
  const cycle = cycles.find(item => item.id === task.serviceCycleId && item.clientId === task.clientId);
  const workflow = cycle?.serviceItems.find(item => item.id === output?.serviceItemId)?.workflow;
  return workflow?.steps.find(step => step.id === task.workflowStepId)?.kind || task.workflowStepKind;
};

export const canApproveInternalReview = (user: User | null | undefined, task: Task, roles: CustomRole[] = [], scope: VisibilityScope = {}) =>
  Boolean(user && canEditTask(user, task, roles, scope) && canReviewTaskInternally(user, task, roles, scope));

const hasCurrentInternalReview = (task: Task, tasks: Task[]) => {
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

export const isWorkflowTaskSatisfied = (task: Task, tasks: Task[], visited = new Set<string>()): boolean => {
  if (visited.has(task.id)) return false;
  const satisfied = task.status === 'Cancelled' && task.workflowStepRequired === false
    || isTaskCompleted(task) && (task.workflowStepKind !== 'internal_review' || hasCurrentInternalReview(task, tasks));
  if (!satisfied || !isWorkflowTask(task)) return satisfied;
  const path = new Set(visited).add(task.id);
  return [...new Set(task.predecessorTaskIds || [])].every(id => {
    const input = tasks.find(item => item.id === id);
    return input ? input.clientId === task.clientId && input.deliverableId === task.deliverableId
      && input.serviceCycleId === task.serviceCycleId && isWorkflowTaskSatisfied(input, tasks, path)
      : task.workflowDependenciesReady === true;
  });
};

const outputFields = ['title', 'description', 'notes', 'attachmentLink', 'attachmentName', 'outputAttachments', 'status', 'isCompleted', 'revisionCount'] as const;
const outputChanged = (before: Task, after: Task) => outputFields.some(key => {
  if (before.status === 'Approved' && after.status === 'Completed' && (key === 'status' || key === 'isCompleted')) return false;
  if (before.status === 'Completed' && after.status === 'Completed' && key === 'notes') return false;
  return JSON.stringify(before[key] ?? '') !== JSON.stringify(after[key] ?? '');
});

export const workflowTransitionError = (task: Task, next: Task, user: User | null | undefined, tasks: Task[], cycles: ServiceCycle[] = [], deliverables: Deliverable[] = [], roles: CustomRole[] = [], scope: VisibilityScope = {}) => {
  if (!isWorkflowTask(task) || !(isTaskCompleted(next) || next.status === 'Approved' || next.status === 'Waiting Approval')) return null;
  const kind = getWorkflowStepKind(task, cycles, deliverables);
  if (!kind) return 'Workflow details are unavailable. Refresh this task and try again.';
  if (task.workflowDependenciesReady === false
    || [...new Set(task.predecessorTaskIds || [])].some(id => {
      const predecessor = tasks.find(item => item.id === id);
      return predecessor ? !isWorkflowTaskSatisfied(predecessor, tasks) : task.workflowDependenciesReady !== true;
    })) return 'Complete the earlier workflow steps first.';
  if (kind === 'internal_review' && (isTaskCompleted(next) || next.status === 'Approved')
    && (!hasCurrentInternalReview(task, tasks) || outputChanged(task, next))
    && !canApproveInternalReview(user, task, roles, scope) && !(user?.isSuperAdmin && next.reviewOverrideReason?.trim())) {
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
    if (!isTaskCompleted(task) && task.status !== 'Approved') review = undefined;
    else if (kind === 'internal_review' && user && before !== task && (!before?.internalReview || changed)
      && (canApproveInternalReview(user, task, roles, scope) || user.isSuperAdmin && task.reviewOverrideReason?.trim())) {
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
      if (!isWorkflowTask(task) || !(isTaskCompleted(task) || task.status === 'Approved' || task.status === 'Waiting Approval')) return task;
      const staleReview = task.workflowStepKind === 'internal_review' && (isTaskCompleted(task) || task.status === 'Approved') && !hasCurrentInternalReview(task, next);
      const blocked = (task.predecessorTaskIds || []).some(id => {
        const predecessor = next.find(item => item.id === id);
        return predecessor ? !isWorkflowTaskSatisfied(predecessor, next) : task.workflowDependenciesReady !== true;
      });
      if (!affectedIds.has(task.id) && !staleReview && !blocked) return task;
      changed = true;
      // Reopening resets the task to its assigned stage, so drop stale
      // acceptance and re-derive the canonical milestone instead of keeping a
      // near-complete percentage on a now-Pending task.
      const workState = { ...task.workState };
      delete workState.acceptedBy;
      delete workState.acceptedAt;
      const reopened: Task = { ...task, status: 'Pending', isCompleted: false, completedAt: undefined, clientApprovalStatus: 'Pending', reviewDecision: undefined, internalReview: undefined, workflowOutputVersion: (task.workflowOutputVersion || 1) + 1, updatedAt: new Date().toISOString(), workState };
      return { ...reopened, completionPercentage: getTaskProgress(reopened, scope.users || []) };
    });
    if (!changed) break;
  }
  return next.map(task => !isWorkflowTask(task) ? task : { ...task, workflowDependenciesReady: (task.predecessorTaskIds || []).every(id => {
    const predecessor = next.find(item => item.id === id);
    return predecessor ? isWorkflowTaskSatisfied(predecessor, next) : task.workflowDependenciesReady === true;
  }) });
};
