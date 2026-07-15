import type { User } from '@supabase/supabase-js';
import type {
  AppNotification,
  ClientProfile,
  CustomRole,
  Project,
  Registration,
  Task,
  WorkspaceMember,
} from '../types';
import type { PersistedWorkspaceState } from './supabaseSnapshot';
import { parseWorkspaceSnapshot } from './security';
import { supabase } from './supabaseClient';

export const SECURE_WORKSPACE_ID = 'aitask-main';

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
  department: WorkspaceMember['department'];
  avatar: string | null;
  client_name: string | null;
  is_super_admin: boolean;
  must_reset_password: boolean;
  custom_role_id: string | null;
  custom_role_name: string | null;
  permissions: WorkspaceMember['permissions'] | null;
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

export type SecureCommand = {
  id: string;
  type: string;
  operations: WorkspaceOperation[];
};

let baseline = new Map<string, BaselineRow>();
let retryableCommand: SecureCommand | null = null;

const entityKey = (type: string, id: string) => `${type}:${id}`;
const stable = (value: unknown) => JSON.stringify(value);
const commandId = () => crypto.randomUUID();

const stripRuntimeFields = <T extends Record<string, unknown>>(value: T) => {
  const copy = { ...value };
  delete copy.version;
  delete copy.updatedAt;
  return copy;
};

const memberToUser = (row: MemberRow): WorkspaceMember => ({
  id: row.id,
  authUserId: row.auth_user_id || undefined,
  workspaceId: row.workspace_id,
  name: row.name,
  email: row.email || undefined,
  role: row.role,
  department: row.department,
  avatar: row.avatar || undefined,
  companyName: row.client_name || undefined,
  isSuperAdmin: row.is_super_admin,
  mustResetPassword: row.must_reset_password,
  customRoleId: row.custom_role_id || undefined,
  customRoleName: row.custom_role_name || undefined,
  permissions: row.permissions && Object.keys(row.permissions).length > 0 ? row.permissions : undefined,
  version: Number(row.version) || 1,
  updatedAt: row.updated_at,
});

const memberData = (user: WorkspaceMember): Record<string, unknown> => ({
  auth_user_id: user.authUserId || null,
  name: user.name,
  email: user.email || null,
  role: user.role,
  department: user.department,
  avatar: user.avatar || null,
  client_name: user.companyName || null,
  is_super_admin: Boolean(user.isSuperAdmin),
  must_reset_password: Boolean(user.mustResetPassword),
  custom_role_id: user.customRoleId || null,
  custom_role_name: user.customRoleName || null,
  permissions: user.permissions || {},
});

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

  state.users.forEach(user => push('member', 'member', user.id, memberData(user), user.version));
  state.clients?.forEach(item => push('entity', 'client', item.id, item as unknown as Record<string, unknown>, item.version));
  state.projects.forEach(item => push('entity', 'project', item.id, item as unknown as Record<string, unknown>, item.version));
  state.tasks.forEach(item => {
    const { comments = [], approvalHistory = [], ...task } = item;
    push('entity', 'task', item.id, task as unknown as Record<string, unknown>, item.version, item.projectId);
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

export const inferSecureCommandType = (operations: WorkspaceOperation[]) => {
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

  const { data, error } = await supabase.rpc('aitask_execute_command', {
    p_workspace_id: SECURE_WORKSPACE_ID,
    p_command_id: command.id,
    p_command_type: command.type,
    p_operations: command.operations,
  });

  if (error) {
    retryableCommand = command;
    return { ok: false, code: 'RETRY_REQUIRED', error: error.message || 'The command could not be confirmed.' };
  }

  const response = data as CommandResponse;
  if (!response?.ok) {
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
  const { data, error } = await supabase
    .from('aitask_workspaces')
    .select('version,updated_at')
    .eq('id', SECURE_WORKSPACE_ID)
    .single();
  if (error) throw error;
  return { version: Number(data.version) || 1, updatedAt: String(data.updated_at) };
};

export const loadSecureWorkspace = async (authUser: User) => {
  const [{ data: members, error: memberError }, { data: entities, error: entityError }, revision] = await Promise.all([
    supabase.from('aitask_members').select('*').eq('workspace_id', SECURE_WORKSPACE_ID),
    supabase.from('aitask_entities').select('workspace_id,entity_type,entity_id,parent_id,data,version,updated_at').eq('workspace_id', SECURE_WORKSPACE_ID),
    loadSecureWorkspaceRevision(),
  ]);
  if (memberError) throw memberError;
  if (entityError) throw entityError;

  const memberRows = members as MemberRow[];
  const entityRows = entities as EntityRow[];
  const users = memberRows.map(memberToUser);
  const currentUser = users.find(member => member.authUserId === authUser.id);
  if (!currentUser) throw new Error('This authenticated account is not an AiTask workspace member.');

  const comments = new Map<string, Task['comments']>();
  const approvals = new Map<string, Task['approvalHistory']>();
  entityRows.forEach(row => {
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

  const dataFor = <T>(type: string) => entityRows
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
  };
  const state = parseWorkspaceSnapshot(raw);
  rowsToBaseline(memberRows, entityRows);
  retryableCommand = null;
  return { state, currentUser, revision };
};

export const saveSecureWorkspace = async (
  state: PersistedWorkspaceState,
  type?: string,
): Promise<MutationResult<CommandResponse>> => {
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
    operations: retryableCommand.operations.map(operation => (
      operation.entityType === conflict.entityType && operation.entityId === conflict.entityId
        ? { ...operation, expectedVersion: conflict.actualVersion }
        : operation
    )),
  };
  return true;
};

export const discardSecureWorkspaceCommand = () => {
  retryableCommand = null;
};
