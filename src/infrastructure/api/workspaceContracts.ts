import { enMessages } from '../../shared/i18n/messages';
import type {
  Department,
  NotificationCategory,
  NotificationCursor,
  Role,
  RolePermissions,
  WorkspaceMember
} from '../../shared/types/index';
export const SECURE_WORKSPACE_ID = 'aitask-main';

export const SECURE_SYNC_PROTOCOL_VERSION = 1;

export const SECURE_BACKEND_SCHEMA_VERSION = 4;

export const BACKEND_UPGRADE_REQUIRED_MESSAGE = enMessages['errors.workspaceUpgrade'];

export const BACKEND_RETRY_REQUIRED_MESSAGE = enMessages['errors.workspaceRetry'];

export const WORKSPACE_ENTITY_TYPES = [
  'task', 'project', 'client', 'comment', 'approval', 'task_status', 'custom_role',
  'registration', 'service_package', 'client_plan', 'service_cycle', 'service_cycle_payment', 'deliverable',
  'cycle_comment', 'addon', 'service_workflow_template', 'service_pricing_snapshot',
] as const;

export const SECURE_COMMAND_TYPES = [
  'workspace.patch',
  'task.create',
  'task.update',
  'task.delete',
  'project.create',
  'project.update',
  'project.delete',
  'client.upsert',
  'client.rename',
  'client.delete',
  'comment.add',
  'approval.review',
  'approval.revision',
  'notification.read',
  'notification.read_all',
  'member.update',
  'member.manage',
  'role.manage',
  'registration.review',
  'task_status.manage',
  'reminder.generate',
  'service_package.manage',
  'client_plan.manage',
  'service_cycle.manage',
  'service_cycle_payment.record',
  'service_cycle_payment.void',
  'deliverable.manage',
  'cycle_comment.manage',
  'addon.manage',
  'service_workflow.manage',
  'deliverable.workflow.generate',
] as const;

export type SecureCommandType = typeof SECURE_COMMAND_TYPES[number];

export const secureCommandTypeSet = new Set<string>(SECURE_COMMAND_TYPES);

export const isSecureCommandType = (value: unknown): value is SecureCommandType => (
  typeof value === 'string' && secureCommandTypeSet.has(value)
);

export type MutationErrorCode = 'OFFLINE' | 'CONFLICT' | 'FORBIDDEN' | 'VALIDATION' | 'NOT_FOUND' | 'RETRY_REQUIRED';

export interface MutationConflict {
  entityType: string;
  entityId: string;
  expectedVersion: number;
  actualVersion: number;
  current?: Record<string, unknown>;
  attempted?: Record<string, unknown>;
  changedFields?: string[];
}

export type MutationResult<T> =
  | { ok: true; data: T; commandId: string; workspaceVersion: number; replayed?: boolean }
  | { ok: false; code: MutationErrorCode; error: string; conflict?: MutationConflict };

export type ReleaseNoticeAcknowledgementResult =
  | { ok: true; acknowledged: boolean }
  | { ok: false; code: MutationErrorCode; error: string };

export type MemberRow = {
  id: string;
  workspace_id: string;
  auth_user_id: string | null;
  name: string;
  email: string | null;
  role: WorkspaceMember['role'];
  department: WorkspaceMember['department'] | null;
  departments: WorkspaceMember['departments'] | null;
  avatar: string | null;
  client_name: string | null;
  is_super_admin: boolean;
  must_reset_password: boolean;
  custom_role_id: string | null;
  custom_role_name: string | null;
  permissions: WorkspaceMember['permissions'] | null;
  worker_type: WorkspaceMember['workerType'] | null;
  version: number;
  updated_at: string;
};

export type EntityRow = {
  workspace_id: string;
  entity_type: string;
  entity_id: string;
  parent_id?: string | null;
  data: Record<string, unknown>;
  version: number;
  updated_at: string;
};

export type WorkspaceOperation = {
  kind: 'member' | 'entity';
  action: 'insert' | 'update' | 'delete';
  entityType: string;
  entityId: string;
  parentId?: string;
  expectedVersion: number;
  data?: Record<string, unknown>;
};

export type BaselineRow = {
  kind: WorkspaceOperation['kind'];
  entityType: string;
  entityId: string;
  parentId?: string;
  version: number;
  data: Record<string, unknown>;
  serialized: string;
};

