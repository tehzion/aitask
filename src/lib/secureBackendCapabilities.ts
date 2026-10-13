import type { SecureBackendCapabilities, SecureBackendCompatibility } from './secureWorkspace';

type RpcResponse = { data: unknown; error: { code?: string; message?: string } | null };
export const loadBackendCompatibility = async (invoke: () => PromiseLike<RpcResponse>, refresh: () => Promise<boolean>, isAuthError: (error: RpcResponse['error']) => boolean, expectedSchemaVersion: number, upgradeMessage: string): Promise<SecureBackendCompatibility> => {
  let result: RpcResponse;
  try {
    result = await invoke();
    if (isAuthError(result.error) && await refresh()) result = await invoke();
  } catch { return { compatible: false, error: upgradeMessage }; }
  if (result.error) return { compatible: false, code: result.error.code, error: upgradeMessage };
  const response = result.data as Partial<SecureBackendCapabilities> & { ok?: boolean };
  const capabilities: SecureBackendCapabilities = {
    schemaVersion: Number(response?.schemaVersion) || 0,
    workspaceOptimisticLock: response?.workspaceOptimisticLock === true,
    serviceOperations: response?.serviceOperations === true,
    releaseNoticeAcknowledgements: response?.releaseNoticeAcknowledgements === true,
    memberPermissionManagement: response?.memberPermissionManagement === true,
    workflowReviewGate: response?.workflowReviewGate === true,
  };
  return response?.ok === true && capabilities.schemaVersion === expectedSchemaVersion
    && capabilities.workspaceOptimisticLock && capabilities.serviceOperations && capabilities.releaseNoticeAcknowledgements
    && capabilities.memberPermissionManagement && capabilities.workflowReviewGate
    ? { compatible: true, capabilities } : { compatible: false, error: upgradeMessage };
};
