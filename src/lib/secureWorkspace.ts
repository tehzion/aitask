import type { User } from '@supabase/supabase-js';
import type { AppNotification, ClientProfile, CustomRole, Project, Registration, Task, WorkspaceMember } from '../types';
import type { PersistedWorkspaceState } from './supabaseSnapshot';
import { parseWorkspaceSnapshot } from './security';
import { supabase } from './supabaseClient';

export const SECURE_WORKSPACE_ID = 'aitask-main';

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
  updated_at: string;
};

type EntityRow = {
  workspace_id: string;
  entity_type: string;
  entity_id: string;
  parent_id?: string | null;
  data: Record<string, unknown>;
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
  updatedAt: row.updated_at,
});

let baseline = new Map<string, string>();
const entityKey = (type: string, id: string) => `${type}:${id}`;
const stable = (value: unknown) => JSON.stringify(value);

const stateToRows = (state: PersistedWorkspaceState) => {
  const members = state.users.map(user => ({
    id: user.id,
    workspace_id: SECURE_WORKSPACE_ID,
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
    updated_at: user.updatedAt || new Date().toISOString(),
  }));

  const entities: EntityRow[] = [];
  const push = (entity_type: string, entity_id: string, data: Record<string, unknown>, parent_id?: string) => {
    entities.push({ workspace_id: SECURE_WORKSPACE_ID, entity_type, entity_id, parent_id, data });
  };
  state.clients?.forEach(item => push('client', item.id, item as unknown as Record<string, unknown>));
  state.projects.forEach(item => push('project', item.id, item as unknown as Record<string, unknown>));
  state.tasks.forEach(item => {
    const { comments = [], approvalHistory = [], ...task } = item;
    push('task', item.id, task as unknown as Record<string, unknown>, item.projectId);
    comments.forEach(comment => push('comment', comment.id, { ...comment, taskId: item.id }, item.id));
    approvalHistory.forEach(event => push('approval', event.id, { ...event, taskId: item.id }, item.id));
  });
  state.notifications.forEach(item => push('notification', item.id, item as unknown as Record<string, unknown>));
  state.registrations.forEach(item => push('registration', item.id, item as unknown as Record<string, unknown>));
  state.rolePermissions?.forEach(item => push('custom_role', item.id, item as unknown as Record<string, unknown>));
  state.taskStatuses?.forEach(status => push('task_status', status, { status }));
  return { members, entities };
};

export const loadSecureWorkspace = async (authUser: User) => {
  const [{ data: members, error: memberError }, { data: entities, error: entityError }] = await Promise.all([
    supabase.from('aitask_members').select('*').eq('workspace_id', SECURE_WORKSPACE_ID),
    supabase.from('aitask_entities').select('workspace_id,entity_type,entity_id,parent_id,data').eq('workspace_id', SECURE_WORKSPACE_ID),
  ]);
  if (memberError) throw memberError;
  if (entityError) throw entityError;

  const users = (members as MemberRow[]).map(memberToUser);
  const currentUser = users.find(member => member.authUserId === authUser.id);
  if (!currentUser) throw new Error('This authenticated account is not an AiTask workspace member.');

  const rows = entities as EntityRow[];
  const comments = new Map<string, Task['comments']>();
  const approvals = new Map<string, Task['approvalHistory']>();
  rows.forEach(row => {
    if (!row.parent_id) return;
    if (row.entity_type === 'comment') {
      const comment = { ...row.data };
      delete comment.taskId;
      comments.set(row.parent_id, [...(comments.get(row.parent_id) || []), comment as unknown as NonNullable<Task['comments']>[number]]);
    }
    if (row.entity_type === 'approval') {
      const approval = { ...row.data };
      delete approval.taskId;
      approvals.set(row.parent_id, [...(approvals.get(row.parent_id) || []), approval as unknown as NonNullable<Task['approvalHistory']>[number]]);
    }
  });

  const dataFor = <T>(type: string) => rows.filter(row => row.entity_type === type).map(row => row.data as T);
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
  const serialized = stateToRows(state);
  baseline = new Map([
    ...serialized.members.map(item => [entityKey('member', item.id), stable(item)] as const),
    ...serialized.entities.map(item => [entityKey(item.entity_type, item.entity_id), stable(item)] as const),
  ]);
  return { state, currentUser };
};

export const saveSecureWorkspace = async (state: PersistedWorkspaceState) => {
  const rows = stateToRows(state);
  const next = new Map<string, string>();
  const changedMembers = rows.members.filter(item => {
    const value = stable(item);
    next.set(entityKey('member', item.id), value);
    return baseline.get(entityKey('member', item.id)) !== value;
  });
  const changedEntities = rows.entities.filter(item => {
    const value = stable(item);
    next.set(entityKey(item.entity_type, item.entity_id), value);
    return baseline.get(entityKey(item.entity_type, item.entity_id)) !== value;
  });

  if (changedMembers.length) {
    const { error } = await supabase.from('aitask_members').upsert(changedMembers, { onConflict: 'id' });
    if (error) throw error;
  }
  if (changedEntities.length) {
    const { error } = await supabase.from('aitask_entities').upsert(changedEntities, { onConflict: 'workspace_id,entity_type,entity_id' });
    if (error) throw error;
  }

  const removed = [...baseline.keys()].filter(key => !next.has(key) && !key.startsWith('member:'));
  for (const key of removed) {
    const separator = key.indexOf(':');
    const type = key.slice(0, separator);
    const id = key.slice(separator + 1);
    const { error } = await supabase.from('aitask_entities')
      .delete().eq('workspace_id', SECURE_WORKSPACE_ID).eq('entity_type', type).eq('entity_id', id);
    if (error) throw error;
  }
  baseline = next;
};
