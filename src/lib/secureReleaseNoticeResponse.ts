import type { ReleaseNoticeAcknowledgementResult } from './secureWorkspace';

/** Loaded with the acknowledgement request, keeping response-only parsing out
 * of the startup workspace runtime. */
export const readReleaseNoticeResponse = (value: unknown, noticeId: string): ReleaseNoticeAcknowledgementResult => {
  const response = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  if (response?.ok !== true) return {
    ok: false,
    code: response?.code === 'FORBIDDEN' ? 'FORBIDDEN' : 'RETRY_REQUIRED',
    error: typeof response?.error === 'string' ? response.error : 'Supabase returned an invalid release notice response.',
  };
  if ((typeof response.noticeId === 'string' ? response.noticeId.trim().slice(0, 80) : '') !== noticeId) {
    return { ok: false, code: 'VALIDATION', error: 'The release notice response did not match this update.' };
  }
  return { ok: true, acknowledged: response.acknowledged === true };
};
