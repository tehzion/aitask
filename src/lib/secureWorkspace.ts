import type { User } from '@supabase/supabase-js';
import type {
  AppNotification,
  ClientContact,
  ClientPortalPayload,
  ClientProfile,
  ClientServicePlan,
  ServicePackage,
  ServiceCycle,
  Deliverable,
  CycleComment,
  Addon,
  ServiceWorkflowTemplate,
  ServicePricingSnapshot,
  CustomRole,
  Department,
  Project,
  NotificationCategory,
  NotificationCursor,
  NotificationFeedPage,
  Registration,
  Task,
  WorkspaceMember,
} from '../types';
import type { PersistedWorkspaceState } from './supabaseSnapshot';
import {
  getLegacyDepartmentMirror,
  normalizeMemberDepartments,
} from './departments';
import { parseNotification, parseWorkspaceSnapshot, safeAvatarSource } from './security';
import { enrichNotificationMetadata } from './notificationCenter';
import { supabase } from './supabaseClient';
import { stripServiceItemPrices } from './serviceManagement';

export const SECURE_WORKSPACE_ID = 'aitask-main';
export const SECURE_SYNC_PROTOCOL_VERSION = 1;
const SYNC_REQUEST_TIMEOUT_MS = 20_000;

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
  'deliverable.manage',
  'cycle_comment.manage',
  'addon.manage',
  'service_workflow.manage',
  'deliverable.workflow.generate',
] as const;

export type SecureCommandType = typeof SECURE_COMMAND_TYPES[number];

const secureCommandTypeSet = new Set<string>(SECURE_COMMAND_TYPES);
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

