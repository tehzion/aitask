import type { Task } from '../types';

type CompletionState = Pick<Task, 'isCompleted' | 'status' | 'completedAt'>;

export const isTaskCompleted = (task: Pick<Task, 'isCompleted' | 'status'>) => (
  task.isCompleted || task.status === 'Completed'
);

export const resolveTaskCompletedAt = (
  task: CompletionState,
  nextIsCompleted: boolean,
  completedAt = new Date().toISOString(),
) => {
  if (!nextIsCompleted) return undefined;
  return isTaskCompleted(task) ? task.completedAt : completedAt;
};
