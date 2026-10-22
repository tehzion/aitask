import type { Task } from '../types';

type CompletionState = Pick<Task, 'isCompleted' | 'status' | 'completedAt'>;

export const isTaskCompleted = (task: Pick<Task, 'isCompleted' | 'status'>) => (
  task.isCompleted || task.status === 'Completed'
);

// Keep this store-level predicate independent of reporting/date-formatting code.
export const isTaskOpen = (task: Pick<Task, 'isCompleted' | 'status'>) => !isTaskCompleted(task) && task.status !== 'Cancelled';

export const resolveTaskCompletedAt = (
  task: CompletionState,
  nextIsCompleted: boolean,
  completedAt = new Date().toISOString(),
) => {
  if (!nextIsCompleted) return undefined;
  return isTaskCompleted(task) ? task.completedAt : completedAt;
};
