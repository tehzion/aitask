import type { Task } from '../types';
import { parseTask } from './security';

export const loadWorkflowContext = async (tasks: Task[], query: () => PromiseLike<{ data: { ok?: boolean; tasks?: Partial<Task>[] } | null; error: unknown }>, upgradeMessage: string, actorId?: string) => {
  const context = await query();
  const hasWorkflow = tasks.some(task => task.generatedFromDeliverable || task.workflowStepId);
  if (!hasWorkflow && context.error && typeof context.error === 'object' && 'code' in context.error && context.error.code === 'PGRST202') {
    return tasks.map(task => ({ ...task, reviewAccess: actorId ? { actorId, canApprove: false } : undefined }));
  }
  if (context.error || context.data?.ok !== true || !Array.isArray(context.data.tasks)) throw new Error(upgradeMessage);
  const metadata = new Map(context.data.tasks.filter(item => typeof item.id === 'string').map(item => [item.id!, item]));
  return tasks.map(task => {
    const item = metadata.get(task.id);
    if (!item && (task.generatedFromDeliverable || task.workflowStepId)) throw new Error(upgradeMessage);
    return item ? parseTask({ ...task, workflowStepKind: item.workflowStepKind, workflowOutputVersion: item.workflowOutputVersion, workflowDependenciesReady: item.workflowDependenciesReady, internalReview: item.internalReview, reviewAccess: item.reviewAccess || (actorId ? { actorId, canApprove: false } : undefined) }) || task : { ...task, reviewAccess: actorId ? { actorId, canApprove: false } : undefined };
  });
};
