import { isMessageId, msg, type MessageDescriptor } from './messages';

/** Presentation only: preserve application validation, hide transport/database internals. */
export const userFacingMessage = (value: unknown): string | MessageDescriptor => {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'object' && 'id' in value && typeof value.id === 'string' && isMessageId(value.id)) return value as MessageDescriptor;
  if (typeof value === 'object' && 'message' in value) value = value.message;
  if (typeof value !== 'string') return msg('errors.requestFailed');
  const text = value.trim();
  if (!text) return '';
  if (/^Complete every required predecessor before/.test(text)) return 'Complete the earlier workflow steps first.';
  if (/^Workflow details are unavailable\./.test(text)) return 'Workflow details are unavailable. Refresh this task and try again.';
  if (/^FORBIDDEN:/i.test(text)) return msg('errors.permissionDenied');
  if (/^CONFLICT:/i.test(text)) return 'This work changed elsewhere. Review the saved data before retrying.';
  if (/^NOT_FOUND:/i.test(text)) return msg('feedback.unavailable');
  if (/^VALIDATION:/i.test(text)) return userFacingMessage(text.replace(/^VALIDATION:\s*/i, ''));
  if (/^(?:Save confirmation timed out|Save was not confirmed|Supabase could not (?:be reached|confirm the save))/.test(text)) return /draft/.test(text) ? msg('errors.connectionUnavailable') : msg('feedback.saveUnconfirmed');
  if (/^Private file (?:uploads|downloads|cleanup) require the Supabase backend\./.test(text)) return 'File sharing is unavailable in this workspace. Ask your workspace administrator to enable it.';
  if (/^Upload (?:reconciliation|confirmation)/.test(text)) return 'The upload could not be confirmed. The file has been kept for another check.';
  if (/^The password changed, but Supabase could not finalize account setup\./.test(text)) return 'Your password changed, but account setup could not finish. Sign in with the new password and try again.';
  if (/\bSupabase\b/i.test(text)) return msg('errors.requestFailed');
  if (/\b(?:PostgREST|PGRST\d+|RPC|sync failed|retained for retry|browser tab)\b/i.test(text)) return msg('errors.requestFailed');
  if (/^(?:TypeError:\s*)?(?:Failed to fetch|fetch failed|Load failed|NetworkError\b|Network request failed|The network connection was lost)/i.test(text)) return msg('errors.connectionUnavailable');
  if (/^(?:Invalid Refresh Token|Refresh Token (?:Not Found|Has Expired)|JWT (?:expired|is expired)|Auth session missing)/i.test(text)) return msg('errors.sessionExpired');
  if (/^(?:new row violates row-level security|permission denied for (?:table|schema|function|relation)|violates row-level security)/i.test(text)) return msg('errors.permissionDenied');
  if (/^(?:duplicate key value violates unique constraint|23505\b)/i.test(text)) return msg('errors.duplicateRecord');
  if (/^(?:update or delete on table|insert or update on table).*foreign key constraint/i.test(text)) return msg('errors.linkedRecord');
  if (/^(?:invalid input syntax for|value too long for type|new row for relation .* violates check constraint|null value in column .* violates not-null constraint|23514\b|23503\b)/i.test(text)) return msg('errors.invalidData');
  if (/^(?:Object not found|The resource was not found|No such object|Storage object not found)/i.test(text)) return msg('errors.fileUnavailable');
  if (/^(?:\[object Object\]|(?:Error:\s*)?(?:Cannot read properties of|Cannot destructure|Unexpected token|Unexpected end of JSON|SyntaxError\b|ReferenceError\b|TypeError\b)|Could not find (?:the (?:function|table)|a relationship)|relation .* does not exist|column .* does not exist|PGRST\d+\b|Functions(?:Http|Relay|Fetch)Error\b|Edge Function returned|JSON object requested|Cannot coerce the result|syntax error at or near|canceling statement due to statement timeout)/i.test(text)) return msg('errors.requestFailed');
  return value;
};
