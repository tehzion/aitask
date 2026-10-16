import type { MutationErrorCode, ReleaseNoticeAcknowledgementResult } from './secureWorkspace';

const releaseNoticeErrorCodes = new Set<MutationErrorCode>(['OFFLINE', 'CONFLICT', 'FORBIDDEN', 'VALIDATION', 'NOT_FOUND', 'RETRY_REQUIRED']);

/** Loaded with the acknowledgement request, keeping response-only parsing out
 * of the startup workspace runtime. */
export const readReleaseNoticeResponse = (value: unknown, noticeId: string): ReleaseNoticeAcknowledgementResult => {
  const response = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  if (response?.ok !== true) {
    const code = typeof response?.code === 'string' && releaseNoticeErrorCodes.has(response.code as MutationErrorCode)
      ? response.code as MutationErrorCode
      : 'RETRY_REQUIRED';
    return {
      ok: false,
      code,
      error: typeof response?.error === 'string' ? response.error : "We couldn't load the release notice. Please try again.",
    };
  }
  if ((typeof response.noticeId === 'string' ? response.noticeId.trim().slice(0, 80) : '') !== noticeId) {
    return { ok: false, code: 'VALIDATION', error: 'The release notice response did not match this update.' };
  }
  return { ok: true, acknowledged: response.acknowledged === true };
};