type MemberRow = {
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

type EntityRow = {
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

type BaselineRow = {
  kind: WorkspaceOperation['kind'];
  entityType: string;
  entityId: string;
  parentId?: string;
  version: number;
  data: Record<string, unknown>;
  serialized: string;
};

type CommandResponse = {
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

type MemberDepartmentsResponse = CommandResponse & {
  member?: {
    id: string;
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

let baseline = new Map<string, BaselineRow>();
let retryableCommand: SecureCommand | null = null;
let retryableMemberDepartments: {
  id: string;
  memberId: string;
  departments: Department[];
  expectedVersion: number;
} | null = null;
let retryableNotificationMutation: {
  id: string;
  notificationIds: string[];
  isRead: boolean;
  markAll: boolean;
} | null = null;

const entityKey = (type: string, id: string) => `${type}:${id}`;
const stable = (value: unknown) => JSON.stringify(value);
const commandId = () => crypto.randomUUID();

class SyncRequestTimeoutError extends Error {
  constructor() {
    super('Supabase did not confirm the request within 20 seconds.');
    this.name = 'SyncRequestTimeoutError';
  }
}

const withSyncTimeout = async <T>(request: PromiseLike<T>): Promise<T> => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(request),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new SyncRequestTimeoutError()), SYNC_REQUEST_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};

const isAuthError = (error: { code?: string; message?: string; details?: string } | null) => {
  if (!error) return false;
  const detail = `${error.code || ''} ${error.message || ''} ${error.details || ''}`;
  return /PGRST301|JWT|token.*expired|not authenticated|authentication required|\b401\b/i.test(detail);
};

const refreshSecureSession = async () => {
  const { data, error } = await supabase.auth.refreshSession();
  return !error && Boolean(data.session);
};

const commandDiagnostic = (command: SecureCommand) => ({
  commandId: command.id,
  commandType: command.type,
  operations: command.operations.map(operation => ({
    kind: operation.kind,
    action: operation.action,
    entityType: operation.entityType,
    entityId: operation.entityId,
    expectedVersion: operation.expectedVersion,
    changedFields: changedFieldsForConflict(
      operation,
      baseline.get(entityKey(operation.entityType, operation.entityId))?.data,
    ),
  })),
});

const stripRuntimeFields = <T extends Record<string, unknown>>(value: T) => {
  const copy = { ...value };
  delete copy.version;
  delete copy.updatedAt;
  delete copy.directoryOnly;
  delete copy.clientProjection;
  delete copy.visibleToCurrentUser;
  return copy;
};

const CLIENT_TASK_PROJECTION_KEYS = [
  'id',
  'clientName',
  'projectId',
  'serviceCycleId',
  'deliverableId',
  'projectName',
  'serviceType',
  'title',
  'description',
  'assignedTo',
  'startDate',
  'dueDate',
  'status',
  'completionPercentage',
  'attachmentLink',
  'attachmentName',
  'website',
  'facebookPage',
  'isCompleted',
  'completedAt',
  'revisionCount',
  'clientApprovalStatus',
  'visibility',
  'workflowStepOrder',
  'workflowStepRequired',
] as const;

export const serializeClientProjectedTask = (task: Task): Record<string, unknown> => {
  const source = task as unknown as Record<string, unknown>;
  return Object.fromEntries(
    CLIENT_TASK_PROJECTION_KEYS
      .filter(key => source[key] !== undefined)
      .map(key => [key, source[key]])
  );
};

const memberToUser = (row: MemberRow): WorkspaceMember => {
  const departments = normalizeMemberDepartments(row.role, row.departments, row.department);
  return {
    id: row.id,
    authUserId: row.auth_user_id || undefined,
    workspaceId: row.workspace_id,
    name: row.name,
    email: row.email || undefined,
    role: row.role,
    departments,
    department: getLegacyDepartmentMirror(row.role, departments),
    avatar: row.avatar || undefined,
    companyName: row.client_name || undefined,
    isSuperAdmin: row.is_super_admin,
    mustResetPassword: row.must_reset_password,
    customRoleId: row.custom_role_id || undefined,
    customRoleName: row.custom_role_name || undefined,
    permissions: row.permissions && Object.keys(row.permissions).length > 0 ? row.permissions : undefined,
    workerType: row.worker_type || 'employee',
    version: Number(row.version) || 1,
    updatedAt: row.updated_at,
  };
};

const memberData = (user: WorkspaceMember): Record<string, unknown> => {
  const departments = normalizeMemberDepartments(user.role, user.departments, user.department);
  return {
    auth_user_id: user.authUserId || null,
    name: user.name,
    email: user.email || null,
    role: user.role,
    departments,
    department: getLegacyDepartmentMirror(user.role, departments),
    avatar: user.avatar || null,
    client_name: user.companyName || null,
    is_super_admin: Boolean(user.isSuperAdmin),
    must_reset_password: Boolean(user.mustResetPassword),
    custom_role_id: user.customRoleId || null,
    custom_role_name: user.customRoleName || null,
    permissions: user.permissions || {},
    worker_type: user.workerType || 'employee',
  };
};

const stateToRows = (state: PersistedWorkspaceState) => {
  const rows: BaselineRow[] = [];
  const push = (
    kind: BaselineRow['kind'],
    entityType: string,
    entityId: string,
    data: Record<string, unknown>,
    version?: number,
    parentId?: string,
  ) => {
    const normalized = stripRuntimeFields(data);
    rows.push({
      kind,
      entityType,
      entityId,
      parentId,
      version: Number(version) || 0,
      data: normalized,
      serialized: stable({ parentId: parentId || null, data: normalized }),
    });
  };

  state.users.filter(user => !user.directoryOnly).forEach(user => (
    push('member', 'member', user.id, memberData(user), user.version)
  ));
  state.clients?.forEach(item => push('entity', 'client', item.id, item as unknown as Record<string, unknown>, item.version));
  state.projects.forEach(item => push('entity', 'project', item.id, item as unknown as Record<string, unknown>, item.version));
  state.tasks.forEach(item => {
    const { comments = [], approvalHistory = [], ...task } = item;
    push(
      'entity',
      'task',
      item.id,
      item.clientProjection
        ? serializeClientProjectedTask(item)
        : task as unknown as Record<string, unknown>,
      item.version,
      item.projectId,
    );
    comments.forEach(comment => push(
      'entity',
      'comment',
      comment.id,
      { ...comment, taskId: item.id } as unknown as Record<string, unknown>,
      comment.version,
      item.id,
    ));
    approvalHistory.forEach(event => push(
      'entity',
      'approval',
      event.id,
      { ...event, taskId: item.id } as unknown as Record<string, unknown>,
      event.version,
      item.id,
    ));
  });
  state.notifications.forEach(item => push('entity', 'notification', item.id, item as unknown as Record<string, unknown>, item.version));
  state.registrations.forEach(item => push('entity', 'registration', item.id, item as unknown as Record<string, unknown>, item.version));
  state.rolePermissions?.forEach(item => push('entity', 'custom_role', item.id, item as unknown as Record<string, unknown>, item.version));
  state.taskStatuses?.forEach(status => {
    const existing = baseline.get(entityKey('task_status', status));
    push('entity', 'task_status', status, { status }, existing?.version);
  });
  state.servicePackages?.forEach(item => push('entity', 'service_package', item.id, item as unknown as Record<string, unknown>, item.version));
  state.clientPlans?.forEach(item => push('entity', 'client_plan', item.id, {
    ...item,
    serviceItems: stripServiceItemPrices(item.serviceItems),
    discountValue: 0,
    taxRateBps: 0,
  } as unknown as Record<string, unknown>, item.version, item.clientId));
  state.serviceCycles?.forEach(item => push('entity', 'service_cycle', item.id, {
    ...item,
    serviceItems: stripServiceItemPrices(item.serviceItems),
    addonSnapshots: item.addonSnapshots.map(addon => ({ ...addon, unitPriceMinor: 0 })),
    discountValue: 0,
    taxRateBps: 0,
  } as unknown as Record<string, unknown>, item.version, item.planId));
  state.deliverables?.forEach(item => push('entity', 'deliverable', item.id, item as unknown as Record<string, unknown>, item.version, item.cycleId));
  state.cycleComments?.forEach(item => push('entity', 'cycle_comment', item.id, item as unknown as Record<string, unknown>, item.version, item.cycleId));
  state.addons?.forEach(item => push('entity', 'addon', item.id, { ...item, unitPriceMinor: 0 } as unknown as Record<string, unknown>, item.version, item.planId));
  state.serviceWorkflowTemplates?.forEach(item => push('entity', 'service_workflow_template', item.id, item as unknown as Record<string, unknown>, item.version));
  state.servicePricingSnapshots?.forEach(item => push('entity', 'service_pricing_snapshot', item.id, item as unknown as Record<string, unknown>, item.version, item.parentId));
  return rows;
};

const rowsToBaseline = (members: MemberRow[], entities: EntityRow[]) => {
  const next = new Map<string, BaselineRow>();
  members.forEach(row => {
    const data = memberData(memberToUser(row));
    next.set(entityKey('member', row.id), {
      kind: 'member', entityType: 'member', entityId: row.id, version: Number(row.version) || 1,
      data, serialized: stable({ parentId: null, data }),
    });
  });
  entities.forEach(row => {
    const data = stripRuntimeFields(row.data);
    next.set(entityKey(row.entity_type, row.entity_id), {
      kind: 'entity', entityType: row.entity_type, entityId: row.entity_id,
      parentId: row.parent_id || undefined, version: Number(row.version) || 1,
      data, serialized: stable({ parentId: row.parent_id || null, data }),
    });
  });
  baseline = next;
};

const alignBaselineToCanonicalState = (state: PersistedWorkspaceState) => {
  const canonical = new Map<string, BaselineRow>();
  stateToRows(state).forEach(row => {
    const previous = baseline.get(entityKey(row.entityType, row.entityId));
    canonical.set(entityKey(row.entityType, row.entityId), {
      ...row,
      version: previous?.version || row.version || 1,
    });
  });
  baseline = canonical;
};

const buildOperations = (state: PersistedWorkspaceState): WorkspaceOperation[] => {
  const nextRows = stateToRows(state);
  const nextKeys = new Set(nextRows.map(row => entityKey(row.entityType, row.entityId)));
  const operations: WorkspaceOperation[] = [];

  nextRows.forEach(row => {
    const key = entityKey(row.entityType, row.entityId);
    const previous = baseline.get(key);
    if (!previous) {
      operations.push({
        kind: row.kind,
        action: 'insert',
        entityType: row.entityType,
        entityId: row.entityId,
        parentId: row.parentId,
        expectedVersion: 0,
        data: row.data,
      });
      return;
    }
    if (previous.serialized !== row.serialized) {
      operations.push({
        kind: row.kind,
        action: 'update',
        entityType: row.entityType,
        entityId: row.entityId,
        parentId: row.parentId,
        expectedVersion: previous.version,
        data: row.data,
      });
    }
  });

  baseline.forEach(row => {
    const key = entityKey(row.entityType, row.entityId);
    if (!nextKeys.has(key)) {
      operations.push({
        kind: row.kind,
        action: 'delete',
        entityType: row.entityType,
        entityId: row.entityId,
        parentId: row.parentId,
        expectedVersion: row.version,
      });
    }
  });

  return operations;
};

const changedFieldsForConflict = (operation: WorkspaceOperation, current?: Record<string, unknown>) => {
  if (!operation.data) return [];
  const keys = new Set([...Object.keys(operation.data), ...Object.keys(current || {})]);
  return [...keys].filter(key => stable(operation.data?.[key]) !== stable(current?.[key])).sort();
};

export const inferSecureCommandType = (operations: WorkspaceOperation[]): SecureCommandType => {
  const entityTypes = new Set(operations.map(operation => operation.entityType));
  const actions = new Set(operations.map(operation => operation.action));
  const only = (entityType: string) => entityTypes.size === 1 && entityTypes.has(entityType);

  if (entityTypes.has('member')) return entityTypes.size === 1 && actions.size === 1 && actions.has('update')
    ? 'member.update'
    : 'member.manage';
  if (only('task')) return actions.size === 1 && actions.has('insert')
    ? 'task.create'
    : actions.size === 1 && actions.has('delete')
      ? 'task.delete'
      : 'task.update';
  if (only('project')) return actions.size === 1 && actions.has('insert')
    ? 'project.create'
    : actions.size === 1 && actions.has('delete')
      ? 'project.delete'
      : 'project.update';
  if (only('client')) return actions.has('delete') ? 'client.delete' : 'client.upsert';
  if (only('comment')) return 'comment.add';
  if (only('approval')) return 'approval.review';
  if (only('notification')) return operations.length === 1 ? 'notification.read' : 'notification.read_all';
  if (only('custom_role')) return 'role.manage';
  if (only('registration')) return 'registration.review';
  if (only('task_status')) return 'task_status.manage';
  return 'workspace.patch';
};

const applyCommandVersions = (command: SecureCommand, response: CommandResponse) => {
  const versions = new Map((response.changed || []).map(item => [entityKey(item.entityType, item.entityId), item]));
  command.operations.forEach(operation => {
    const key = entityKey(operation.entityType, operation.entityId);
    if (operation.action === 'delete') {
      baseline.delete(key);
      return;
    }
    const changed = versions.get(key);
    const data = operation.data || {};
    baseline.set(key, {
      kind: operation.kind,
      entityType: operation.entityType,
      entityId: operation.entityId,
      parentId: operation.parentId,
      version: Number(changed?.version) || Math.max(1, operation.expectedVersion + 1),
      data,
      serialized: stable({ parentId: operation.parentId || null, data }),
    });
  });
};

const executeCommand = async (command: SecureCommand): Promise<MutationResult<CommandResponse>> => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    retryableCommand = command;
    return { ok: false, code: 'OFFLINE', error: 'You are offline. Reconnect before retrying this change.' };
  }

  const serviceCommand = new Set<SecureCommandType>([
    'service_package.manage', 'client_plan.manage', 'service_cycle.manage',
    'deliverable.manage', 'cycle_comment.manage', 'addon.manage',
    'service_workflow.manage', 'deliverable.workflow.generate',
  ]).has(command.type);
  const invoke = () => command.type === 'deliverable.workflow.generate'
    ? withSyncTimeout(supabase.rpc('aitask_generate_deliverable_task_chain', {
      p_workspace_id: SECURE_WORKSPACE_ID,
      p_command_id: command.id,
      p_operations: command.operations,
    }))
    : withSyncTimeout(supabase.rpc(serviceCommand ? 'aitask_execute_service_command' : 'aitask_execute_command', {
      p_workspace_id: SECURE_WORKSPACE_ID,
      p_command_id: command.id,
      p_command_type: command.type,
      p_operations: command.operations,
    }));

  let rpcResult: Awaited<ReturnType<typeof invoke>>;
  try {
    rpcResult = await invoke();
    if (isAuthError(rpcResult.error) && await refreshSecureSession()) {
      rpcResult = await invoke();
    }
  } catch (error) {
    retryableCommand = command;
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    return {
      ok: false,
      code: offline ? 'OFFLINE' : 'RETRY_REQUIRED',
      error: offline
        ? 'You are offline. Reconnect before retrying this change.'
        : error instanceof SyncRequestTimeoutError
          ? 'Save confirmation timed out. Your change is retained; retrying with the same command will not duplicate it.'
          : 'Supabase could not be reached. Your change is retained for retry.',
    };
  }

  const { data, error } = rpcResult;

  if (error) {
    retryableCommand = command;
    console.error('[AiTask sync] Supabase RPC failed.', JSON.stringify({ ...commandDiagnostic(command), code: error.code }));
    return isAuthError(error)
      ? { ok: false, code: 'FORBIDDEN', error: 'Your session expired. Sign in again, then retry the retained change.' }
      : { ok: false, code: 'RETRY_REQUIRED', error: error.message || 'The command could not be confirmed.' };
  }

  const response = data as CommandResponse;
  if (!response?.ok) {
    console.error('[AiTask sync] Command rejected.', JSON.stringify({ ...commandDiagnostic(command), code: response?.code }));
    const operation = command.operations.find(item => (
      item.entityType === response.conflict?.entityType && item.entityId === response.conflict?.entityId
    ));
    const conflict = response.conflict && operation
      ? { ...response.conflict, attempted: operation.data, changedFields: changedFieldsForConflict(operation, response.conflict.current) }
      : response.conflict;
    retryableCommand = response.code === 'CONFLICT' || response.code === 'RETRY_REQUIRED' ? command : null;
    return {
      ok: false,
      code: response.code || 'RETRY_REQUIRED',
      error: response.error || 'The command was not applied.',
      conflict,
    };
  }

  applyCommandVersions(command, response);
  retryableCommand = null;
  return {
    ok: true,
    data: response,
    commandId: response.commandId || command.id,
    workspaceVersion: Number(response.workspaceVersion) || 1,
    replayed: response.replayed,
  };
};

export const loadSecureWorkspaceRevision = async () => {
  const load = () => withSyncTimeout(supabase
    .from('aitask_workspaces')
    .select('version,updated_at,sync_protocol_version')
    .eq('id', SECURE_WORKSPACE_ID)
    .single());
  let { data, error } = await load();
  if (isAuthError(error) && await refreshSecureSession()) {
    ({ data, error } = await load());
  }
  if (error) throw error;
  const syncProtocolVersion = Number(data.sync_protocol_version);
  if (syncProtocolVersion !== SECURE_SYNC_PROTOCOL_VERSION) {
    throw new Error(
      `AiTask sync protocol mismatch: app requires ${SECURE_SYNC_PROTOCOL_VERSION}, backend provides ${syncProtocolVersion || 'none'}.`,
    );
  }
  return { version: Number(data.version) || 1, updatedAt: String(data.updated_at), syncProtocolVersion };
};

export const saveSecureMemberDepartments = async (
  member: WorkspaceMember,
  requestedDepartments: Department[],
): Promise<MutationResult<MemberDepartmentsResponse>> => {
  const departments = normalizeMemberDepartments(member.role, requestedDepartments);
  if (member.role === 'Client' || departments.length === 0) {
    return { ok: false, code: 'VALIDATION', error: 'Choose at least one valid internal department.' };
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { ok: false, code: 'OFFLINE', error: 'You are offline. Reconnect before saving departments.' };
  }

  const expectedVersion = Math.max(1, Number(member.version) || 1);
  const matchesRetry = retryableMemberDepartments
    && retryableMemberDepartments.memberId === member.id
    && retryableMemberDepartments.expectedVersion === expectedVersion
    && stable(retryableMemberDepartments.departments) === stable(departments);
  const pending = matchesRetry
    ? retryableMemberDepartments
    : { id: commandId(), memberId: member.id, departments, expectedVersion };
  retryableMemberDepartments = pending;

  const invoke = () => withSyncTimeout(supabase.rpc('aitask_update_member_departments', {
    p_workspace_id: SECURE_WORKSPACE_ID,
    p_command_id: pending.id,
    p_member_id: pending.memberId,
    p_departments: pending.departments,
    p_expected_version: pending.expectedVersion,
  }));

  let rpcResult: Awaited<ReturnType<typeof invoke>>;
  try {
    rpcResult = await invoke();
    if (isAuthError(rpcResult.error) && await refreshSecureSession()) rpcResult = await invoke();
  } catch (error) {
    return {
      ok: false,
      code: typeof navigator !== 'undefined' && navigator.onLine === false ? 'OFFLINE' : 'RETRY_REQUIRED',
      error: error instanceof SyncRequestTimeoutError
        ? 'Save confirmation timed out. Submit again to retry the same department change safely.'
        : 'Supabase could not confirm the department change. Submit again to retry.',
    };
  }

  if (rpcResult.error) {
    return {
      ok: false,
      code: isAuthError(rpcResult.error) ? 'FORBIDDEN' : 'RETRY_REQUIRED',
      error: rpcResult.error.message || 'Unable to update departments.',
    };
  }

  const response = rpcResult.data as MemberDepartmentsResponse;
  if (!response?.ok) {
    if (response.code !== 'RETRY_REQUIRED') retryableMemberDepartments = null;
    return {
      ok: false,
      code: response.code || 'RETRY_REQUIRED',
      error: response.error || 'The department change was rejected.',
      conflict: response.conflict,
    };
  }

  retryableMemberDepartments = null;
  const legacyDepartment = getLegacyDepartmentMirror(member.role, departments);
  const key = entityKey('member', member.id);
  const previous = baseline.get(key);
  const nextData = {
    ...(previous?.data || memberData(member)),
    departments,
    department: legacyDepartment,
  };
  baseline.set(key, {
    kind: 'member',
    entityType: 'member',
    entityId: member.id,
    version: Number(response.member?.version) || expectedVersion + 1,
    data: nextData,
    serialized: stable({ parentId: null, data: nextData }),
  });

  return {
    ok: true,
    data: response,
    commandId: response.commandId || pending.id,
    workspaceVersion: Number(response.workspaceVersion) || 1,
    replayed: response.replayed,
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const cleanPortalText = (value: unknown, maxLength: number) => (
  typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
);

const parseNotificationFeedItem = (
  value: unknown,
  memberId: string,
): AppNotification | null => {
  if (!isRecord(value)) return null;
  const parsed = parseNotification({
    ...value,
    isRead: value.isRead === true,
    readByUserIds: value.isRead === true ? [memberId] : [],
    visibleToCurrentUser: true,
  });
  return parsed ? enrichNotificationMetadata(parsed) : null;
};

export const loadSecureNotificationPage = async (
  query: NotificationFeedQuery = {},
): Promise<NotificationFeedPage> => {
  const limit = Math.min(50, Math.max(1, Math.floor(query.limit || 50)));
  const invoke = () => withSyncTimeout(supabase.rpc('aitask_read_notifications', {
    p_workspace_id: SECURE_WORKSPACE_ID,
    p_limit: limit,
    p_before_created_at: query.cursor?.createdAt || null,
    p_before_id: query.cursor?.id || null,
    p_unread_only: Boolean(query.unreadOnly),
    p_category: query.category || null,
    p_search: query.search?.trim().slice(0, 200) || null,
  }));

  let result = await invoke();
  if (isAuthError(result.error) && await refreshSecureSession()) result = await invoke();
  if (result.error) throw result.error;
  if (!isRecord(result.data) || result.data.ok !== true) {
    throw new Error(isRecord(result.data) && typeof result.data.error === 'string'
      ? result.data.error
      : 'Supabase returned an invalid notification feed.');
  }

  const memberId = cleanPortalText(result.data.memberId, 160);
  if (!memberId) throw new Error('The notification feed is not linked to this account.');
  const items = (Array.isArray(result.data.items) ? result.data.items : [])
    .map(item => parseNotificationFeedItem(item, memberId))
    .filter((item): item is AppNotification => Boolean(item));
  const rawCursor = isRecord(result.data.nextCursor) ? result.data.nextCursor : undefined;
  const createdAt = cleanPortalText(rawCursor?.createdAt, 80);
  const cursorId = cleanPortalText(rawCursor?.id, 160);

  return {
    items,
    unreadCount: Math.max(0, Number(result.data.unreadCount) || 0),
    nextCursor: createdAt && cursorId ? { createdAt, id: cursorId } : undefined,
  };
};

const applyNotificationReadBaseline = (
  response: NotificationReadResponse,
  isRead: boolean,
) => {
  const memberId = response.memberId;
  if (!memberId) return;
  (response.changedNotifications || []).forEach(changed => {
    const key = entityKey('notification', changed.id);
    const previous = baseline.get(key);
    if (!previous) return;
    const currentReads = Array.isArray(previous.data.readByUserIds)
      ? previous.data.readByUserIds.filter((value): value is string => typeof value === 'string')
      : [];
    const readByUserIds = isRead
      ? Array.from(new Set([...currentReads, memberId]))
      : currentReads.filter(id => id !== memberId);
    const data = { ...previous.data, readByUserIds };
    baseline.set(key, {
      ...previous,
      version: Math.max(1, Number(changed.version) || previous.version),
      data,
      serialized: stable({ parentId: previous.parentId || null, data }),
    });
  });
};

export const setSecureNotificationsRead = async (
  notificationIds: string[],
  isRead: boolean,
  markAll = false,
): Promise<MutationResult<NotificationReadResponse>> => {
  const ids = Array.from(new Set(notificationIds.map(id => id.trim()).filter(Boolean))).sort();
  if (!markAll && ids.length === 0) {
    return { ok: false, code: 'VALIDATION', error: 'Choose at least one notification.' };
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { ok: false, code: 'OFFLINE', error: 'You are offline. Reconnect before updating notifications.' };
  }
  const matchesRetry = retryableNotificationMutation
    && retryableNotificationMutation.isRead === isRead
    && retryableNotificationMutation.markAll === markAll
    && stable(retryableNotificationMutation.notificationIds) === stable(ids);
  if (retryableNotificationMutation && !matchesRetry) {
    return {
      ok: false,
      code: 'RETRY_REQUIRED',
      error: 'Retry the previous notification update before starting another one.',
    };
  }
  const pending = matchesRetry
    ? retryableNotificationMutation!
    : { id: commandId(), notificationIds: ids, isRead, markAll };
  retryableNotificationMutation = pending;

  const invoke = () => withSyncTimeout(supabase.rpc('aitask_set_notifications_read', {
    p_workspace_id: SECURE_WORKSPACE_ID,
    p_command_id: pending.id,
    p_notification_ids: pending.notificationIds,
    p_is_read: pending.isRead,
    p_mark_all: pending.markAll,
  }));

  let result: Awaited<ReturnType<typeof invoke>>;
  try {
    result = await invoke();
    if (isAuthError(result.error) && await refreshSecureSession()) result = await invoke();
  } catch (error) {
    return {
      ok: false,
      code: typeof navigator !== 'undefined' && navigator.onLine === false ? 'OFFLINE' : 'RETRY_REQUIRED',
      error: error instanceof SyncRequestTimeoutError
        ? 'Notification update confirmation timed out. Try the same action again safely.'
        : 'Supabase could not confirm the notification update.',
    };
  }

  if (result.error) {
    if (isAuthError(result.error)) retryableNotificationMutation = null;
    return {
      ok: false,
      code: isAuthError(result.error) ? 'FORBIDDEN' : 'RETRY_REQUIRED',
      error: result.error.message || 'Unable to update notifications.',
    };
  }

  const response = result.data as NotificationReadResponse;
  if (!response?.ok) {
    if (response?.code !== 'RETRY_REQUIRED') retryableNotificationMutation = null;
    return {
      ok: false,
      code: response?.code || 'RETRY_REQUIRED',
      error: response?.error || 'The notification update was rejected.',
    };
  }

  retryableNotificationMutation = null;
  applyNotificationReadBaseline(response, isRead);
  return {
    ok: true,
    data: response,
    commandId: response.commandId || pending.id,
    workspaceVersion: Number(response.workspaceVersion) || 1,
    replayed: response.replayed,
  };
};

const portalRecords = (value: unknown) => (
  Array.isArray(value) ? value.filter(isRecord) : []
);

const parseClientContact = (value: unknown): ClientContact | null => {
  if (!isRecord(value)) return null;
  const id = cleanPortalText(value.id, 160);
  const name = cleanPortalText(value.name, 160);
  if (!id || !name) return null;
  return { id, name, avatar: safeAvatarSource(value.avatar) };
};

const loadClientPortalPayload = async (expectedClientName?: string): Promise<ClientPortalPayload> => {
  const invoke = () => withSyncTimeout(supabase.rpc('aitask_read_client_portal', {
    p_workspace_id: SECURE_WORKSPACE_ID,
  }));
  let result = await invoke();
  if (isAuthError(result.error) && await refreshSecureSession()) result = await invoke();
  if (result.error) throw result.error;
  if (!isRecord(result.data)) throw new Error('Supabase returned an invalid Client portal response.');

  const workspaceId = cleanPortalText(result.data.workspaceId, 160);
  const clientName = cleanPortalText(result.data.clientName, 240);
  if (workspaceId !== SECURE_WORKSPACE_ID || !clientName) {
    throw new Error('The Client portal response is not linked to this workspace.');
  }
  if (expectedClientName && clientName.toLocaleLowerCase() !== expectedClientName.trim().toLocaleLowerCase()) {
    throw new Error('The Client portal company does not match this account.');
  }

  const companyKey = clientName.trim().toLocaleLowerCase();
  const belongsToClient = (item: { clientName?: string }) => (
    cleanPortalText(item.clientName, 240).trim().toLocaleLowerCase() === companyKey
  );

  const tasks = portalRecords(result.data.tasks)
    .filter(item => cleanPortalText(item.id, 160) && belongsToClient(item))
    .map(item => ({ ...item })) as unknown as ClientPortalPayload['tasks'];
  const projects = portalRecords(result.data.projects)
    .filter(item => cleanPortalText(item.id, 160) && belongsToClient(item))
    .map(item => ({ ...item })) as unknown as ClientPortalPayload['projects'];
  const clients = portalRecords(result.data.clients)
    .filter(item => cleanPortalText(item.id, 160) && belongsToClient(item))
    .map(item => ({ ...item })) as unknown as ClientPortalPayload['clients'];
  const contacts = (Array.isArray(result.data.contacts) ? result.data.contacts : [])
    .map(parseClientContact)
    .filter((contact): contact is ClientContact => Boolean(contact));
  const clientPlans = portalRecords(result.data.clientPlans)
    .filter(item => cleanPortalText(item.id, 160) && belongsToClient(item))
    .map(item => ({ ...item })) as unknown as ClientPortalPayload['clientPlans'];
  const serviceCycles = portalRecords(result.data.serviceCycles)
    .filter(item => cleanPortalText(item.id, 160) && belongsToClient(item))
    .map(item => ({ ...item })) as unknown as ClientPortalPayload['serviceCycles'];
  const deliverables = portalRecords(result.data.deliverables)
    .filter(item => cleanPortalText(item.id, 160) && belongsToClient(item))
    .map(item => ({ ...item })) as unknown as ClientPortalPayload['deliverables'];
  const cycleComments = portalRecords(result.data.cycleComments)
    .filter(item => cleanPortalText(item.id, 160) && belongsToClient(item))
    .map(item => ({ ...item })) as unknown as ClientPortalPayload['cycleComments'];

  return { workspaceId, clientName, tasks, projects, clients, contacts, clientPlans, serviceCycles, deliverables, cycleComments };
};

const projectionToEntityRow = (
  entityType: string,
  item: Record<string, unknown>,
  parentId?: string,
): EntityRow => {
  const { version, updatedAt, ...projection } = item;
  const data = entityType === 'task'
    ? {
        ...projection,
        department: 'Client',
        priority: 'Medium',
        createdBy: 'client-portal',
        isRecurring: false,
        recurrenceFrequency: 'None',
        dueReminderSent: false,
      }
    : projection;
  return {
    workspace_id: SECURE_WORKSPACE_ID,
    entity_type: entityType,
    entity_id: cleanPortalText(item.id, 160),
    parent_id: parentId || null,
    data,
    version: Math.max(1, Number(version) || 1),
    updated_at: cleanPortalText(updatedAt, 80) || new Date(0).toISOString(),
  };
};

export const loadSecureWorkspace = async (authUser: User, options: { preserveRetainedCommand?: boolean } = {}) => {
  const retainedBeforeLoad = options.preserveRetainedCommand ? retryableCommand : null;
  const [{ data: members, error: memberError }, { data: entities, error: entityError }, revision, notificationFeed] = await Promise.all([
    supabase.from('aitask_members').select('*').eq('workspace_id', SECURE_WORKSPACE_ID),
    supabase.from('aitask_entities')
      .select('workspace_id,entity_type,entity_id,parent_id,data,version,updated_at')
      .eq('workspace_id', SECURE_WORKSPACE_ID)
      .neq('entity_type', 'notification'),
    loadSecureWorkspaceRevision(),
    loadSecureNotificationPage({ limit: 50 }),
  ]);
  if (memberError) throw memberError;
  if (entityError) throw entityError;

  const memberRows = members as MemberRow[];
  const entityRows = entities as EntityRow[];
  const authenticatedMemberRow = memberRows.find(member => member.auth_user_id === authUser.id);
  const currentUser = authenticatedMemberRow ? memberToUser(authenticatedMemberRow) : undefined;
  if (!currentUser) throw new Error('This authenticated account is not an AiTask workspace member.');

  const clientPortal = currentUser.role === 'Client'
    ? await loadClientPortalPayload(currentUser.companyName)
    : null;
  const clientContactUsers: WorkspaceMember[] = clientPortal?.contacts.map(contact => ({
    id: contact.id,
    name: contact.name,
    avatar: contact.avatar,
    role: 'Staff',
    departments: [],
    directoryOnly: true,
  })) || [];
  const users = currentUser.role === 'Client'
    ? [currentUser, ...clientContactUsers.filter(contact => contact.id !== currentUser.id)]
    : memberRows.map(memberToUser);
  const clientTaskIds = new Set(clientPortal?.tasks.map(task => task.id) || []);
  const clientCustomRoleId = authenticatedMemberRow?.custom_role_id;
  const visibleEntityRows = currentUser.role === 'Client'
    ? entityRows.filter(row => (
        !['task', 'project', 'client', 'client_plan', 'service_cycle', 'deliverable', 'cycle_comment', 'addon', 'service_package', 'service_workflow_template', 'service_pricing_snapshot', 'registration', 'task_status'].includes(row.entity_type)
        && (row.entity_type !== 'custom_role' || row.entity_id === clientCustomRoleId)
      ))
    : entityRows;
  const projectedEntityRows: EntityRow[] = currentUser.role === 'Client' && clientPortal
    ? [
        ...clientPortal.tasks.map(item => projectionToEntityRow(
          'task',
          item as unknown as Record<string, unknown>,
          item.projectId,
        )),
        ...clientPortal.projects.map(item => projectionToEntityRow('project', item as unknown as Record<string, unknown>)),
        ...clientPortal.clients.map(item => projectionToEntityRow('client', item as unknown as Record<string, unknown>)),
        ...clientPortal.clientPlans.map(item => projectionToEntityRow('client_plan', item as unknown as Record<string, unknown>, item.clientId)),
        ...clientPortal.serviceCycles.map(item => projectionToEntityRow('service_cycle', item as unknown as Record<string, unknown>, item.planId)),
        ...clientPortal.deliverables.map(item => projectionToEntityRow('deliverable', item as unknown as Record<string, unknown>, item.cycleId)),
        ...clientPortal.cycleComments.map(item => projectionToEntityRow('cycle_comment', item as unknown as Record<string, unknown>, item.cycleId)),
      ]
    : [];
  const notificationRows: EntityRow[] = notificationFeed.items.map(notification => ({
    workspace_id: SECURE_WORKSPACE_ID,
    entity_type: 'notification',
    entity_id: notification.id,
    parent_id: null,
    data: stripRuntimeFields(notification as unknown as Record<string, unknown>),
    version: Math.max(1, Number(notification.version) || 1),
    updated_at: notification.updatedAt || notification.createdAt,
  }));
  const effectiveEntityRows = [...visibleEntityRows, ...projectedEntityRows, ...notificationRows];

  const comments = new Map<string, Task['comments']>();
  const approvals = new Map<string, Task['approvalHistory']>();
  visibleEntityRows.forEach(row => {
    if (!row.parent_id) return;
    if (row.entity_type === 'comment') {
      const comment: Record<string, unknown> = { ...row.data, version: Number(row.version) || 1, updatedAt: row.updated_at };
      delete comment.taskId;
      comments.set(row.parent_id, [...(comments.get(row.parent_id) || []), comment as unknown as NonNullable<Task['comments']>[number]]);
    }
    if (row.entity_type === 'approval') {
      const approval: Record<string, unknown> = { ...row.data, version: Number(row.version) || 1, updatedAt: row.updated_at };
      delete approval.taskId;
      approvals.set(row.parent_id, [...(approvals.get(row.parent_id) || []), approval as unknown as NonNullable<Task['approvalHistory']>[number]]);
    }
  });

  const dataFor = <T>(type: string) => effectiveEntityRows
    .filter(row => row.entity_type === type)
    .map(row => ({ ...row.data, version: Number(row.version) || 1, updatedAt: row.updated_at } as T));
  const raw: PersistedWorkspaceState = {
    users,
    clients: dataFor<ClientProfile>('client'),
    projects: dataFor<Project>('project'),
    tasks: dataFor<Task>('task').map(task => ({ ...task, comments: comments.get(task.id), approvalHistory: approvals.get(task.id) })),
    notifications: dataFor<AppNotification>('notification'),
    registrations: dataFor<Registration>('registration'),
    rolePermissions: dataFor<CustomRole>('custom_role'),
    taskStatuses: dataFor<{ status: string }>('task_status').map(item => item.status),
    servicePackages: dataFor<ServicePackage>('service_package'),
    clientPlans: dataFor<ClientServicePlan>('client_plan'),
    serviceCycles: dataFor<ServiceCycle>('service_cycle'),
    deliverables: dataFor<Deliverable>('deliverable'),
    cycleComments: dataFor<CycleComment>('cycle_comment'),
    addons: dataFor<Addon>('addon'),
    serviceWorkflowTemplates: dataFor<ServiceWorkflowTemplate>('service_workflow_template'),
    servicePricingSnapshots: dataFor<ServicePricingSnapshot>('service_pricing_snapshot'),
  };
  const state = parseWorkspaceSnapshot(raw);
  if (currentUser.role === 'Client') {
    state.users = users;
    state.tasks = state.tasks.map(task => clientTaskIds.has(task.id)
      ? { ...task, clientProjection: true }
      : task
    );
  }
  rowsToBaseline(
    currentUser.role === 'Client' && authenticatedMemberRow ? [authenticatedMemberRow] : memberRows,
    effectiveEntityRows,
  );
  alignBaselineToCanonicalState(state);
  if (!options.preserveRetainedCommand) retryableCommand = null;
  else if (retainedBeforeLoad) retryableCommand = retainedBeforeLoad;
  return { state, currentUser, revision, notificationFeed };
};

export const completeSecurePasswordSetup = async (): Promise<MutationResult<CommandResponse>> => {
  const id = commandId();
  const invoke = () => withSyncTimeout(supabase.rpc('aitask_complete_password_setup', {
    p_workspace_id: SECURE_WORKSPACE_ID,
    p_command_id: id,
  }));

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

export const saveSecureWorkspace = async (
  state: PersistedWorkspaceState,
  type?: SecureCommandType,
): Promise<MutationResult<CommandResponse>> => {
  if (type !== undefined && !isSecureCommandType(type)) {
    return {
      ok: false,
      code: 'VALIDATION',
      error: 'The requested workspace command is not supported.',
    };
  }
  const operations = buildOperations(state);
  if (operations.length === 0) {
    const revision = await loadSecureWorkspaceRevision();
    return { ok: true, data: { ok: true, workspaceVersion: revision.version }, commandId: commandId(), workspaceVersion: revision.version };
  }
  const command: SecureCommand = { id: commandId(), type: type || inferSecureCommandType(operations), operations };
  return executeCommand(command);
};

export const retrySecureWorkspaceCommand = async (): Promise<MutationResult<CommandResponse>> => {
  if (!retryableCommand) {
    return { ok: false, code: 'NOT_FOUND', error: 'There is no command waiting to retry.' };
  }
  const command = { ...retryableCommand };
  if (command.operations.some(operation => operation.expectedVersion < 0)) {
    return { ok: false, code: 'CONFLICT', error: 'Review the latest record before retrying.' };
  }
  return executeCommand(command);
};

export const rebaseRetryableCommand = (conflict: MutationConflict) => {
  if (!retryableCommand) return false;
  retryableCommand = {
    ...retryableCommand,
    id: commandId(),
    operations: retryableCommand.operations.map(operation => {
      if (operation.entityType !== conflict.entityType || operation.entityId !== conflict.entityId) return operation;
      let mergedData = operation.data;
      if (conflict.changedFields && operation.data && conflict.current) {
        const userChangedFields = Object.fromEntries(
          conflict.changedFields.map(key => [key, (operation.data as Record<string, unknown>)[key]]),
        );
        mergedData = { ...conflict.current, ...userChangedFields };
      }
      return { ...operation, data: mergedData, expectedVersion: conflict.actualVersion };
    }),
  };
  return true;
};

export const discardSecureWorkspaceCommand = () => {
  retryableCommand = null;
};

export const getRetainedSecureCommand = (): SecureCommand | null => retryableCommand;
