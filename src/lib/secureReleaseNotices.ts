import type { ReleaseNoticeAcknowledgementResult, SecureReleaseNoticeRuntime } from './secureWorkspace';
import { readReleaseNoticeResponse } from './secureReleaseNoticeResponse';

export const requestReleaseNotice = async (noticeId: string, acknowledge: boolean, runtime: SecureReleaseNoticeRuntime): Promise<ReleaseNoticeAcknowledgementResult> => {
  const { cleanPortalText, bindSessionRequest, withSyncTimeout, supabase, SECURE_WORKSPACE_ID, isAuthError, refreshSecureSession, commandErrorCode, SyncRequestTimeoutError } = runtime;
  const normalizedNoticeId = cleanPortalText(noticeId, 80);
  if (!normalizedNoticeId) return { ok: false, code: 'VALIDATION', error: 'Choose a release notice.' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return {
    ok: false, code: 'OFFLINE', error: acknowledge ? 'Reconnect before saving the release notice acknowledgement.' : 'Reconnect before checking the release notice.',
  };
  const invoke = bindSessionRequest(() => withSyncTimeout(supabase.rpc(acknowledge ? 'aitask_acknowledge_release_notice' : 'aitask_get_release_notice_acknowledgement', {
    p_workspace_id: SECURE_WORKSPACE_ID, p_notice_id: normalizedNoticeId,
  })));
  const failure = acknowledge ? "We couldn't save your acknowledgement. Please try again." : "We couldn't check the release notice. Please try again.";
  let result: Awaited<ReturnType<typeof invoke>>;
  try {
    result = await invoke();
    if (isAuthError(result.error) && await refreshSecureSession()) result = await invoke();
  } catch (error) {
    return {
      ok: false, code: typeof navigator !== 'undefined' && navigator.onLine === false ? 'OFFLINE' : 'RETRY_REQUIRED',
      error: error instanceof SyncRequestTimeoutError
        ? 'This is taking longer than expected. It will be checked again next time.'
        : failure,
    };
  }
  if (result.error) return { ok: false, code: isAuthError(result.error) ? 'FORBIDDEN' : commandErrorCode(result.error), error: result.error.message || failure };
  return readReleaseNoticeResponse(result.data, normalizedNoticeId);
};
