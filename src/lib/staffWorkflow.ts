import type { Deliverable, Task, TaskWorkState } from '../types';
import { isWorkflowTaskSatisfied } from './workflowReview';
import { safeHttpsUrl } from './security';

export const TASK_EVIDENCE_REQUIRED = 'Add an output link or upload a deliverable file before sending this linked task for review or completing it.';
export const TASK_HISTORY_FIELDS = ['title', 'description', 'notes', 'dueDate', 'startDate', 'assignedTo', 'department', 'status', 'priority', 'attachmentLink', 'outputAttachments', 'reviewCover', 'accountableLeadId', 'requiresInternalApproval', 'acceptedBy', 'blocker'] as const;

export const isTaskLinkedToDeliverable = (task: Pick<Task, 'id' | 'deliverableId'>, deliverables: readonly Deliverable[]) =>
  Boolean(task.deliverableId || deliverables.some(item => item.taskIds.includes(task.id)));

export const hasTaskEvidence = (task: Task, deliverables: readonly Deliverable[], tasks: Task[] = []) => {
  if (safeHttpsUrl(task.attachmentLink)) return true;
  if (task.outputAttachments?.some(file => file.bucket === 'client-service-files' && file.id && file.path.split('/')[1] === task.clientId && file.path.split('/')[2] === task.serviceCycleId)) return true;
  if ((task.reviewAccess?.canApprove || task.reviewAccess?.canReadInputs) && task.reviewAccess.actorId === task.reviewEvidence?.actorId && task.reviewEvidence.attachments.length) return true;
  if (task.workflowStepKind === 'internal_review') {
    if (task.reviewEvidence?.actorId === task.reviewAccess?.actorId
      && (task.reviewAccess?.canReadInputs === true || task.reviewAccess?.canApprove || task.assignedTo === task.reviewEvidence?.actorId)
      && task.reviewEvidence?.links?.some(link => safeHttpsUrl(link.url))) return true;
    if ((task.predecessorTaskIds || []).some(id => {
      const input = tasks.find(item => item.id === id);
      return input && input.clientId === task.clientId && input.deliverableId === task.deliverableId && input.serviceCycleId === task.serviceCycleId
        && isWorkflowTaskSatisfied(input, tasks) && (safeHttpsUrl(input.attachmentLink) || input.outputAttachments?.length);
    })) return true;
  }
  const links = deliverables.filter(item => item.id === task.deliverableId || item.taskIds.includes(task.id));
  if ((task.deliverableId && !links.some(item => item.id === task.deliverableId)) || links.length !== 1) return false;
  const linked = links[0];
  return linked.clientId === task.clientId && (!task.serviceCycleId || linked.cycleId === task.serviceCycleId)
    && linked.attachments.some(file => file.bucket === 'client-service-files' && Boolean(file.path?.trim()) && Boolean(file.id));
};

export const taskEvidenceError = (before: Task | undefined, after: Task, deliverables: readonly Deliverable[], tasks: Task[] = []) => {
  const enteringReady = ['Waiting Approval', 'Approved', 'Completed'].includes(after.status) && before?.status !== after.status;
  const newlyCompleted = after.isCompleted && !before?.isCompleted;
  return (enteringReady || newlyCompleted) && isTaskLinkedToDeliverable(after, deliverables) && !hasTaskEvidence(after, deliverables, tasks)
    ? TASK_EVIDENCE_REQUIRED : undefined;
};

/** Local-mode counterpart of the database trigger. Remote actors/times are always stamped by the server. */
export const recordTaskWorkTransition = (before: Task, after: Task, actorId: string, now = new Date().toISOString()): Task => {
  const workState: TaskWorkState = { ...before.workState };
  if (before.assignedTo !== after.assignedTo || before.department !== after.department) {
    delete workState.acceptedBy; delete workState.acceptedAt;
    delete workState.blocker;
  }
  if (before.status !== after.status) {
    if (after.status === 'Waiting Approval') {
      workState.reviewRequestedBy = actorId; workState.reviewRequestedAt = now;
    } else {
      delete workState.reviewRequestedBy; delete workState.reviewRequestedAt;
    }
    if (after.status === 'In Progress' && after.assignedTo === actorId) {
      workState.acceptedBy = actorId; workState.acceptedAt ||= now;
    }
    if (['Completed', 'Cancelled'].includes(after.status)) delete workState.blocker;
  }
  const next = { ...after, workState, workHistory: before.workHistory };
  if (after.status === 'Approved' && before.status !== after.status) next.reviewDecision = { reviewedBy: actorId, reviewedAt: now, overrideReason: after.reviewOverrideReason?.trim() || undefined };
  if (!['Approved', 'Completed'].includes(after.status)) delete next.reviewDecision;
  const fields = TASK_HISTORY_FIELDS.filter(field => {
    if (field === 'acceptedBy') return before.workState?.acceptedBy !== workState.acceptedBy;
    if (field === 'blocker') return JSON.stringify(before.workState?.blocker) !== JSON.stringify(workState.blocker);
    return JSON.stringify(before[field] ?? '') !== JSON.stringify(after[field] ?? '');
  });
  if (fields.length) next.workHistory = [...(before.workHistory || []), { id: crypto.randomUUID(), userId: actorId, createdAt: now, fields }].slice(-50);
  return next;
};

export const taskWorkContactId = (task: Task) => [task.assignedBy, task.createdBy].find(id => id && id !== task.assignedTo);

export type TaskWorkIntent = { kind: 'accept' | 'block' | 'unblock'; reason?: string };
export const applyTaskWorkIntent = (task: Task, intent: TaskWorkIntent, actorId: string, now = new Date().toISOString()): Task => {
  const workState = { ...task.workState };
  if (intent.kind === 'accept') { workState.acceptedBy = actorId; workState.acceptedAt = now; }
  if (intent.kind === 'block') workState.blocker = { reason: intent.reason!.trim(), openedBy: actorId, openedAt: now };
  if (intent.kind === 'unblock') delete workState.blocker;
  return { ...task, workState, updatedAt: now, workHistory: [...(task.workHistory || []), {
    id: crypto.randomUUID(), userId: actorId, createdAt: now, fields: [intent.kind === 'accept' ? 'acceptedBy' : 'blocker'],
  }].slice(-50) };
};
