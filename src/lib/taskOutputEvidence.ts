import type { AttachmentRef, Deliverable, Task } from '../types';

export const getTaskOutputAttachments = (task: Task, deliverables: readonly Deliverable[], actorId?: string) => {
  const canonical = actorId && task.reviewAccess?.actorId === actorId && (task.reviewAccess.canApprove || task.reviewAccess.canReadInputs) && task.reviewEvidence?.actorId === actorId ? task.reviewEvidence.attachments : [];
  const linked = deliverables.filter(item => (task.deliverableId ? item.id === task.deliverableId : item.taskIds?.includes(task.id))
    && item.clientId === task.clientId && (!task.serviceCycleId || item.cycleId === task.serviceCycleId));
  const files = [...(task.outputAttachments || []), ...canonical, ...linked.flatMap(item => item.attachments || [])].filter((file): file is AttachmentRef => Boolean(file
    && typeof file.id === 'string' && file.id && typeof file.bucket === 'string' && file.bucket
    && typeof file.path === 'string' && file.path)).map(file => ({ ...file, fileName: typeof file.fileName === 'string' && file.fileName.trim() ? file.fileName : file.path.split('/').at(-1) || file.id }));
  return [...new Map(files.map(file => [`${file.bucket}:${file.path}`, file])).values()];
};

export const getTaskReviewInputLinks = (task: Task, actorId?: string) => actorId && task.reviewEvidence?.actorId === actorId
  && task.reviewAccess?.actorId === actorId && task.workflowStepKind === 'internal_review'
  && (task.reviewAccess.canReadInputs === true || task.reviewAccess.canApprove || task.assignedTo === actorId) ? task.reviewEvidence.links || [] : [];
