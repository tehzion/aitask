import { canEditTask, type VisibilityScope } from '../../../shared/authorization/access';
import { getTaskStatusOptions, taskTransitionError } from '../../../shared/authorization/taskWorkflowAccess';
import { workflowTransitionError } from '../../../shared/rules/workflowReview';
import type { CustomRole, Deliverable, ServiceCycle, Task, User } from '../../../shared/types/index';
import { taskEvidenceError } from './staffWorkflow';

type WorkflowContext = { tasks: Task[]; cycles: ServiceCycle[]; deliverables: Deliverable[] };

/** Keep PM completion discoverable without treating a visible choice as a grant. */
export const getTaskStatusControls = (
  user: User | null | undefined,
  task: Task,
  statuses: readonly string[],
  roles: CustomRole[] = [],
  scope: VisibilityScope = {},
  workflow: WorkflowContext = { tasks: [], cycles: [], deliverables: [] },
) => {
  const options = getTaskStatusOptions(user, task, statuses, roles, scope);
  if (user?.role === 'Project Manager' && canEditTask(user, task, roles, scope) && !options.includes('Completed')) {
    options.push('Completed');
  }
  return options.map(status => {
    const next = { ...task, status, isCompleted: status === 'Completed' };
    // Evidence is enforced by the store for every review-ready status, so the
    // control must report the same reason for each of them, not just Completed.
    const disabledReason = taskTransitionError(user, task, next, roles, scope)
      || workflowTransitionError(task, next, user, workflow.tasks, workflow.cycles, workflow.deliverables, roles, scope)
      || (['Waiting Approval', 'Approved', 'Completed'].includes(status) && taskEvidenceError(task, next, workflow.deliverables, workflow.tasks))
      || undefined;
    return { status, disabledReason };
  });
};
