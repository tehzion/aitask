import '../lib/hodReviewCopy';
import type { StoreState, MutationActionResult } from './index';
import type { AttachmentRef, Task } from '../types';
import { canEditTask } from '../lib/access';
import { canBeTaskReviewLead, canManageTaskReview, getDepartmentReviewers, isIndependentTaskReviewer } from '../lib/taskWorkflowAccess';
import { recordTaskWorkTransition } from '../lib/staffWorkflow';
import { getWorkflowStepKind } from '../lib/workflowReview';
import { isWorkspaceMutationLocked } from './index';
import { SECURE_WORKSPACE_ID } from '../lib/secureWorkspace';

export const attachTaskOutput = (state: StoreState, set: (patch: Partial<StoreState>) => void, pendingMessage: string, taskId: string, attachment: AttachmentRef): MutationActionResult => {
  const task = state.tasks.find(item => item.id === taskId); const actor = state.currentUser;
  if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMessage };
  const scope = { users: state.users, clients: state.clients, projects: state.projects };
  if (!task || !actor || actor.role === 'Client' || !canEditTask(actor, task, state.rolePermissions, scope)
    || (task.assignedTo !== actor.id && !canManageTaskReview(actor, task, state.rolePermissions, scope))) return { ok: false, error: 'Only the assigned worker or responsible project manager can upload output.' };
  if (['Waiting Approval', 'Approved', 'Completed', 'Cancelled'].includes(task.status)) return { ok: false, error: 'Return this task for revision before changing its output files.' };
  const parts = attachment.path.split('/');
  if (!task.clientId || !task.serviceCycleId || !state.deliverables.some(item => (item.id === task.deliverableId || item.taskIds.includes(task.id)) && item.clientId === task.clientId && item.cycleId === task.serviceCycleId)
    || attachment.bucket !== 'client-service-files' || attachment.uploadedBy !== actor.id || parts.length !== 4 || parts[0] !== SECURE_WORKSPACE_ID || parts[1] !== task.clientId || parts[2] !== task.serviceCycleId || parts.some(part => !part || part === '.' || part === '..') || attachment.path.includes('\\')) return { ok: false, error: 'Choose an output file belonging to this task and cycle.' };
  if (task.outputAttachments?.some(file => file.path === attachment.path)) return { ok: true };
  if ((task.outputAttachments?.length || 0) >= 50) return { ok: false, error: 'A task can contain at most 50 output files.' };
  const next = recordTaskWorkTransition(task, { ...task, outputAttachments: [...(task.outputAttachments || []), attachment], updatedAt: new Date().toISOString() }, actor.id);
  set({ tasks: state.tasks.map(item => item.id === task.id ? next : item), ...(state.backend.mode === 'supabase' ? { backend: { ...state.backend, hasLocalChanges: true, pendingMutations: 1, pendingCommandType: 'task.update' as const } } : {}) });
  return { ok: true };
};

export const setTaskReviewConfig = (state: StoreState, set: (patch: Partial<StoreState>) => void, pendingMessage: string, notify: (ids: string[], data: { title: string; message: string; route: { page: 'tasks'; entityId: string }; iconType: 'status' }, exclude: string) => import('../types').AppNotification[], taskId: string, config: { cover?: Task['reviewCover'] | null; accountableLeadId?: string; requiresInternalApproval?: boolean }): MutationActionResult => {
  const task = state.tasks.find(item => item.id === taskId); const actor = state.currentUser;
  if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMessage };
  const scope = { users: state.users, clients: state.clients, projects: state.projects };
  if (!task || !actor || !canManageTaskReview(actor, task, state.rolePermissions, scope)) return { ok: false, error: 'Only the responsible project manager can configure review cover.' };
  if (config.requiresInternalApproval !== undefined) {
    if (typeof config.requiresInternalApproval !== 'boolean') return { ok: false, error: 'Choose whether internal approval is required.' };
    if (config.requiresInternalApproval !== (task.requiresInternalApproval !== false) && ['Completed', 'Cancelled'].includes(task.status)) return { ok: false, error: 'Reopen the task before changing its approval requirement.' };
    if (!config.requiresInternalApproval && getWorkflowStepKind(task, state.serviceCycles, state.deliverables) === 'internal_review') return { ok: false, error: 'Internal review workflow steps always require approval.' };
  }
  const cover = config.cover === undefined ? task.reviewCover : config.cover || undefined;
  if (cover) {
    const reviewer = state.users.find(user => user.id === cover.reviewerId);
    const expiry = Date.parse(cover.expiresAt);
    if (!reviewer || !canBeTaskReviewLead(reviewer, task, state.rolePermissions, scope) || !isIndependentTaskReviewer(reviewer, task)
      || !Number.isFinite(expiry) || expiry <= Date.now() || expiry > Date.now() + 90 * 86400000) return { ok: false, error: 'Choose an independent reviewer and a cover expiry within 90 days.' };
  }
  const leadId = config.accountableLeadId ?? task.accountableLeadId;
  const lead = state.users.find(user => user.id === leadId);
  if (config.accountableLeadId && (!lead || !canBeTaskReviewLead(lead, task, state.rolePermissions, scope))) return { ok: false, error: 'Choose a department lead or responsible project manager.' };
  const next = recordTaskWorkTransition(task, { ...task, ...(config.requiresInternalApproval === undefined ? {} : { requiresInternalApproval: config.requiresInternalApproval }), accountableLeadId: leadId, reviewCover: cover ? { ...cover, configuredBy: actor.id, configuredAt: new Date().toISOString() } : config.cover === null ? null : undefined, updatedAt: new Date().toISOString() }, actor.id);
  const notices = state.backend.mode === 'local' && next.status === 'Waiting Approval' && task.status !== 'Waiting Approval' ? notify(getDepartmentReviewers(state.users, next, state.rolePermissions, scope).map(user => user.id), { title: 'Task Ready for Approval', message: `"${task.title}" is ready for department review.`, route: { page: 'tasks', entityId: task.id }, iconType: 'status' }, actor.id) : [];
  set({ tasks: state.tasks.map(item => item.id === task.id ? next : item), notifications: [...notices, ...state.notifications], ...(state.backend.mode === 'supabase' ? { backend: { ...state.backend, hasLocalChanges: true, pendingMutations: 1, pendingCommandType: 'task.update' as const } } : {}) });
  return { ok: true };
};
