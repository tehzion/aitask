import { type StoreState, type SyncStatus } from '../../shared/types/workspaceStore';
import { getRetainedSecureCommand, getRetainedSecureMemberMutation } from '../api/secureWorkspace';
import { type MutationErrorCode } from '../api/workspaceContracts';
import {
  shouldUseSecureSupabase
} from '../database/supabaseClient';
export const pendingMutationMessage = 'Changes are temporarily unavailable while AiTask resolves a pending save or completes a system update.';

export const isTerminalMutationError = (code?: MutationErrorCode) => (
  code === 'VALIDATION' || code === 'FORBIDDEN' || code === 'NOT_FOUND'
);

export const isPendingMutationResolution = (backend: {
  status: SyncStatus;
  upgradeRequired?: boolean;
  hasLocalChanges: boolean;
  pendingMutations: number;
  errorCode?: MutationErrorCode;
}) => (
  !backend.upgradeRequired
  && (
    backend.status === 'conflict'
    || backend.status === 'retry_required'
    || (backend.status === 'offline' && (backend.hasLocalChanges || backend.pendingMutations > 0))
    // A permanent rejection still needs an explicit restore before the
    // optimistic projection can be used for another save, but it must never
    // be presented as retryable. The rejected request has already been
    // cleared by the command batch runner.
    || (backend.status === 'refresh_required'
      && (backend.hasLocalChanges || backend.pendingMutations > 0)
      && isTerminalMutationError(backend.errorCode))
  )
);

export const hasRetainedSecureMutation = () => (
  shouldUseSecureSupabase()
  && Boolean(getRetainedSecureCommand() || getRetainedSecureMemberMutation())
);

export const isWorkspaceMutationLocked = (state: StoreState) => (
  shouldUseSecureSupabase()
  && (
    state.backend.upgradeRequired === true
    || state.backend.isRestoring === true
    || hasRetainedSecureMutation()
    || isPendingMutationResolution(state.backend)
  )
);

export const isTerminalMemberMutationError = isTerminalMutationError;

export const isSyncBusy = (state: StoreState) => state.backend.isSaving || state.backend.isPulling || state.backend.isRestoring === true;

export const isPullBlockedByPendingChange = (state: StoreState) => (
  shouldUseSecureSupabase()
  && (
    state.backend.hasLocalChanges
    || state.backend.pendingMutations > 0
    || ['conflict', 'retry_required', 'offline'].includes(state.backend.status)
  )
);
