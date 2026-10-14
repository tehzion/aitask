import type { AttachmentRef, Task } from '../types';
import { parseTask, safeHttpsUrl } from './security';

export const loadWorkflowContext = async (tasks: Task[], query: () => PromiseLike<{ data: { ok?: boolean; tasks?: Partial<Task>[] } | null; error: unknown }>, upgradeMessage: string, actorId?: string) => {
  const context = await query();
  const hasWorkflow = tasks.some(task => task.generatedFromDeliverable || task.workflowStepId);
  if (!hasWorkflow && context.error && typeof context.error === 'object' && 'code' in context.error && context.error.code === 'PGRST202') {
    return tasks.map(task => ({ ...task, reviewEvidence: undefined, reviewAccess: actorId ? { actorId, canApprove: false } : undefined }));
  }
  if (context.error || context.data?.ok !== true || !Array.isArray(context.data.tasks)) throw new Error(upgradeMessage);
  const metadata = new Map(context.data.tasks.filter(item => typeof item.id === 'string').map(item => [item.id!, item]));
  return tasks.map(task => {
    const item = metadata.get(task.id);
    if (!item && (task.generatedFromDeliverable || task.workflowStepId)) throw new Error(upgradeMessage);
    const parsed = item ? parseTask({ ...task, workflowStepKind: item.workflowStepKind, workflowOutputVersion: item.workflowOutputVersion, workflowDependenciesReady: item.workflowDependenciesReady, internalReview: item.internalReview, reviewAccess: item.reviewAccess || (actorId ? { actorId, canApprove: false } : undefined) }) || task : { ...task, reviewAccess: actorId ? { actorId, canApprove: false } : undefined };
    const evidence = item?.reviewEvidence;
    const attachments = actorId && evidence?.actorId === actorId && item?.reviewAccess?.actorId === actorId && item.reviewAccess.canApprove && Array.isArray(evidence.attachments)
      ? evidence.attachments.filter(file => file && file.bucket === 'client-service-files' && typeof file.id === 'string' && file.id.length > 0
        && typeof file.path === 'string' && file.path.length < 2048 && !file.path.includes('\\') && !file.path.split('/').some(segment => segment === '.' || segment === '..')
        && file.path.split('/')[1] === task.clientId && (!task.serviceCycleId || file.path.split('/')[2] === task.serviceCycleId)
        && typeof file.fileName === 'string' && file.fileName.length > 0).slice(0, 50).map(file => ({ ...file } as AttachmentRef)) : [];
    const links = actorId && evidence?.actorId === actorId && item?.reviewAccess?.actorId === actorId
      && (item.reviewAccess.canReadInputs === true || item.reviewAccess.canApprove || parsed.workflowStepKind === 'internal_review' && task.assignedTo === actorId) && Array.isArray(evidence.links)
      ? evidence.links.filter(link => link && typeof link.taskId === 'string' && (task.predecessorTaskIds || []).includes(link.taskId)
        && safeHttpsUrl(link.url) && typeof link.name === 'string' && Number.isSafeInteger(link.outputVersion) && link.outputVersion > 0).slice(0, 50) : [];
    return { ...parsed, reviewEvidence: (attachments.length || links.length) && actorId ? { actorId, attachments, ...(links.length ? { links } : {}) } : undefined };
  });
};
