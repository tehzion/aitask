import type { AttachmentRef, Task } from '../types';
import { isWorkspaceMutationLocked, useStore } from '../store';
import { BACKEND_UPGRADE_REQUIRED_MESSAGE, loadSecureBackendCapabilities, SECURE_WORKSPACE_ID } from './secureWorkspace';
import { forgetPendingServiceFile, removeServiceFile, uploadServiceFile } from './serviceFiles';

export const requireReviewRemediation = async () => {
  if (useStore.getState().backend.mode !== 'supabase') return;
  const result = await loadSecureBackendCapabilities();
  if (!result.compatible || !result.capabilities.hodReviewRemediation) throw new Error(BACKEND_UPGRADE_REQUIRED_MESSAGE);
};

export const saveTaskOutputFile = async (task: Task, file: File, isCurrent: () => boolean, retained?: AttachmentRef): Promise<{ ok: boolean; error?: string; attachment?: AttachmentRef }> => {
  await requireReviewRemediation();
  if (!isCurrent()) return { ok: false };
  const actor = useStore.getState().currentUser;
  if (!actor || !task.clientId || !task.serviceCycleId) return { ok: false, error: 'Choose an output file belonging to this task and cycle.' };
  let attachment = retained;
  if (!attachment) {
    const uploaded = await uploadServiceFile({ file, workspaceId: SECURE_WORKSPACE_ID, clientId: task.clientId, cycleId: task.serviceCycleId, userId: actor.id });
    if (!uploaded.ok) return uploaded;
    attachment = uploaded.attachment;
  }
  if (!isCurrent()) return { ok: false, attachment };
  if (retained && useStore.getState().tasks.some(item => item.id === task.id && item.outputAttachments?.some(output => output.path === attachment!.path)) && useStore.getState().backend.hasLocalChanges) {
    const retry = await useStore.getState().retryPendingSave('task.update');
    if (!isCurrent()) return { ok: false, attachment };
    if (!retry.ok) return { ...retry, attachment };
    if (useStore.getState().tasks.some(item => item.id === task.id && item.outputAttachments?.some(output => output.path === attachment!.path))) { forgetPendingServiceFile(attachment); return { ok: true }; }
  }
  const result = await useStore.getState().attachTaskOutput(task.id, attachment);
  if (!result.ok) {
    // A mutation lock or a session change is transient: keep the upload so the
    // caller can retry with the same path instead of deleting a valid object and
    // forcing a full re-upload.
    if (isWorkspaceMutationLocked(useStore.getState())) {
      return { ok: false, error: typeof result.error === 'string' ? result.error : 'The change is waiting to be saved.', attachment };
    }
    const cleanup = await removeServiceFile(attachment);
    return { ok: false, error: typeof result.error === 'string' ? result.error : 'The change is waiting to be saved.', attachment: cleanup.ok ? undefined : attachment };
  }
  const saved = await useStore.getState().commitPendingMutation('task.update');
  if (!isCurrent()) return { ok: false, attachment };
  if (!saved.ok) return { ...saved, attachment };
  if (!useStore.getState().tasks.some(item => item.id === task.id && item.outputAttachments?.some(output => output.path === attachment!.path))) return { ok: false, error: 'The output file has not been confirmed. Retry the save.', attachment };
  forgetPendingServiceFile(attachment);
  return { ok: true };
};