export type CommandResponse = {
  ok: boolean;
  code?: MutationErrorCode;
  error?: string;
  commandId?: string;
  workspaceVersion?: number;
  changed?: Array<{ entityType: string; entityId: string; version: number; updatedAt: string }>;
  deleted?: Array<{ entityType: string; entityId: string }>;
  refreshScope?: 'rows' | 'workspace';
  conflict?: MutationConflict;
  replayed?: boolean;
};

export type MemberDepartmentsResponse = CommandResponse & {
  member?: {
    id: string;
    departments: Department[];
    department: Department;
    version: number;
    updated_at: string;
  };
};

export type MemberPermissionsResponse = CommandResponse & {
  member?: {
    id: string;
    permissions: RolePermissions | Record<string, never>;
    version: number;
    updated_at: string;
  };
};

export type MemberRoleResponse = CommandResponse & {
  member?: {
    id: string;
    role: Role;
    customRoleId?: string;
    customRoleName?: string;
    clientName?: string;
    departments: Department[];
    department: Department;
    version: number;
    updated_at: string;
  };
};

export interface NotificationFeedQuery {
  cursor?: NotificationCursor;
  limit?: number;
  unreadOnly?: boolean;
  category?: NotificationCategory;
  search?: string;
}

export type NotificationReadResponse = CommandResponse & {
  memberId?: string;
  unreadCount?: number;
  changedNotifications?: Array<{
    id: string;
    version: number;
    updatedAt: string;
    isRead: boolean;
  }>;
};

export type SecureCommand = {
  id: string;
  type: SecureCommandType;
  operations: WorkspaceOperation[];
};

export type SecureBackendCapabilities = {
  schemaVersion: number;
  hodReviewRemediation?: boolean;
  optionalTaskApproval?: boolean;
  workflowReviewGate?: boolean;
  workspaceOptimisticLock: boolean;
  serviceOperations: boolean;
  releaseNoticeAcknowledgements: boolean;
  memberPermissionManagement: boolean;
};

export type SecureBackendCompatibility =
  | { compatible: true; capabilities: SecureBackendCapabilities; error?: undefined; code?: undefined; retryable?: undefined }
  | { compatible: false; error: string; code?: string; retryable?: boolean };

export type PendingCommandEnvelope = {
  version: number;
  workspaceId: string;
  authUserId: string;
  command: SecureCommand;
  batch?: PendingCommandBatch;
};

export type MemberRoleAssignment = {
  role: Role;
  customRoleId?: string;
  companyName?: string;
  departments: Department[];
};

export type RetainedSecureMemberMutationWithId =
  | { kind: 'departments'; id: string; memberId: string; departments: Department[]; expectedVersion: number }
  | { kind: 'permissions'; id: string; memberId: string; permissions: RolePermissions | null; expectedVersion: number }
  | {
    kind: 'role';
    id: string;
    memberId: string;
    role: Role;
    customRoleId: string | null;
    companyName: string | null;
    departments: Department[];
    expectedVersion: number;
  };

export type PendingMemberMutationEnvelope = {
  version: number;
  workspaceId: string;
  authUserId: string;
  mutation: RetainedSecureMemberMutationWithId;
};

export type PendingNotificationEnvelope = {
  version: number;
  workspaceId: string;
  authUserId: string;
  mutation: { id: string; notificationIds: string[]; isRead: boolean; markAll: boolean };
};

export type PendingCommandBatch = {
  commands: SecureCommand[];
  before: BaselineRow[];
  cursor: number;
  workspaceVersion?: number;
  attempted: boolean;
};

export type BuildOperationsOptions = {
  excludeSuperAdminEntities?: boolean;
  actorMemberId?: string;
  // Entity types the actor cannot read. The server row stays hidden from the
  // baseline, so the locally seeded copy would otherwise look like a new insert
  // the actor is not allowed to send.
  excludedEntityTypes?: Set<string>;
};

export type RetainedSecureMemberMutation =
  | { kind: 'departments'; memberId: string; departments: Department[]; expectedVersion: number }
  | { kind: 'permissions'; memberId: string; permissions: RolePermissions | null; expectedVersion: number }
  | { kind: 'role'; memberId: string; role: Role; customRoleId: string | null; companyName: string | null; departments: Department[]; expectedVersion: number };

export type WorkspaceLoadOptions = { preserveRetainedCommand?: boolean; consistencyAttempt?: number; shouldApplySnapshot?: () => boolean };
