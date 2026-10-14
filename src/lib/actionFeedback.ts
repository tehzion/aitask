import type { ClientProfile, Task, User } from '../types';
import { msg, type MessageDescriptor } from './messages';
import { captureWorkspaceSession, isWorkspaceSessionCurrent, onWorkspaceSessionInvalidated } from './workspaceSession';
import { useToastStore } from '../store/useToastStore';

export type UiFeedback = {
  message: string | MessageDescriptor;
  tone: 'success' | 'status' | 'warning' | 'error';
  action?: 'retry' | 'restore' | 'upload';
};
type FeedbackWorkspace = { currentUser: User | null; tasks: Task[]; clients: ClientProfile[] };
type SavedWorkspace = Pick<FeedbackWorkspace, 'tasks' | 'clients'>;
const pending = new Map<string, {
  actorId: string; session: ReturnType<typeof captureWorkspaceSession>;
  message: MessageDescriptor; notify: boolean; applied: (state: SavedWorkspace) => boolean;
}>();

/** Register intent, never success. A newer attempt for the same field replaces it. */
export const queueActionFeedback = (actorId: string, key: string, message: MessageDescriptor, applied: (state: SavedWorkspace) => boolean, notify = true) => {
  pending.set(`${actorId}:${key}`, { actorId, session: captureWorkspaceSession(), message, applied, notify });
};
export const dismissActionFeedback = (actorId: string | undefined, entityKey: string) => {
  for (const [key, attempt] of pending) if (key.startsWith(`${actorId}:${entityKey}:`)) attempt.notify = false;
};
export const clearActionFeedback = () => pending.clear();
onWorkspaceSessionInvalidated(clearActionFeedback);

/** Call only after persistence acknowledgement, using the snapshot actually saved. */
export const acknowledgeActionFeedback = (current: FeedbackWorkspace, saved: SavedWorkspace = current) => {
  for (const [key, attempt] of pending) {
    if (!isWorkspaceSessionCurrent(attempt.session) || current.currentUser?.id !== attempt.actorId) { pending.delete(key); continue; }
    if (!attempt.applied(saved)) continue;
    pending.delete(key);
    if (attempt.notify) useToastStore.getState().addToast(attempt.message, 'success');
  }
};

export const taskStatusMessage = (status: string) => status === 'Waiting Approval'
  ? msg('feedback.sentForReview') : status === 'Completed' ? msg('feedback.taskCompleted')
  : status === 'Approved' ? msg('feedback.reviewApproved') : msg('task.statusUpdated', { status });

export const canRetrySave = (backend: { errorCode?: string }) => !['FORBIDDEN', 'VALIDATION', 'NOT_FOUND'].includes(backend.errorCode || '');
