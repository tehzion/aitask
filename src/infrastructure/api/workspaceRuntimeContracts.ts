import type { getLegacyDepartmentMirror, normalizeMemberDepartments } from '../../shared/authorization/departments';
import type { supabase } from '../database/supabaseClient';
import type { captureWorkspaceSession, isWorkspaceSessionCurrent } from '../persistence/workspaceSession';
import type { BaselineRow, RetainedSecureMemberMutationWithId } from './workspaceContracts';
import type { commandId, entityKey, memberData, stable } from './workspaceSerialization';
import type { bindSessionRequest, commandErrorCode, isAuthError, refreshSecureSession, SyncRequestTimeoutError, withSyncTimeout } from './workspaceTransport';

type RequestRuntime = {
  bindSessionRequest: typeof bindSessionRequest;
  withSyncTimeout: typeof withSyncTimeout;
  supabase: typeof supabase;
  SECURE_WORKSPACE_ID: string;
  isAuthError: typeof isAuthError;
  refreshSecureSession: typeof refreshSecureSession;
  commandErrorCode: typeof commandErrorCode;
  SyncRequestTimeoutError: typeof SyncRequestTimeoutError;
};

type SessionRuntime = {
  captureWorkspaceSession: typeof captureWorkspaceSession;
  isWorkspaceSessionCurrent: typeof isWorkspaceSessionCurrent;
  baseline: Map<string, BaselineRow>;
  entityKey: typeof entityKey;
  stable: typeof stable;
  commandId: typeof commandId;
};

type PortalText = (value: unknown, maxLength: number) => string;

export type SecureMemberMutationRuntime = RequestRuntime & SessionRuntime & {
  retryableMemberDepartments: Extract<RetainedSecureMemberMutationWithId, { kind: 'departments' }> | null;
  retryableMemberPermissions: Extract<RetainedSecureMemberMutationWithId, { kind: 'permissions' }> | null;
  retryableMemberRole: Extract<RetainedSecureMemberMutationWithId, { kind: 'role' }> | null;
  normalizeMemberDepartments: typeof normalizeMemberDepartments;
  retainedMemberMutationWithId: () => RetainedSecureMemberMutationWithId | null;
  persistRetryableMemberMutation: () => void;
  clearPersistedRetryableMemberMutation: (authUserId?: string | null) => void;
  getLegacyDepartmentMirror: typeof getLegacyDepartmentMirror;
  memberData: typeof memberData;
};

export type SecureReleaseNoticeRuntime = RequestRuntime & {
  cleanPortalText: PortalText;
};

export type SecureNotificationRuntime = RequestRuntime & SessionRuntime & {
  retryableNotificationMutation: {
    id: string;
    notificationIds: string[];
    isRead: boolean;
    markAll: boolean;
    restored?: boolean;
  } | null;
  isRecord: (value: unknown) => value is Record<string, unknown>;
  cleanPortalText: PortalText;
};
