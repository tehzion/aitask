import type { CommandResponse, MutationResult } from './secureWorkspace';
type RpcResponse = { data: unknown; error: { code?: string; message?: string } | null };
export const finalizePasswordSetup = async (invoke: () => PromiseLike<RpcResponse>, id: string, isAuthError: (error: RpcResponse['error']) => boolean, refreshSecureSession: () => Promise<boolean>): Promise<MutationResult<CommandResponse>> => {
  let result: Awaited<ReturnType<typeof invoke>>;
  try {
    result = await invoke();
  } catch {
    return {
      ok: false,
      code: typeof navigator !== 'undefined' && navigator.onLine === false ? 'OFFLINE' : 'RETRY_REQUIRED',
      error: 'The password changed, but Supabase could not finalize account setup. Sign in with the new password and retry.',
    };
  }
  if (isAuthError(result.error) && await refreshSecureSession()) {
    try {
      result = await invoke();
    } catch {
      return {
        ok: false,
        code: 'RETRY_REQUIRED',
        error: 'The password changed, but Supabase could not finalize account setup. Sign in with the new password and retry.',
      };
    }
  }
  if (result.error) {
    return {
      ok: false,
      code: isAuthError(result.error) ? 'FORBIDDEN' : 'RETRY_REQUIRED',
      error: result.error.message || 'Account setup could not be finalized.',
    };
  }

  const response = result.data as CommandResponse;
  if (!response?.ok) {
    return {
      ok: false,
      code: response?.code || 'RETRY_REQUIRED',
      error: response?.error || 'Account setup could not be finalized.',
    };
  }

  return {
    ok: true,
    data: response,
    commandId: response.commandId || id,
    workspaceVersion: Number(response.workspaceVersion) || 1,
  };
};
