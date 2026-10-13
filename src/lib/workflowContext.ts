import type { Task } from '../types';
import { parseTask } from './security';

export const loadWorkflowContext = async (tasks: Task[], query: () => PromiseLike<{ data: { ok?: boolean; tasks?: Partial<Task>[] } | null; error: unknown }>, upgradeMessage: string) => {
  const context = await query();
  if (context.error || context.data?.ok !== true || !Array.isArray(context.data.tasks)) throw new Error(upgradeMessage);
  const metadata = new Map(context.data.tasks.filter(item => typeof item.id === 'string').map(item => [item.id!, item]));
  return tasks.map(task => {
    const item = metadata.get(task.id);
    if (!item && (task.generatedFromDeliverable || task.workflowStepId)) throw new Error(upgradeMessage);
    return item ? parseTask({ ...task, workflowStepKind: item.workflowStepKind, workflowOutputVersion: item.workflowOutputVersion, workflowDependenciesReady: item.workflowDependenciesReady, internalReview: item.internalReview }) || task : task;
  });
};
