import { SECURE_WORKSPACE_ID } from '../../../infrastructure/api/workspaceContracts';
import { shouldUseSecureSupabase, supabase } from '../../../infrastructure/database/supabaseClient';
import { assertWorkspaceSession, captureWorkspaceSession } from '../../../infrastructure/persistence/workspaceSession';
import type { AttachmentRef, Task } from '../../../shared/types/index';
import { userFacingText } from '../../../shared/utils/userFacingMessage';
import { isWorkspaceMutationLocked } from '../../../infrastructure/commands/mutationGuard';
import { useStore } from '../../../app/store/workspaceStore';
import { getServiceFileMimeType, SERVICE_FILE_MAX_BYTES } from '../../services/data/serviceFiles';

export const TASK_SUPPORTING_FILES_BUCKET = 'task-supporting-files';

const safeName = (value: string) => value.normalize('NFKC').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(-160) || 'file';

export const saveTaskSupportingFile = async (
  task: Task,
  file: File,
  isCurrent: () => boolean,
  retained?: AttachmentRef,
): Promise<{ ok: boolean; error?: string; attachment?: AttachmentRef }> => {
  if (!shouldUseSecureSupabase()) return { ok: false, error: "Private task file uploads aren't available in this workspace." };
  if (file.size > SERVICE_FILE_MAX_BYTES) return { ok: false, error: 'Files must be 100 MB or smaller.' };
  const mimeType = getServiceFileMimeType(file);
  if (!mimeType) return { ok: false, error: 'Only PDF or image files are allowed.' };
  const actor = useStore.getState().currentUser;
  if (!actor || actor.role === 'Client') return { ok: false, error: 'Sign in as an authorized team member to upload supporting files.' };

  let attachment = retained;
  if (!attachment) {
    const id = crypto.randomUUID();
    const path = `${SECURE_WORKSPACE_ID}/${task.id}/${id}-${safeName(file.name)}`;
    attachment = {
      id,
      bucket: TASK_SUPPORTING_FILES_BUCKET,
      path,
      fileName: file.name.slice(0, 240),
      mimeType,
      sizeBytes: file.size,
      uploadedBy: actor.id,
      uploadedAt: new Date().toISOString(),
    };
    const session = captureWorkspaceSession();
    try {
      const { error } = await supabase.storage.from(TASK_SUPPORTING_FILES_BUCKET).upload(path, file, {
        cacheControl: '3600',
        contentType: mimeType,
        upsert: false,
      });
      if (error) return { ok: false, error: userFacingText(error, 'The supporting file could not be uploaded.') };
      assertWorkspaceSession(session);
    } catch (error) {
      return { ok: false, error: userFacingText(error, 'The supporting file could not be uploaded.'), attachment };
    }
  }

  if (!isCurrent()) return { ok: false, error: 'The workspace changed. Reopen this task before saving the file.', attachment };
  const store = useStore.getState();
  const liveTask = store.tasks.find(item => item.id === task.id);
  if (!liveTask) return { ok: false, error: 'This task is no longer available. Reopen it before saving the file.', attachment };
  if (liveTask.supportingAttachments?.some(item => item.path === attachment!.path) && store.backend.hasLocalChanges) {
    const retry = await store.retryPendingSave('task.update');
    if (!isCurrent()) return { ok: false, error: 'The workspace changed. Reopen this task before saving the file.', attachment };
    if (!retry.ok) return { ...retry, attachment };
    if (useStore.getState().tasks.some(item => item.id === task.id && item.supportingAttachments?.some(item => item.path === attachment!.path))) return { ok: true };
  }

  const result = await useStore.getState().attachTaskSupportingFile(task.id, attachment);
  if (!result.ok) {
    if (isWorkspaceMutationLocked(useStore.getState())) return { ok: false, error: userFacingText(result.error, 'The change is waiting to be saved.'), attachment };
    let cleanupUncertain = false;
    try {
      const { error } = await supabase.storage.from(TASK_SUPPORTING_FILES_BUCKET).remove([attachment.path]);
      cleanupUncertain = Boolean(error);
    } catch {
      cleanupUncertain = true;
    }
    return {
      ok: false,
      error: userFacingText(result.error, 'The supporting file could not be saved.'),
      ...(cleanupUncertain ? { attachment } : {}),
    };
  }

  const saved = await useStore.getState().commitPendingMutation('task.update');
  if (!isCurrent()) return { ok: false, error: 'The workspace changed. Reopen this task before confirming the file.', attachment };
  if (!saved.ok) return { ...saved, attachment };
  if (!useStore.getState().tasks.some(item => item.id === task.id && item.supportingAttachments?.some(fileItem => fileItem.path === attachment!.path))) {
    return { ok: false, error: 'The supporting file has not been confirmed. Retry the save.', attachment };
  }
  return { ok: true };
};
