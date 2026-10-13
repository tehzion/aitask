import { useStore } from '../store';
import { useToastStore } from '../store/useToastStore';
import { msg } from './messages';
import { captureWorkspaceSession, isWorkspaceSessionCurrent } from './workspaceSession';

// Called by UI submission/retry handlers after persistence acknowledgement.
export const announceTaskStatusSaved = (status: string, taskId?: string) => {
  useToastStore.getState().addToast(msg('task.statusUpdated', { status }), 'success');
  const state = useStore.getState();
  if (status !== 'Completed' || !state.currentUser || !taskId) return;
  const session = captureWorkspaceSession();
  const actorId = state.currentUser.id;
  void import('./taskCompletionCelebration').then(module => {
    if (isWorkspaceSessionCurrent(session) && useStore.getState().currentUser?.id === actorId) module.celebrateTaskCompletion(taskId);
  }).catch(() => { /* The confirmed status message is sufficient if optional feedback cannot load. */ });
};
