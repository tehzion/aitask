import type { Task } from '../types';
import { isTaskCompleted } from './taskCompletion';
import { isTaskOpen } from './taskReporting';

// Display-only scope for task lists. Active work views hide completed and
// cancelled tasks by default; the records themselves are never changed, and
// Completed / All keep history one click away.
export type TaskListScope = 'active' | 'completed' | 'all';

export const TASK_LIST_SCOPE_PARAM = 'show';

export const parseTaskListScope = (value: string | null | undefined): TaskListScope => (
  value === 'completed' || value === 'all' ? value : 'active'
);

export const isTaskInListScope = (task: Pick<Task, 'isCompleted' | 'status'>, scope: TaskListScope) => {
  if (scope === 'all') return true;
  if (scope === 'completed') return isTaskCompleted(task);
  return isTaskOpen(task as Task);
};

/**
 * An explicit status filter or a routed task link is a direct request for that
 * record, so it must win over the default active scope.
 */
export const shouldApplyTaskListScope = (options: { statusFilter?: string; taskId?: string | null }) => (
  (!options.statusFilter || options.statusFilter === 'All') && !options.taskId
);
