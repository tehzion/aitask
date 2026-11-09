import type { CustomRole, Task, User } from '../types';
import { getVisibleTasks, isHodUser, type VisibilityScope } from './access';
import { canApproveTaskInternally, isAwaitingHodAssignment } from './taskWorkflowAccess';

export type HodWaitingCounts = { toAssign: number; toReview: number; total: number };

const EMPTY: HodWaitingCounts = { toAssign: 0, toReview: 0, total: 0 };

/**
 * What waits on an HOD (role UX, 10 Nov 2026): open tasks they still have to
 * hand to Staff, plus submitted work where they are the actual reviewer. PM
 * review lanes are excluded because canApproveTaskInternally refuses them.
 */
export const getHodWaitingCounts = (
  user: User | null | undefined,
  tasks: Task[],
  roles: CustomRole[] = [],
  scope: VisibilityScope = {},
): HodWaitingCounts => {
  if (!user || !isHodUser(user, roles)) return EMPTY;
  const visible = getVisibleTasks(user, tasks, roles, scope);
  const toAssign = visible.filter(task => isAwaitingHodAssignment(task)
    && (task.responsibleHodId === user.id || task.assignedTo === user.id)).length;
  const toReview = visible.filter(task => task.status === 'Waiting Approval'
    && canApproveTaskInternally(user, task, roles, scope)).length;
  return { toAssign, toReview, total: toAssign + toReview };
};
