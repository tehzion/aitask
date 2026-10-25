import { supabase } from '../database/supabaseClient';
import { recordDiagnostic } from '../observability/diagnostics';
import { assertWorkspaceSession, captureWorkspaceSession } from '../persistence/workspaceSession';
import { type MutationErrorCode } from './workspaceContracts';
export const SYNC_REQUEST_TIMEOUT_MS = 20_000;

export const commandErrorCode = (error: { code?: string; message?: string }): MutationErrorCode => {
  const message = error.message || '';
  // PostgreSQL reports trigger check violations as 23514. Permission failures
  // are permanent until an administrator changes access, so retaining and
  // retrying the exact same task command only traps the user in retry mode.
  if (error.code === '42501' || /permission|(?:workspace membership|authentication|authorization)(?: is)? required|not permitted|forbidden/i.test(message)) {
    return 'FORBIDDEN';
  }
  if (error.code === '23514' || error.code === '23503' || error.code === '23505') {
    return 'VALIDATION';
  }
  return 'RETRY_REQUIRED';
};

export class SyncRequestTimeoutError extends Error {
  constructor() {
    super('The server took too long to respond. Please try again.');
    this.name = 'SyncRequestTimeoutError';
  }
}

export const withSyncTimeout = async <T>(request: PromiseLike<T>): Promise<T> => {
  const started = performance.now();
  const sessionToken = captureWorkspaceSession();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let rejectAborted: (() => void) | undefined;
  try {
    assertWorkspaceSession(sessionToken);
    const result = await Promise.race([
      Promise.resolve(request),
      new Promise<never>((_, reject) => {
        rejectAborted = () => reject(new DOMException('Workspace session changed.', 'AbortError'));
        sessionToken.signal.addEventListener('abort', rejectAborted, { once: true });
      }),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new SyncRequestTimeoutError()), SYNC_REQUEST_TIMEOUT_MS);
      }),
    ]);
    assertWorkspaceSession(sessionToken);
    recordDiagnostic('sync.request', performance.now() - started);
    return result;
  } catch (error) {
    recordDiagnostic('sync.request', performance.now() - started, error instanceof SyncRequestTimeoutError ? 'timeout' : error instanceof DOMException && error.name === 'AbortError' ? 'aborted' : 'failed');
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
    if (rejectAborted) sessionToken.signal.removeEventListener('abort', rejectAborted);
  }
};

export const bindSessionRequest = <T,>(request: () => Promise<T>) => {
  const token = captureWorkspaceSession();
  return async () => {
    assertWorkspaceSession(token);
    const result = await request();
    assertWorkspaceSession(token);
    return result;
  };
};

export const isAuthError = (error: { code?: string; message?: string; details?: string } | null) => {
  if (!error) return false;
  const detail = `${error.code || ''} ${error.message || ''} ${error.details || ''}`;
  return /PGRST301|JWT|token.*expired|not authenticated|authentication required|\b401\b/i.test(detail);
};

export const refreshSecureSession = async () => {
  const { data, error } = await withSyncTimeout(supabase.auth.refreshSession());
  return !error && Boolean(data.session);
};
