import { formatMessage, isMessageId, msg, type MessageDescriptor } from './messages';

type ErrorLike = {
  code?: unknown;
  details?: unknown;
  hint?: unknown;
  message?: unknown;
  name?: unknown;
  status?: unknown;
  statusCode?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const asText = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : '';

const errorText = (value: ErrorLike) => [value.message, value.details, value.hint]
  .map(asText)
  .filter(Boolean)
  .join(' ');

const errorCode = (value: ErrorLike) => asText(value.code).toUpperCase();

const errorStatus = (value: ErrorLike) => {
  const status = value.status ?? value.statusCode;
  const parsed = typeof status === 'number' ? status : Number(asText(status));
  return Number.isInteger(parsed) ? parsed : 0;
};

const technicalMessagePattern = /(?:\[object Object\]|(?:Error|TypeError|ReferenceError|SyntaxError):|Cannot (?:read|set|destructure)|Unexpected (?:token|end of JSON)|relation .* does not exist|column .* does not exist|Could not find (?:the )?(?:function|table|relationship)|permission denied for (?:table|schema|function|relation)|row-level security|violates (?:unique|foreign key|check|not-null) constraint|invalid input syntax for|PGRST\d+|PostgREST|Functions?(?:Http|Relay|Fetch)Error|Edge Function returned|JSON object requested|Cannot coerce the result|syntax error at or near|canceling statement due to statement timeout|Internal Server Error|Bad Gateway|Service Unavailable|Gateway Timeout)/i;

const isTechnicalErrorText = (text: string) => (
  technicalMessagePattern.test(text)
  || /\b(?:Supabase|PostgREST|PGRST\d+|RPC|sync failed|retained for retry|browser tab)\b/i.test(text)
  || /^(?:TypeError:\s*)?(?:Failed to fetch|fetch failed|Load failed|NetworkError\b|Network request failed|The network connection was lost)/i.test(text)
  || /^(?:(?:401\s+)?Unauthorized|(?:403\s+)?Forbidden|Invalid Refresh Token|Refresh Token (?:Not Found|Has Expired)|JWT (?:expired|is expired)|Auth session missing)(?::|$)/i.test(text)
  || /^(?:Object not found|The resource was not found|No such object|Storage object not found|no rows returned)/i.test(text)
  || /database (?:temporarily )?unavailable|server (?:error|unavailable)|could not (?:reach|connect to) (?:the )?(?:server|workspace)/i.test(text)
);

/**
 * Presentation boundary for system feedback. Application validation and
 * workflow guidance are preserved, while transport, database, auth, and
 * runtime details are converted into safe, actionable copy.
 */
export const userFacingMessage = (value: unknown): string | MessageDescriptor => {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'object' && 'id' in value && typeof value.id === 'string' && isMessageId(value.id)) return value as MessageDescriptor;
  const metadata: ErrorLike = isRecord(value) ? value : {};
  const code = errorCode(metadata);
  const status = errorStatus(metadata);
  const text = typeof value === 'string' ? value.trim() : errorText(metadata);
  if (!text && (code || status)) return msg('errors.requestFailed');
  if (!text) return isRecord(value) ? msg('errors.requestFailed') : '';
  if (!text) return '';
  if (/^Complete every required predecessor before/.test(text)) return 'Complete the earlier workflow steps first.';
  if (/^Workflow details are unavailable\./.test(text)) return 'Workflow details are unavailable. Refresh this task and try again.';
  if (/^FORBIDDEN:/i.test(text)) return msg('errors.permissionDenied');
  if (/^CONFLICT:/i.test(text)) return 'This work changed elsewhere. Review the saved data before retrying.';
  if (/^NOT_FOUND:/i.test(text)) return msg('feedback.unavailable');
  if (/^VALIDATION:/i.test(text)) return userFacingMessage(text.replace(/^VALIDATION:\s*/i, ''));
  if (/row-level security policy|permission denied for (?:table|schema|function|relation)|(?:permission|authorization) required/i.test(text)) return msg('errors.permissionDenied');
  if (/^(?:Object not found|The resource was not found|No such object|Storage object not found)/i.test(text)) return msg('errors.fileUnavailable');
  const technical = isTechnicalErrorText(text);
  if ((status === 401 || /^(?:401|UNAUTHENTICATED|UNAUTHORIZED)\b/i.test(code) || /^(?:(?:401\s+)?Unauthorized|invalid refresh token|refresh token (?:not found|has expired)|jwt (?:expired|is expired)|auth session missing|session has expired)/i.test(text)) && technical) return msg('errors.sessionExpired');
  if ((status === 403 || code === '42501' || code === '403' || /^(?:FORBIDDEN|PERMISSION_DENIED)\b/i.test(code) || /^(?:(?:403\s+)?Forbidden|new row violates row-level security|permission denied for (?:table|schema|function|relation)|violates row-level security)/i.test(text)) && technical) return msg('errors.permissionDenied');
  const missingResource = /^(?:Object not found|The resource was not found|No such object|Storage object not found|no rows returned)/i.test(text);
  if ((status === 404 || code === 'PGRST116' || code === '404' || /^PGRST116\b/i.test(text) || missingResource) && (technical || missingResource)) return msg('errors.recordUnavailable');
  if ((status === 408 || status === 504 || /(?:timeout|timed out|statement timeout)/i.test(text)) && technical) return msg('errors.requestTimedOut');
  if ((status === 429 || code === '429' || /too many requests|rate limit/i.test(text)) && technical) return msg('errors.rateLimited');
  if (status >= 500 && status <= 599 && technical) return msg('errors.requestFailed');
  if (/^(?:Save confirmation timed out|Save was not confirmed|Supabase could not (?:be reached|confirm the save))/.test(text)) return /draft/.test(text) ? msg('errors.connectionUnavailable') : msg('feedback.saveUnconfirmed');
  if (/^Private file (?:uploads|downloads|cleanup) require the Supabase backend\./.test(text)) return 'File sharing is unavailable in this workspace. Ask your workspace administrator to enable it.';
  if (/^Upload (?:reconciliation|confirmation)/.test(text)) return 'The upload could not be confirmed. The file has been kept for another check.';
  if (/^(?:upload failed|unable to upload|could not upload|upload .* failed|storage object|the uploaded file|could not (?:attach|remove) the uploaded file)/i.test(text) && !/object not found|resource was not found|no such object/i.test(text)) return msg('errors.uploadFailed');
  if (/^The password changed, but Supabase could not finalize account setup\./.test(text)) return 'Your password changed, but account setup could not finish. Sign in with the new password and try again.';
  if (/^(?:TypeError:\s*)?(?:Failed to fetch|fetch failed|Load failed|NetworkError\b|Network request failed|The network connection was lost)/i.test(text)) return msg('errors.connectionUnavailable');
  if ((code === '23505' && technical) || /^(?:duplicate key value violates unique constraint|23505\b)/i.test(text)) return msg('errors.duplicateRecord');
  if ((code === '23503' && technical) || /^(?:update or delete on table|insert or update on table).*foreign key constraint/i.test(text)) return msg('errors.linkedRecord');
  if ((code === '23514' && technical) || /^(?:invalid input syntax for|value too long for type|new row for relation .* violates check constraint|null value in column .* violates not-null constraint|23514\b)/i.test(text)) return msg('errors.invalidData');
  if (/^(?:Object not found|The resource was not found|No such object|Storage object not found)/i.test(text)) return msg('errors.fileUnavailable');
  if (technical) return msg('errors.requestFailed');
  return text;
};

/** Return safe English copy for non-React callers that need a string result. */
export const userFacingText = (value: unknown, fallback: string | MessageDescriptor = msg('errors.requestFailed')) => {
  const metadata: ErrorLike = isRecord(value) ? value : {};
  const rawText = typeof value === 'string' ? value.trim() : errorText(metadata);
  if (rawText && !isTechnicalErrorText(rawText)) return rawText;
  const resolved = userFacingMessage(value);
  if (resolved) return typeof resolved === 'string' ? resolved : formatMessage(resolved, 'en');
  return typeof fallback === 'string' ? fallback : formatMessage(fallback, 'en');
};
