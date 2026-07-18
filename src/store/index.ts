import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useToastStore } from './useToastStore';
import {
  User,
  ClientProfile,
  Project,
  Task,
  TaskStatus,
  Priority,
  AppNotification,
  TaskComment,
  Registration,
  Role,
  Department,
  ClientApprovalStatus,
  TaskApprovalEvent,
  CustomRole,
} from '../types';
import { legacyDemoTaskIds, mockUsers, mockProjects, mockTasks } from '../mock';
import { canLoginWithSeedAccount, DEFAULT_USER_PASSWORD, shouldShowDemoLogin } from '../lib/auth';
import { getLocalUserPassword, setLocalUserPassword, verifyLocalUserPassword } from '../lib/localCredentials';
import { getBackendStatus, shouldUseSupabase } from '../lib/backend';
import {
  loadSupabaseSnapshot,
  PersistedWorkspaceState,
  saveSupabaseSnapshot,
  SnapshotResult,
} from '../lib/supabaseSnapshot';
import {
  canAssignTasksToOthers,
  canRenameClient,
  canDeleteProject,
  canDeleteTask,
  canEditClientProfile,
  canEditTask,
  canEditProject,
  canApproveRegistrations,
  canCreateTasks,
  canCreateUsers,
  canManageClientProfiles,
  canDeleteUser,
  canManageProjects,
  canCommentOnTask,
  canReviewTaskAsClient,
  getVisibleProjects,
  isNotificationReadByUser,
  isNotificationVisible,
  isBossKoo,
} from '../lib/access';
import { parseWorkspaceSnapshot, safeAvatarSource, safeHttpsUrl } from '../lib/security';
import { getTodayInputDate } from '../lib/utils';
import {
  discardSecureWorkspaceCommand,
  loadSecureWorkspace,
  loadSecureWorkspaceRevision,
  rebaseRetryableCommand,
  retrySecureWorkspaceCommand,
  saveSecureWorkspace,
  type MutationConflict,
} from '../lib/secureWorkspace';
import { resolveAuthEmail, shouldUseSecureSupabase, supabase } from '../lib/supabaseClient';
import {
  clearPasswordSetupMode,
  getPasswordSetupMode,
  passwordSetupRedirectUrl,
} from '../lib/authRecovery';

export type SyncStatus = 'local' | 'loading' | 'live' | 'saving' | 'offline' | 'conflict' | 'retry_required';

interface BackendRuntimeState {
  mode: 'local' | 'supabase';
  status: SyncStatus;
  isConfigured: boolean;
  isLoading: boolean;
  isSaving: boolean;
  isPulling: boolean;
  lastSyncedAt?: string;
  lastSavedAt?: string;
  lastPulledAt?: string;
  remoteVersion?: number;
  workspaceVersion?: number;
  remoteUpdatedAt?: string;
  hasRemoteUpdate: boolean;
  hasLocalChanges: boolean;
  pendingMutations: number;
  conflict?: MutationConflict;
  error?: string;
  message: string;
}

type TaskUpdateInput = Partial<Pick<
  Task,
  | 'projectId'
  | 'clientName'
  | 'customerDetails'
  | 'facebookPage'
  | 'website'
  | 'projectName'
  | 'serviceType'
  | 'title'
  | 'description'
  | 'department'
  | 'assignedTo'
  | 'startDate'
  | 'dueDate'
  | 'priority'
  | 'status'
  | 'completionPercentage'
  | 'attachmentLink'
  | 'attachmentName'
  | 'notes'
  | 'isRecurring'
  | 'recurrenceFrequency'
>>;

type ProjectUpdateInput = Partial<Pick<Project, 'clientName' | 'projectName' | 'services' | 'startDate' | 'deadline'>>;
type ClientProfileInput = Partial<Pick<ClientProfile, 'contactPerson' | 'email' | 'phone' | 'address' | 'website' | 'facebookPage' | 'notes'>>;
type AddMemberInput = Omit<User, 'id' | 'avatar' | 'isSuperAdmin'> & {
  registrationId?: string;
  memberId?: string;
  sendInvitation?: boolean;
};

interface StoreState {
  currentUser: User | null;
  users: User[];
  clients: ClientProfile[];
  projects: Project[];
  tasks: Task[];
  notifications: AppNotification[];
  registrations: Registration[];
  rolePermissions: CustomRole[];
  backend: BackendRuntimeState;
  taskStatuses: string[];
  deletedUserIds: string[];
  deletedRoleIds: string[];
  deletedTaskStatuses: string[];
  deletedClientIds: string[];
  isCreateTaskModalOpen: boolean;
  setCreateTaskModalOpen: (open: boolean) => void;
  createTaskInitialDate?: string;

  initializeBackend: () => Promise<void>;
  syncBackendNow: (commandType?: string) => Promise<void>;
  pullBackendNow: (options?: { force?: boolean; silent?: boolean }) => Promise<void>;
  retryMutation: () => Promise<{ ok: boolean; error?: string }>;
  discardMutation: (options?: { reload?: boolean }) => Promise<void>;
  commitPendingMutation: (commandType?: string) => Promise<{ ok: boolean; error?: string }>;
  login: (name: string, password?: string) => Promise<boolean>;
  requestPasswordRecovery: (identifier: string) => Promise<{ ok: boolean; error?: string }>;
  completePasswordSetup: (data: { newPassword: string; confirmPassword: string }) => Promise<{ ok: boolean; error?: string }>;
  updateCurrentUserProfile: (data: Pick<User, 'name' | 'email' | 'avatar'>) => { ok: boolean; error?: string };
  updateCurrentUserEmail: (email: string, currentPassword: string) => Promise<{ ok: boolean; error?: string }>;
  updateCurrentUserPassword: (data: { currentPassword?: string; newPassword: string; confirmPassword: string }) => Promise<{ ok: boolean; error?: string }>;
  updateTaskStatus: (taskId: string, status: TaskStatus) => void;
  updateTaskPriority: (taskId: string, priority: Priority) => void;
  updateTaskAssignee: (taskId: string, assignedTo: string) => void;
  updateTaskDueDate: (taskId: string, newDueDate: string) => void;
  updateTaskAttachment: (taskId: string, attachmentLink: string, attachmentName?: string) => void;
  updateTask: (taskId: string, data: TaskUpdateInput) => { ok: boolean; error?: string };
  deleteTask: (taskId: string) => { ok: boolean; error?: string };
  reviewClientApproval: (taskId: string, status: ClientApprovalStatus, note?: string) => void;
  requestRevision: (taskId: string, note?: string) => void;
  addTask: (task: Omit<Task, 'id' | 'isCompleted' | 'revisionCount' | 'clientApprovalStatus' | 'dueReminderSent' | 'approvalHistory'>) => string;
  addProject: (project: Omit<Project, 'id' | 'totalTasks' | 'completedTasks'>) => string;
  updateProject: (projectId: string, data: ProjectUpdateInput) => { ok: boolean; error?: string };
  deleteProject: (projectId: string) => { ok: boolean; error?: string };
  upsertClientProfile: (clientName: string, data: ClientProfileInput) => { ok: boolean; id?: string; error?: string };
  renameClient: (oldClientName: string, newClientName: string) => { ok: boolean; error?: string };
  deleteClientProfile: (clientId: string) => { ok: boolean; error?: string };
  addComment: (taskId: string, text: string) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  sendDueDateReminders: () => void;
  registerUser: (data: Omit<Registration, 'id' | 'status' | 'createdAt'>) => Promise<{ ok: boolean; error?: string }>;
  addUserBySuperAdmin: (data: AddMemberInput) => Promise<{ ok: boolean; error?: string }>;
  addCustomRole: (data: Omit<CustomRole, 'id' | 'createdAt' | 'updatedAt' | 'isProtected'>) => { ok: boolean; id?: string; error?: string };
  updateCustomRole: (id: string, data: Partial<Pick<CustomRole, 'name' | 'description' | 'baseRole' | 'permissions'>>) => { ok: boolean; error?: string };
  deleteCustomRole: (id: string) => { ok: boolean; error?: string };
  assignCustomRoleToUser: (userId: string, customRoleId?: string) => { ok: boolean; error?: string };
  approveRegistration: (id: string, role: Role, department: Department, companyName?: string, customRoleId?: string) => void;
  rejectRegistration: (id: string) => void;
  deleteUser: (userId: string) => Promise<{ ok: boolean; error?: string }>;
  _forceSyncMockData: () => void;
  addTaskStatus: (status: string) => { ok: boolean; error?: string };
  deleteTaskStatus: (status: string) => { ok: boolean; error?: string };
}

const nowId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const pendingMutationMessage = 'Resolve the pending Supabase change with Retry or Discard before editing another record.';
const isWorkspaceMutationLocked = (state: StoreState) => (
  shouldUseSecureSupabase()
  && state.backend.pendingMutations > 0
  && ['offline', 'conflict', 'retry_required'].includes(state.backend.status)
);
let isApplyingRemoteSnapshot = false;
const seededUserIds = new Set(mockUsers.map(user => user.id));
const seededProjectIds = new Set(mockProjects.map(project => project.id));
const legacyDemoTaskIdSet = new Set<string>(legacyDemoTaskIds);
const defaultTaskStatuses = ['Pending', 'In Progress', 'Waiting Approval', 'Completed', 'Cancelled'];
const allowedDepartments = new Set<Department>(['Operation', 'Management', 'Videoshooting', 'Ads Management', 'Account & Finance', 'Designer', 'Editor', 'Client']);
const allowedPriorities = new Set<Priority>(['Low', 'Medium', 'High', 'Urgent']);
const sensitiveSnapshotKeyPattern = /(password|secret|token|api[_-]?key|service[_-]?role)/i;
const safePasswordMetadataKeys = new Set(['mustResetPassword', 'must_reset_password']);
const normalizeClientKey = (value?: string | null) => value?.trim().toLowerCase() || '';
const profileEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const getFunctionErrorMessage = async (error: unknown, fallback: string) => {
  if (!error || typeof error !== 'object') return fallback;
  const context = (error as { context?: unknown }).context;
  if (typeof Response !== 'undefined' && context instanceof Response) {
    const payload = await context.clone().json().catch(() => null) as { error?: unknown } | null;
    if (typeof payload?.error === 'string' && payload.error.trim()) return payload.error;
  }
  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' && message.trim() ? message : fallback;
};

const isValidIsoDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

const normalizeOptionalIsoDate = (value?: string) => value?.trim() || '';
const normalizeRequiredStartDate = (value?: string) => normalizeOptionalIsoDate(value) || getTodayInputDate();
const cleanProfileText = (value?: string, maxLength = 5000) => value?.trim().slice(0, maxLength) || undefined;
const cleanAccountEmail = (value?: string) => value?.trim().toLowerCase().slice(0, 320) || undefined;

const resolveTaskStatus = (status: string, statuses: string[]) => {
  const trimmed = status.trim();
  if (!trimmed) return '';
  return statuses.find(item => item.toLowerCase() === trimmed.toLowerCase()) || '';
};

export const stripSensitiveWorkspaceFields = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stripSensitiveWorkspaceFields);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => safePasswordMetadataKeys.has(key) || !sensitiveSnapshotKeyPattern.test(key))
      .map(([key, item]) => [key, stripSensitiveWorkspaceFields(item)])
  );
};

const sanitizeWorkspaceStateForSnapshot = (
  state: Pick<StoreState, 'users' | 'clients' | 'projects' | 'tasks' | 'notifications' | 'registrations' | 'rolePermissions' | 'taskStatuses' | 'deletedUserIds' | 'deletedRoleIds' | 'deletedTaskStatuses' | 'deletedClientIds'>
): PersistedWorkspaceState => stripSensitiveWorkspaceFields({
  users: state.users.map(user => stripPassword(user as User & { password?: string })),
  clients: state.clients || [],
  projects: state.projects,
  tasks: state.tasks,
  notifications: state.notifications || [],
  registrations: (state.registrations || []).map(registration => stripPassword(registration)),
  rolePermissions: state.rolePermissions || [],
  taskStatuses: state.taskStatuses || [],
  deletedUserIds: state.deletedUserIds || [],
  deletedRoleIds: state.deletedRoleIds || [],
  deletedTaskStatuses: state.deletedTaskStatuses || [],
  deletedClientIds: state.deletedClientIds || [],
}) as PersistedWorkspaceState;

const selectPersistedWorkspaceState = sanitizeWorkspaceStateForSnapshot;

const makeBackendRuntimeState = (): BackendRuntimeState => {
  const status = getBackendStatus();
  return {
    mode: status.mode,
    status: status.mode === 'local' ? 'local' : 'loading',
    isConfigured: status.configured,
    isLoading: status.mode === 'supabase' && status.configured,
    isSaving: false,
    isPulling: false,
    hasRemoteUpdate: false,
    hasLocalChanges: false,
    pendingMutations: 0,
    message: status.message,
  };
};

const makeNotification = (data: Omit<AppNotification, 'id' | 'isRead' | 'createdAt'>): AppNotification => ({
  ...data,
  id: nowId('N'),
  isRead: false,
  readByUserIds: [],
  createdAt: new Date().toISOString(),
});

const stripPassword = <T extends { password?: string }>(item: T): Omit<T, 'password'> => {
  const cleanItem = { ...item };
  delete cleanItem.password;
  return cleanItem;
};

const normalizeUserAccount = (user: User): User => {
  const hasCustomPassword = Boolean(getLocalUserPassword(user.id));

  return {
    ...stripPassword(user as User & { password?: string }) as User,
    mustResetPassword: Boolean(user.mustResetPassword) || (!user.authUserId && !hasCustomPassword),
  };
};

export const normalizeWorkspaceUserForBackend = (user: User, secureAuth: boolean): User => (
  secureAuth
    ? stripPassword(user as User & { password?: string }) as User
    : normalizeUserAccount(user)
);

const normalizeWorkspaceState = (state: PersistedWorkspaceState): PersistedWorkspaceState => (
  parseWorkspaceSnapshot(state)
);

const getTime = (value?: string) => value ? new Date(value).getTime() || 0 : 0;

const isLocalItemWorthRecovering = <T extends { id: string; updatedAt?: string }>(
  item: T,
  remoteItems: Map<string, T>,
  seededIds?: Set<string>
) => {
  const remoteItem = remoteItems.get(item.id);
  if (!remoteItem) return !seededIds?.has(item.id);
  return getTime(item.updatedAt) > getTime(remoteItem.updatedAt);
};

const hasRecoverableLocalWorkspaceContent = (
  localRaw: PersistedWorkspaceState,
  remoteRaw: PersistedWorkspaceState
) => {
  const local = normalizeWorkspaceState(localRaw);
  const remote = normalizeWorkspaceState(remoteRaw);
  const remoteTasks = new Map(remote.tasks.map(item => [item.id, item]));
  const remoteClients = new Map((remote.clients || []).map(item => [item.id, item]));
  const remoteProjects = new Map(remote.projects.map(item => [item.id, item]));
  const remoteUsers = new Map(remote.users.map(item => [item.id, item]));
  const remoteRoles = new Map(remote.rolePermissions.map(item => [item.id, item]));
  const remoteRegistrations = new Set(remote.registrations.map(item => item.id));
  const remoteNotifications = new Set(remote.notifications.map(item => item.id));
  const remoteStatuses = new Set(remote.taskStatuses.map(status => status.toLowerCase()));
  const defaultStatuses = new Set(defaultTaskStatuses.map(status => status.toLowerCase()));
  const remoteDeletedClientIds = new Set(remote.deletedClientIds || []);

  return (
    local.tasks.some(task => !legacyDemoTaskIdSet.has(task.id) && isLocalItemWorthRecovering(task, remoteTasks)) ||
    (local.clients || []).some(client => !remoteDeletedClientIds.has(client.id) && isLocalItemWorthRecovering(client, remoteClients)) ||
    local.projects.some(project => isLocalItemWorthRecovering(project, remoteProjects, seededProjectIds)) ||
    local.users.some(user => isLocalItemWorthRecovering(user, remoteUsers, seededUserIds)) ||
    local.rolePermissions.some(role => isLocalItemWorthRecovering(role, remoteRoles)) ||
    local.registrations.some(registration => !remoteRegistrations.has(registration.id)) ||
    local.notifications.some(notification => !remoteNotifications.has(notification.id)) ||
    local.taskStatuses.some(status => !defaultStatuses.has(status.toLowerCase()) && !remoteStatuses.has(status.toLowerCase()))
  );
};

const workspaceStatesEqual = (left: PersistedWorkspaceState, right: PersistedWorkspaceState) => (
  JSON.stringify(normalizeWorkspaceState(left)) === JSON.stringify(normalizeWorkspaceState(right))
);

const mergeWorkspaceStates = (
  localRaw: PersistedWorkspaceState,
  remoteRaw: PersistedWorkspaceState,
  lastSyncedAt: string
): PersistedWorkspaceState => {
  const local = normalizeWorkspaceState(localRaw);
  const remote = normalizeWorkspaceState(remoteRaw);
  const lastSyncedTime = new Date(lastSyncedAt || 0).getTime();

  // 0. Merge Tombstones
  const mergedDeletedUserIds = Array.from(new Set([
    ...(local.deletedUserIds || []),
    ...(remote.deletedUserIds || [])
  ]));
  const mergedDeletedRoleIds = Array.from(new Set([
    ...(local.deletedRoleIds || []),
    ...(remote.deletedRoleIds || [])
  ]));
  const mergedDeletedTaskStatuses = Array.from(new Set([
    ...(local.deletedTaskStatuses || []),
    ...(remote.deletedTaskStatuses || [])
  ]));
  const mergedDeletedClientIds = Array.from(new Set([
    ...(local.deletedClientIds || []),
    ...(remote.deletedClientIds || [])
  ]));

  // 1. Merge Tasks
  const localTasksMap = new Map(local.tasks.map(t => [t.id, t]));
  const remoteTasksMap = new Map(remote.tasks.map(t => [t.id, t]));
  const allTaskIds = new Set([...localTasksMap.keys(), ...remoteTasksMap.keys()]);
  
  const mergedTasks: Task[] = Array.from(allTaskIds).map(id => {
    const localTask = localTasksMap.get(id);
    const remoteTask = remoteTasksMap.get(id);

    if (!localTask) return remoteTask!;
    if (!remoteTask) return localTask;

    const localUpdated = localTask.updatedAt ? new Date(localTask.updatedAt).getTime() : 0;
    const remoteUpdated = remoteTask.updatedAt ? new Date(remoteTask.updatedAt).getTime() : 0;

    const wasLocalModified = localUpdated > lastSyncedTime;
    const wasRemoteModified = remoteUpdated > lastSyncedTime;

    if (wasLocalModified && !wasRemoteModified) {
      return localTask;
    }
    if (wasRemoteModified && !wasLocalModified) {
      return remoteTask;
    }

    // Overlapping changes or neither modified - merge comments/approval history, LWW on fields
    const mergedCommentsMap = new Map<string, TaskComment>();
    [...(localTask.comments || []), ...(remoteTask.comments || [])].forEach(c => {
      mergedCommentsMap.set(c.id, c);
    });
    const mergedComments = Array.from(mergedCommentsMap.values()).sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    const mergedApprovalMap = new Map<string, TaskApprovalEvent>();
    [...(localTask.approvalHistory || []), ...(remoteTask.approvalHistory || [])].forEach(h => {
      mergedApprovalMap.set(h.id, h);
    });
    const mergedApprovalHistory = Array.from(mergedApprovalMap.values()).sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    const baseTask = localUpdated >= remoteUpdated ? localTask : remoteTask;
    
    return {
      ...baseTask,
      comments: mergedComments,
      approvalHistory: mergedApprovalHistory,
      updatedAt: new Date(Math.max(localUpdated, remoteUpdated)).toISOString(),
    };
  });

  // 2. Merge Client Profiles
  const localClientsMap = new Map((local.clients || []).map(client => [client.id, client]));
  const remoteClientsMap = new Map((remote.clients || []).map(client => [client.id, client]));
  const allClientIds = new Set([...localClientsMap.keys(), ...remoteClientsMap.keys()]);
  const mergedClients: ClientProfile[] = Array.from(allClientIds)
    .filter(id => !mergedDeletedClientIds.includes(id))
    .map(id => {
      const localClient = localClientsMap.get(id);
      const remoteClient = remoteClientsMap.get(id);

      if (!localClient) return remoteClient!;
      if (!remoteClient) return localClient;

      const localUpdated = localClient.updatedAt ? new Date(localClient.updatedAt).getTime() : 0;
      const remoteUpdated = remoteClient.updatedAt ? new Date(remoteClient.updatedAt).getTime() : 0;

      const wasLocalModified = localUpdated > lastSyncedTime;
      const wasRemoteModified = remoteUpdated > lastSyncedTime;

      if (wasLocalModified && !wasRemoteModified) return localClient;
      if (wasRemoteModified && !wasLocalModified) return remoteClient;
      return localUpdated >= remoteUpdated ? localClient : remoteClient;
    });

  // 3. Merge Projects
  const localProjMap = new Map(local.projects.map(p => [p.id, p]));
  const remoteProjMap = new Map(remote.projects.map(p => [p.id, p]));
  const allProjIds = new Set([...localProjMap.keys(), ...remoteProjMap.keys()]);

  const mergedProjects: Project[] = Array.from(allProjIds).map(id => {
    const localProj = localProjMap.get(id);
    const remoteProj = remoteProjMap.get(id);

    if (!localProj) return remoteProj!;
    if (!remoteProj) return localProj;

    const localUpdated = localProj.updatedAt ? new Date(localProj.updatedAt).getTime() : 0;
    const remoteUpdated = remoteProj.updatedAt ? new Date(remoteProj.updatedAt).getTime() : 0;

    const wasLocalModified = localUpdated > lastSyncedTime;
    const wasRemoteModified = remoteUpdated > lastSyncedTime;

    if (wasLocalModified && !wasRemoteModified) {
      return localProj;
    }
    if (wasRemoteModified && !wasLocalModified) {
      return remoteProj;
    }

    return localUpdated >= remoteUpdated ? localProj : remoteProj;
  });

  // 4. Merge Users
  const localUsersMap = new Map(local.users.map(u => [u.id, u]));
  const remoteUsersMap = new Map(remote.users.map(u => [u.id, u]));
  const allUserIds = new Set([...localUsersMap.keys(), ...remoteUsersMap.keys()]);
  const mergedUsers: User[] = Array.from(allUserIds)
    .filter(id => !mergedDeletedUserIds.includes(id))
    .map(id => {
      const localUser = localUsersMap.get(id);
      const remoteUser = remoteUsersMap.get(id);

      if (!localUser) return remoteUser!;
      if (!remoteUser) return localUser;

      const localUpdated = localUser.updatedAt ? new Date(localUser.updatedAt).getTime() : 0;
      const remoteUpdated = remoteUser.updatedAt ? new Date(remoteUser.updatedAt).getTime() : 0;

      const wasLocalModified = localUpdated > lastSyncedTime;
      const wasRemoteModified = remoteUpdated > lastSyncedTime;

      if (wasLocalModified && !wasRemoteModified) {
        return localUser;
      }
      if (wasRemoteModified && !wasLocalModified) {
        return remoteUser;
      }

      return localUpdated >= remoteUpdated ? localUser : remoteUser;
    });

  // 5. Merge Registrations
  const localRegsMap = new Map(local.registrations.map(r => [r.id, r]));
  const remoteRegsMap = new Map(remote.registrations.map(r => [r.id, r]));
  const allRegIds = new Set([...localRegsMap.keys(), ...remoteRegsMap.keys()]);
  const mergedRegistrations: Registration[] = Array.from(allRegIds).map(id => {
    const localReg = localRegsMap.get(id);
    const remoteReg = remoteRegsMap.get(id);
    if (!localReg) return remoteReg!;
    if (!remoteReg) return localReg;
    if (remoteReg.status !== 'Pending') return remoteReg;
    return localReg;
  });

  // 6. Merge Notifications
  const localNotifsMap = new Map(local.notifications.map(n => [n.id, n]));
  const remoteNotifsMap = new Map(remote.notifications.map(n => [n.id, n]));
  const allNotifIds = new Set([...localNotifsMap.keys(), ...remoteNotifsMap.keys()]);
  const mergedNotifications: AppNotification[] = Array.from(allNotifIds).map(id => {
    const localNotif = localNotifsMap.get(id);
    const remoteNotif = remoteNotifsMap.get(id);
    if (!localNotif) return remoteNotif!;
    if (!remoteNotif) return localNotif;
    const readByUserIds = Array.from(new Set([
      ...(localNotif.readByUserIds || []),
      ...(remoteNotif.readByUserIds || [])
    ]));
    return {
      ...remoteNotif,
      isRead: localNotif.isRead || remoteNotif.isRead,
      readByUserIds,
    };
  });

  // 7. Merge Task Statuses
  const mergedTaskStatuses = Array.from(new Set([
    ...(local.taskStatuses || []),
    ...(remote.taskStatuses || [])
  ])).filter(status => !mergedDeletedTaskStatuses.includes(status.toLowerCase()));

  // 8. Merge Custom Roles
  const localRolesMap = new Map((local.rolePermissions || []).map(r => [r.id, r]));
  const remoteRolesMap = new Map((remote.rolePermissions || []).map(r => [r.id, r]));
  const allRoleIds = new Set([...localRolesMap.keys(), ...remoteRolesMap.keys()]);
  const mergedRolePermissions = Array.from(allRoleIds)
    .filter(id => !mergedDeletedRoleIds.includes(id))
    .map(id => {
      const localRole = localRolesMap.get(id);
      const remoteRole = remoteRolesMap.get(id);

      if (!localRole) return remoteRole!;
      if (!remoteRole) return localRole;

      const localUpdated = localRole.updatedAt ? new Date(localRole.updatedAt).getTime() : 0;
      const remoteUpdated = remoteRole.updatedAt ? new Date(remoteRole.updatedAt).getTime() : 0;

      const wasLocalModified = localUpdated > lastSyncedTime;
      const wasRemoteModified = remoteUpdated > lastSyncedTime;

      if (wasLocalModified && !wasRemoteModified) {
        return localRole;
      }
      if (wasRemoteModified && !wasLocalModified) {
        return remoteRole;
      }

      return localUpdated >= remoteUpdated ? localRole : remoteRole;
    });

  return {
    users: mergedUsers,
    clients: mergedClients,
    projects: mergedProjects,
    tasks: mergedTasks,
    notifications: mergedNotifications,
    registrations: mergedRegistrations,
    rolePermissions: mergedRolePermissions,
    taskStatuses: mergedTaskStatuses,
    deletedUserIds: mergedDeletedUserIds,
    deletedRoleIds: mergedDeletedRoleIds,
    deletedTaskStatuses: mergedDeletedTaskStatuses,
    deletedClientIds: mergedDeletedClientIds,
  };
};

const getCurrentUserFromSnapshot = (currentUser: User | null, users: User[]) => {
  if (!currentUser) return null;
  const nextUser = users.find(user => user.id === currentUser.id);
  return nextUser ? stripPassword(normalizeUserAccount(nextUser)) as User : null;
};

const makeWorkspacePatch = (current: StoreState, snapshot: SnapshotResult) => {
  const workspace = normalizeWorkspaceState(snapshot.state);
  const secureAuth = shouldUseSecureSupabase();
  const users = workspace.users.map(user => normalizeWorkspaceUserForBackend(user, secureAuth));
  return {
    ...workspace,
    users,
    rolePermissions: workspace.rolePermissions || [],
    taskStatuses: workspace.taskStatuses && workspace.taskStatuses.length > 0
      ? workspace.taskStatuses
      : ['Pending', 'In Progress', 'Waiting Approval', 'Completed', 'Cancelled'],
    currentUser: getCurrentUserFromSnapshot(current.currentUser, users),
  };
};

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      users: mockUsers.map(user => normalizeUserAccount(user)),
      clients: [],
      projects: mockProjects,
      tasks: mockTasks,
      taskStatuses: ['Pending', 'In Progress', 'Waiting Approval', 'Completed', 'Cancelled'],
      deletedUserIds: [],
      deletedRoleIds: [],
      deletedTaskStatuses: [],
      deletedClientIds: [],
      isCreateTaskModalOpen: false,
      setCreateTaskModalOpen: (open) => set((state) => ({
        isCreateTaskModalOpen: open,
        createTaskInitialDate: open ? state.createTaskInitialDate : undefined
      })),
      createTaskInitialDate: undefined,
      notifications: [],
      registrations: [],
      rolePermissions: [],
      backend: makeBackendRuntimeState(),

      initializeBackend: async () => {
        const status = getBackendStatus();
        set({
          backend: {
            mode: status.mode,
            status: status.mode === 'local' ? 'local' : 'loading',
            isConfigured: status.configured,
            isLoading: status.mode === 'supabase' && status.configured,
            isSaving: false,
            isPulling: false,
            hasRemoteUpdate: false,
            hasLocalChanges: false,
            pendingMutations: 0,
            message: status.message,
            error: status.ready ? undefined : status.message,
          }
        });

        if (!shouldUseSupabase()) return;

        try {
          if (shouldUseSecureSupabase()) {
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();
            if (sessionError) throw sessionError;
            if (!session?.user) {
              set((state) => ({
                currentUser: null,
                backend: {
                  ...state.backend,
                  status: 'live',
                  isLoading: false,
                  message: 'Sign in to load your secure workspace.',
                },
              }));
              return;
            }

            const { data: { user: verifiedUser }, error: userError } = await supabase.auth.getUser();
            if (userError) throw userError;
            if (!verifiedUser) throw new Error('Your session has expired. Sign in again.');

            const secure = await loadSecureWorkspace(verifiedUser);
            const loadedAt = new Date().toISOString();
            isApplyingRemoteSnapshot = true;
            set((state) => ({
              ...makeWorkspacePatch(state, {
                state: secure.state,
                source: 'supabase',
                version: 1,
                message: 'Secure workspace loaded.',
                updatedAt: loadedAt,
              }),
              currentUser: secure.currentUser,
              backend: {
                ...state.backend,
                status: 'live',
                isLoading: false,
                lastSyncedAt: loadedAt,
                lastPulledAt: loadedAt,
                workspaceVersion: secure.revision.version,
                remoteVersion: secure.revision.version,
                remoteUpdatedAt: secure.revision.updatedAt,
                hasLocalChanges: false,
                pendingMutations: 0,
                message: 'Secure Supabase session is active.',
              },
            }));
            isApplyingRemoteSnapshot = false;
            return;
          }

          const localBeforeRemote = selectPersistedWorkspaceState(get());
          const result = await loadSupabaseSnapshot(localBeforeRemote);
          const shouldRecoverLocal = hasRecoverableLocalWorkspaceContent(localBeforeRemote, result.state);
          const recoveredState = shouldRecoverLocal
            ? mergeWorkspaceStates(localBeforeRemote, result.state, result.updatedAt || '')
            : result.state;
          const shouldUploadRecoveredState = shouldRecoverLocal && !workspaceStatesEqual(recoveredState, result.state);
          const snapshotToApply: SnapshotResult = shouldRecoverLocal
            ? {
                ...result,
                state: recoveredState,
                message: shouldUploadRecoveredState
                  ? 'Recovered browser-local workspace changes. Syncing them to Supabase.'
                  : result.message,
              }
            : result;
          const syncedAt = new Date().toISOString();
          isApplyingRemoteSnapshot = true;
          set((state) => ({
            ...makeWorkspacePatch(state, snapshotToApply),
            backend: {
              mode: 'supabase',
              status: shouldUploadRecoveredState ? 'saving' : 'live',
              isConfigured: true,
              isLoading: false,
              isSaving: false,
              isPulling: false,
              lastSyncedAt: syncedAt,
              lastPulledAt: syncedAt,
              remoteVersion: result.version,
              remoteUpdatedAt: result.updatedAt,
              hasRemoteUpdate: false,
              hasLocalChanges: shouldUploadRecoveredState,
              pendingMutations: shouldUploadRecoveredState ? 1 : 0,
              message: snapshotToApply.message,
            }
          }));
          isApplyingRemoteSnapshot = false;
          if (shouldUploadRecoveredState) {
            useToastStore.getState().addToast('Recovered local workspace changes and queued them for Supabase sync.', 'info');
          }
        } catch (error) {
          set({
            backend: {
              mode: 'supabase',
              status: typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'retry_required',
              isConfigured: true,
              isLoading: false,
              isSaving: false,
              isPulling: false,
              hasRemoteUpdate: false,
              hasLocalChanges: false,
              pendingMutations: 0,
              message: 'Supabase sync failed. Continuing with local state.',
              error: error instanceof Error ? error.message : 'Unable to load Supabase state.',
            }
          });
        }
      },

      syncBackendNow: async (commandType) => {
        if (!shouldUseSupabase()) return;

        const current = get();
        if (current.backend.isLoading || current.backend.isPulling || current.backend.isSaving || !current.backend.hasLocalChanges) {
          return;
        }
        if (current.backend.hasRemoteUpdate && !shouldUseSecureSupabase()) {
          await get().pullBackendNow();
          return;
        }

        set((state) => ({
          backend: {
            ...state.backend,
            status: 'saving',
            isSaving: true,
            pendingMutations: Math.max(1, state.backend.pendingMutations),
            error: undefined,
          }
        }));

        try {
          const stateToSave = get();
          if (shouldUseSecureSupabase()) {
            const hadRemoteUpdate = stateToSave.backend.hasRemoteUpdate;
            const savedWorkspace = selectPersistedWorkspaceState(stateToSave);
            const result = await saveSecureWorkspace(savedWorkspace, commandType);
            if (result.ok === false) {
              set((state) => ({
                backend: {
                  ...state.backend,
                  status: result.code === 'CONFLICT'
                    ? 'conflict'
                    : result.code === 'OFFLINE'
                      ? 'offline'
                      : 'retry_required',
                  isSaving: false,
                  pendingMutations: 1,
                  conflict: result.conflict,
                  hasRemoteUpdate: result.code === 'CONFLICT' || state.backend.hasRemoteUpdate,
                  hasLocalChanges: true,
                  message: result.error,
                  error: result.error,
                },
              }));
              return;
            }
            const syncedAt = new Date().toISOString();
            const hasChangesAfterSave = !workspaceStatesEqual(savedWorkspace, selectPersistedWorkspaceState(get()));
            set((state) => ({
              backend: {
                ...state.backend,
                status: hasChangesAfterSave ? 'saving' : 'live',
                isSaving: false,
                lastSyncedAt: syncedAt,
                lastSavedAt: syncedAt,
                lastPulledAt: syncedAt,
                workspaceVersion: result.workspaceVersion,
                remoteVersion: result.workspaceVersion,
                hasRemoteUpdate: false,
                hasLocalChanges: hasChangesAfterSave,
                pendingMutations: hasChangesAfterSave ? 1 : 0,
                conflict: undefined,
                error: undefined,
                message: hasChangesAfterSave ? 'Saving newer changes.' : 'Saved.',
              },
            }));
            if (hasChangesAfterSave) queueMicrotask(() => void get().syncBackendNow());
            else if (hadRemoteUpdate) await get().pullBackendNow({ force: true, silent: true });
            return;
          }

          const result = await saveSupabaseSnapshot(
            selectPersistedWorkspaceState(stateToSave),
            stateToSave.backend.remoteVersion || 1
          );

          if (!result.saved) {
            const latest = result.latest;
            if (latest) {
              const merged = mergeWorkspaceStates(
                selectPersistedWorkspaceState(current),
                latest.state,
                current.backend.lastSyncedAt || ''
              );

              isApplyingRemoteSnapshot = true;
              set((state) => ({
                ...makeWorkspacePatch(state, { ...latest, state: merged }),
                backend: {
                  ...state.backend,
                  isSaving: false,
                  remoteVersion: latest.version,
                  remoteUpdatedAt: latest.updatedAt,
                  hasRemoteUpdate: false,
                  hasLocalChanges: true,
                }
              }));
              isApplyingRemoteSnapshot = false;

              useToastStore.getState().addToast('Sync resolved: concurrent edits merged.', 'success');

              setTimeout(() => {
                get().syncBackendNow();
              }, 100);
              return;
            }

            set((state) => ({
              backend: {
                ...state.backend,
                isSaving: false,
                remoteVersion: result.version || state.backend.remoteVersion,
                remoteUpdatedAt: result.updatedAt || state.backend.remoteUpdatedAt,
                hasRemoteUpdate: true,
                message: result.message,
              }
            }));
            return;
          }

          const syncedAt = new Date().toISOString();
          set((state) => ({
            backend: {
              ...state.backend,
              status: 'live',
              isSaving: false,
              lastSyncedAt: syncedAt,
              lastPulledAt: syncedAt,
              remoteVersion: result.version,
              remoteUpdatedAt: result.updatedAt,
              hasRemoteUpdate: false,
              hasLocalChanges: false,
              pendingMutations: 0,
              message: result.message,
            }
          }));
        } catch (error) {
          set((state) => ({
            backend: {
              ...state.backend,
              status: typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'retry_required',
              isSaving: false,
              pendingMutations: state.backend.hasLocalChanges ? 1 : 0,
              message: 'Save was not confirmed. Your pending change is retained for retry.',
              error: error instanceof Error ? error.message : 'Supabase could not confirm the save.',
            }
          }));
        }
      },

      pullBackendNow: async (options = {}) => {
        if (!shouldUseSupabase()) return;
        if (get().backend.isSaving && !options.force) return;

        set((state) => ({
          backend: {
            ...state.backend,
            status: 'loading',
            isPulling: true,
            error: undefined,
            message: options.silent ? state.backend.message : 'Checking for the latest workspace data.',
          }
        }));

        try {
          if (shouldUseSecureSupabase()) {
            const revision = await loadSecureWorkspaceRevision();
            const pulledAt = new Date().toISOString();
            const current = get();
            const currentVersion = current.backend.workspaceVersion || 0;
            const remoteIsNewer = revision.version > currentVersion;

            if (!options.force && (current.backend.hasLocalChanges || current.backend.pendingMutations > 0 || current.backend.status === 'conflict')) {
              set((state) => ({
                backend: {
                  ...state.backend,
                  status: state.backend.status === 'conflict' ? 'conflict' : state.backend.status,
                  isPulling: false,
                  lastPulledAt: pulledAt,
                  remoteVersion: revision.version,
                  remoteUpdatedAt: revision.updatedAt,
                  hasRemoteUpdate: remoteIsNewer || state.backend.hasRemoteUpdate,
                  message: remoteIsNewer
                    ? 'A newer workspace update is available. Resolve the pending change first.'
                    : state.backend.message,
                },
              }));
              return;
            }

            if (!options.force && !remoteIsNewer && currentVersion > 0) {
              set((state) => ({
                backend: {
                  ...state.backend,
                  status: 'live',
                  isPulling: false,
                  lastPulledAt: pulledAt,
                  remoteVersion: revision.version,
                  remoteUpdatedAt: revision.updatedAt,
                  hasRemoteUpdate: false,
                  message: options.silent ? state.backend.message : 'Workspace is current.',
                },
              }));
              return;
            }

            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError) throw userError;
            if (!user) throw new Error('Your session has expired. Sign in again.');
            const secure = await loadSecureWorkspace(user);
            isApplyingRemoteSnapshot = true;
            set((state) => ({
              ...makeWorkspacePatch(state, {
                state: secure.state,
                source: 'supabase',
                version: 1,
                message: 'Secure workspace refreshed.',
                updatedAt: pulledAt,
              }),
              currentUser: secure.currentUser,
              backend: {
                ...state.backend,
                status: 'live',
                isPulling: false,
                lastPulledAt: pulledAt,
                lastSyncedAt: pulledAt,
                workspaceVersion: secure.revision.version,
                remoteVersion: secure.revision.version,
                remoteUpdatedAt: secure.revision.updatedAt,
                hasRemoteUpdate: false,
                hasLocalChanges: false,
                pendingMutations: 0,
                conflict: undefined,
                error: undefined,
                message: 'Secure workspace is current.',
              },
            }));
            isApplyingRemoteSnapshot = false;
            return;
          }

          const result = await loadSupabaseSnapshot(selectPersistedWorkspaceState(get()));
          const pulledAt = new Date().toISOString();
          const current = get();
          const currentVersion = current.backend.remoteVersion || 0;
          const hasUnsavedLocalChanges = current.backend.hasLocalChanges && !options.force;
          const hasPendingRemoteUpdate = current.backend.hasRemoteUpdate && !options.force;
          const remoteIsNewer = result.version > currentVersion || hasPendingRemoteUpdate;

          if (hasUnsavedLocalChanges && remoteIsNewer) {
            const merged = mergeWorkspaceStates(
              selectPersistedWorkspaceState(current),
              result.state,
              current.backend.lastSyncedAt || ''
            );

            isApplyingRemoteSnapshot = true;
            set((state) => ({
              ...makeWorkspacePatch(state, { ...result, state: merged }),
              backend: {
                ...state.backend,
                isPulling: false,
                lastPulledAt: pulledAt,
                remoteVersion: result.version,
                remoteUpdatedAt: result.updatedAt,
                hasRemoteUpdate: false,
                hasLocalChanges: true,
                message: 'Auto-merged concurrent updates.',
              }
            }));
            isApplyingRemoteSnapshot = false;

            useToastStore.getState().addToast('Sync resolved: concurrent edits merged.', 'success');

            setTimeout(() => {
              get().syncBackendNow();
            }, 100);
            return;
          }

          if (hasUnsavedLocalChanges || hasPendingRemoteUpdate) {
            set((state) => ({
              backend: {
                ...state.backend,
                isPulling: false,
                lastPulledAt: pulledAt,
                remoteVersion: remoteIsNewer ? result.version : state.backend.remoteVersion,
                remoteUpdatedAt: remoteIsNewer ? result.updatedAt : state.backend.remoteUpdatedAt,
                hasRemoteUpdate: remoteIsNewer || state.backend.hasRemoteUpdate,
                message: remoteIsNewer
                  ? 'A newer workspace update is available. Refresh before saving.'
                  : state.backend.message,
              }
            }));
            return;
          }

          if (remoteIsNewer || options.force || currentVersion === 0) {
            isApplyingRemoteSnapshot = true;
            set((state) => ({
              ...makeWorkspacePatch(state, result),
              backend: {
                ...state.backend,
                isPulling: false,
                lastPulledAt: pulledAt,
                remoteVersion: result.version,
                remoteUpdatedAt: result.updatedAt,
                hasRemoteUpdate: false,
                hasLocalChanges: false,
                message: options.silent ? 'Dashboard is current.' : result.message,
              }
            }));
            isApplyingRemoteSnapshot = false;
            return;
          }

          set((state) => ({
            backend: {
              ...state.backend,
              status: typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'retry_required',
              isPulling: false,
              lastPulledAt: pulledAt,
              remoteVersion: result.version,
              remoteUpdatedAt: result.updatedAt,
              hasRemoteUpdate: false,
              message: options.silent ? state.backend.message : 'Dashboard is current.',
            }
          }));
        } catch (error) {
          isApplyingRemoteSnapshot = false;
          set((state) => ({
            backend: {
              ...state.backend,
              status: typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'retry_required',
              isPulling: false,
              message: 'Unable to check the latest Supabase state.',
              error: error instanceof Error ? error.message : 'Unable to load Supabase state.',
            }
          }));
        }
      },

      retryMutation: async () => {
        const current = get();
        if (current.backend.isSaving || current.backend.isPulling) {
          return { ok: false, error: 'Another synchronization request is still running.' };
        }
        if (current.backend.conflict) rebaseRetryableCommand(current.backend.conflict);

        set((state) => ({
          backend: {
            ...state.backend,
            status: 'saving',
            isSaving: true,
            pendingMutations: 1,
            error: undefined,
            message: 'Retrying pending change.',
          },
        }));

        const result = await retrySecureWorkspaceCommand();
        if (result.ok === false) {
          set((state) => ({
            backend: {
              ...state.backend,
              status: result.code === 'CONFLICT'
                ? 'conflict'
                : result.code === 'OFFLINE'
                  ? 'offline'
                  : 'retry_required',
              isSaving: false,
              conflict: result.conflict,
              error: result.error,
              message: result.error,
            },
          }));
          return { ok: false, error: result.error };
        }

        const savedAt = new Date().toISOString();
        set((state) => ({
          backend: {
            ...state.backend,
            status: 'live',
            isSaving: false,
            workspaceVersion: result.workspaceVersion,
            remoteVersion: result.workspaceVersion,
            lastSavedAt: savedAt,
            lastSyncedAt: savedAt,
            conflict: undefined,
            error: undefined,
            hasRemoteUpdate: false,
            hasLocalChanges: false,
            pendingMutations: 0,
            message: 'Saved.',
          },
        }));
        await get().pullBackendNow({ force: true, silent: true });
        return { ok: true };
      },

      discardMutation: async (options = {}) => {
        discardSecureWorkspaceCommand();
        set((state) => ({
          backend: {
            ...state.backend,
            status: options.reload === false
              ? (typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'live')
              : 'loading',
            conflict: undefined,
            error: undefined,
            hasRemoteUpdate: false,
            hasLocalChanges: false,
            pendingMutations: 0,
            message: options.reload === false ? 'Pending change discarded.' : 'Loading the latest saved workspace.',
          },
        }));
        if (options.reload !== false) await get().pullBackendNow({ force: true, silent: false });
      },

      commitPendingMutation: async (commandType) => {
        if (!shouldUseSupabase()) return { ok: true };
        const before = get().backend;
        if (
          before.hasLocalChanges &&
          (before.status === 'conflict' || before.status === 'retry_required' || before.status === 'offline')
        ) {
          return {
            ok: false,
            error: pendingMutationMessage,
          };
        }
        await get().syncBackendNow(commandType);
        const backend = get().backend;
        if (!backend.hasLocalChanges && backend.status === 'live') return { ok: true };
        return {
          ok: false,
          error: backend.error || backend.message || 'The change has not been saved yet.',
        };
      },

      login: async (name, password) => {
        if (shouldUseSecureSupabase()) {
          const { data, error } = await supabase.auth.signInWithPassword({
            email: resolveAuthEmail(name),
            password: password || '',
          });
          if (error || !data.user) return false;

          try {
            const secure = await loadSecureWorkspace(data.user);
            isApplyingRemoteSnapshot = true;
            set((state) => ({
              ...makeWorkspacePatch(state, {
                state: secure.state,
                source: 'supabase',
                version: 1,
                message: 'Secure workspace loaded.',
              }),
              currentUser: secure.currentUser,
              backend: {
                ...state.backend,
                status: 'live',
                isLoading: false,
                workspaceVersion: secure.revision.version,
                remoteVersion: secure.revision.version,
                remoteUpdatedAt: secure.revision.updatedAt,
                lastPulledAt: new Date().toISOString(),
                pendingMutations: 0,
                message: 'Secure Supabase session is active.',
              },
            }));
            isApplyingRemoteSnapshot = false;
            return true;
          } catch {
            await supabase.auth.signOut({ scope: 'local' });
            return false;
          }
        }

        // Match by name (case-insensitive) — never expose user IDs to the login UI
        const user = get().users.find(u => u.name.toLowerCase() === name.trim().toLowerCase());
        if (!user) return false;
        if (!canLoginWithSeedAccount(user.id)) return false;

        const normalizedUser = normalizeUserAccount(user);
        let isValid = false;
        try {
          isValid = await verifyLocalUserPassword(normalizedUser.id, password || '', {
            allowDefaultPassword: shouldShowDemoLogin() && !getBackendStatus().isHostedRuntime,
          });
        } catch {
          return false;
        }
        if (!isValid) {
          return false;
        }

        const nextUser = {
          ...normalizedUser,
          mustResetPassword: Boolean(normalizedUser.mustResetPassword),
        };

        // Strip sensitive fields before placing in currentUser session state
        set((state) => ({
          currentUser: stripPassword(nextUser) as User,
          users: state.users.map(account => (
            account.id === user.id ? nextUser : account
          )),
        }));
        return true;
      },

      requestPasswordRecovery: async (identifier) => {
        if (!shouldUseSecureSupabase()) {
          return { ok: false, error: 'Password recovery is available for secure hosted accounts only.' };
        }
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          return { ok: false, error: 'You are offline. Reconnect before requesting a password email.' };
        }

        const normalizedIdentifier = identifier.trim().toLowerCase();
        const matchingMember = normalizedIdentifier.includes('@')
          ? undefined
          : get().users.find(user => user.name.trim().toLowerCase() === normalizedIdentifier);
        const email = resolveAuthEmail(matchingMember?.email || identifier);
        if (!profileEmailPattern.test(email)) return { ok: true };

        try {
          const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: passwordSetupRedirectUrl(),
          });
          if (error && /fetch|network|offline/i.test(error.message)) {
            return { ok: false, error: 'The recovery service could not be reached. Please try again.' };
          }
          return { ok: true };
        } catch {
          return { ok: false, error: 'The recovery service could not be reached. Please try again.' };
        }
      },

      completePasswordSetup: async (data) => {
        if (!shouldUseSecureSupabase()) {
          return { ok: false, error: 'This password link is only valid for secure hosted accounts.' };
        }
        if (!getPasswordSetupMode()) {
          return { ok: false, error: 'This password link is invalid or has already been used.' };
        }

        const newPassword = data.newPassword.trim();
        if (newPassword.length < 12) {
          return { ok: false, error: 'Use a password with at least 12 characters.' };
        }
        if (newPassword !== data.confirmPassword.trim()) {
          return { ok: false, error: 'Passwords do not match.' };
        }
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          return { ok: false, error: 'You are offline. Reconnect before setting your password.' };
        }

        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData.user) {
          return { ok: false, error: 'This password link has expired. Request a new email from Login.' };
        }

        const { error: passwordError } = await supabase.auth.updateUser({ password: newPassword });
        if (passwordError) return { ok: false, error: passwordError.message };

        const currentUser = get().currentUser;
        if (currentUser?.mustResetPassword) {
          const previousCurrentUser = currentUser;
          const previousUsers = get().users;
          const now = new Date().toISOString();
          set((state) => ({
            currentUser: state.currentUser
              ? { ...state.currentUser, mustResetPassword: false, updatedAt: now }
              : null,
            users: state.users.map(member => member.id === currentUser.id
              ? { ...member, mustResetPassword: false, updatedAt: now }
              : member),
          }));
          const persisted = await get().commitPendingMutation('member.update');
          if (!persisted.ok) {
            set({ currentUser: previousCurrentUser, users: previousUsers });
            return {
              ok: false,
              error: persisted.error || 'The password changed, but account setup could not be finalized. Retry this page.',
            };
          }
        }

        clearPasswordSetupMode();
        return { ok: true };
      },

      updateCurrentUserProfile: (data) => {
        const currentUser = get().currentUser;
        if (!currentUser) return { ok: false, error: 'You must be logged in to update your profile.' };
        if (isWorkspaceMutationLocked(get())) return { ok: false, error: pendingMutationMessage };

        const name = data.name.trim();
        const email = cleanAccountEmail(data.email);
        const avatar = data.avatar?.trim() ? safeAvatarSource(data.avatar) : undefined;

        if (!name) return { ok: false, error: 'Name is required.' };
        if (email && !profileEmailPattern.test(email)) {
          return { ok: false, error: 'Enter a valid email address.' };
        }

        const duplicate = get().users.some(user => (
          user.id !== currentUser.id &&
          (
            user.name.toLowerCase() === name.toLowerCase() ||
            (email && user.email?.trim().toLowerCase() === email)
          )
        ));
        if (duplicate) return { ok: false, error: 'Another user already uses that name or email.' };

        if (data.avatar?.trim() && !avatar) {
          return { ok: false, error: 'Avatar must be an uploaded photo, app image, generated avatar, or Supabase image URL.' };
        }
        if (shouldUseSecureSupabase() && email !== cleanAccountEmail(currentUser.email)) {
          return { ok: false, error: 'Confirm the login email change with your current password first.' };
        }

        const now = new Date().toISOString();
        const nextCurrentUser: User = {
          ...currentUser,
          name,
          email,
          avatar,
          updatedAt: now,
        };

        set((state) => ({
          currentUser: nextCurrentUser,
          users: state.users.map(user => (
            user.id === currentUser.id
              ? { ...user, name, email, avatar, updatedAt: now }
              : user
          )),
        }));

        return { ok: true };
      },

      updateCurrentUserEmail: async (nextEmail, currentPassword) => {
        const currentUser = get().currentUser;
        if (!currentUser) return { ok: false, error: 'You must be logged in to update your email.' };
        if (isWorkspaceMutationLocked(get())) return { ok: false, error: pendingMutationMessage };

        const email = cleanAccountEmail(nextEmail);
        if (!email || !profileEmailPattern.test(email)) return { ok: false, error: 'Enter a valid email address.' };
        if (!currentPassword) return { ok: false, error: 'Enter your current password to change the login email.' };
        if (email === cleanAccountEmail(currentUser.email)) return { ok: true };
        if (get().users.some(user => user.id !== currentUser.id && cleanAccountEmail(user.email) === email)) {
          return { ok: false, error: 'Another user already uses that email.' };
        }

        if (!shouldUseSecureSupabase()) {
          const result = get().updateCurrentUserProfile({
            name: currentUser.name,
            email,
            avatar: currentUser.avatar,
          });
          return result;
        }

        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session?.access_token) {
          return { ok: false, error: 'Your secure session has expired. Sign out, then sign in again.' };
        }

        const { error } = await supabase.functions.invoke('invite-aitask-member', {
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: { action: 'update_self_email', email, currentPassword },
        });
        if (error) return { ok: false, error: await getFunctionErrorMessage(error, 'Unable to update the login email.') };

        await supabase.auth.refreshSession();
        await get().pullBackendNow({ force: true, silent: true });
        return { ok: true };
      },

      updateCurrentUserPassword: async (data) => {
        const currentUser = get().currentUser;
        if (!currentUser) return { ok: false, error: 'You must be logged in to update your password.' };
        if (isWorkspaceMutationLocked(get())) return { ok: false, error: pendingMutationMessage };

        if (shouldUseSecureSupabase()) {
          const currentPassword = data.currentPassword || '';
          const newPassword = data.newPassword.trim();
          if (newPassword.length < 12) return { ok: false, error: 'New password must be at least 12 characters.' };
          if (newPassword !== data.confirmPassword.trim()) {
            return { ok: false, error: 'New password and confirmation do not match.' };
          }
          const { data: { user }, error: userError } = await supabase.auth.getUser();
          if (userError || !user?.email) return { ok: false, error: 'Your secure session has expired.' };
          const { error: reauthError } = await supabase.auth.signInWithPassword({
            email: user.email,
            password: currentPassword,
          });
          if (reauthError) return { ok: false, error: 'Current password is incorrect.' };
          const { error: passwordError } = await supabase.auth.updateUser({ password: newPassword });
          if (passwordError) return { ok: false, error: passwordError.message };
          const previousCurrentUser = get().currentUser;
          const previousUsers = get().users;
          const now = new Date().toISOString();
          set((state) => ({
            currentUser: state.currentUser ? { ...state.currentUser, mustResetPassword: false, updatedAt: now } : null,
            users: state.users.map(member => member.id === currentUser.id
              ? { ...member, mustResetPassword: false, updatedAt: now }
              : member),
          }));
          const persisted = await get().commitPendingMutation('member.update');
          if (!persisted.ok) {
            set({ currentUser: previousCurrentUser, users: previousUsers });
            return { ok: false, error: persisted.error || 'The password changed, but the account setup flag could not be saved. Please retry.' };
          }
          return { ok: true };
        }

        const account = get().users.find(user => user.id === currentUser.id);
        if (!account) return { ok: false, error: 'User account was not found.' };

        const currentPassword = data.currentPassword || '';
        const newPassword = data.newPassword.trim();
        const confirmPassword = data.confirmPassword.trim();
        const normalizedAccount = normalizeUserAccount(account);

        let isCurrentValid = false;
        try {
          isCurrentValid = await verifyLocalUserPassword(normalizedAccount.id, currentPassword, {
            allowDefaultPassword: shouldShowDemoLogin() && !getBackendStatus().isHostedRuntime,
          });
        } catch {
          return { ok: false, error: 'This browser could not verify the current password.' };
        }
        if (!isCurrentValid) {
          return { ok: false, error: 'Current password is incorrect.' };
        }
        if (newPassword.length < 12) {
          return { ok: false, error: 'New password must be at least 12 characters.' };
        }
        if (newPassword !== confirmPassword) {
          return { ok: false, error: 'New password and confirmation do not match.' };
        }
        const isNewSameAsCurrent = await verifyLocalUserPassword(normalizedAccount.id, newPassword, {
          allowDefaultPassword: shouldShowDemoLogin() && !getBackendStatus().isHostedRuntime,
        });
        if (isNewSameAsCurrent) {
          return { ok: false, error: 'New password must be different from the current password.' };
        }

        const now = new Date().toISOString();
        try {
          await setLocalUserPassword(currentUser.id, newPassword);
        } catch {
          return { ok: false, error: 'This browser could not save the new password.' };
        }
        set((state) => ({
          currentUser: {
            ...currentUser,
            mustResetPassword: false,
            updatedAt: now,
          },
          users: state.users.map(user => (
            user.id === currentUser.id
              ? { ...stripPassword(user as User & { password?: string }) as User, mustResetPassword: false, updatedAt: now }
              : user
          )),
        }));

        return { ok: true };
      },

      markNotificationRead: (id) => set((state) => {
        if (isWorkspaceMutationLocked(state)) return state;
        const currentUser = state.currentUser;
        return {
          notifications: (state.notifications || []).map(n => {
            if (n.id !== id) return n;
            if (!currentUser) return { ...n, isRead: true };

            const readByUserIds = Array.from(new Set([...(n.readByUserIds || []), currentUser.id]));
            const isDirectUserNotice = n.targetUserId === currentUser.id && !n.targetRole && !n.targetClient;

            return {
              ...n,
              readByUserIds,
              isRead: isDirectUserNotice ? true : n.isRead,
            };
          })
        };
      }),

      markAllNotificationsRead: () => set((state) => {
        if (isWorkspaceMutationLocked(state)) return state;
        const currentUser = state.currentUser;
        if (!currentUser) return state;

        return {
          notifications: (state.notifications || []).map(n => {
            const isMine = isNotificationVisible(currentUser, n);
            if (!isMine || isNotificationReadByUser(currentUser, n)) return n;

            const readByUserIds = Array.from(new Set([...(n.readByUserIds || []), currentUser.id]));
            const isDirectUserNotice = n.targetUserId === currentUser.id && !n.targetRole && !n.targetClient;

            return {
              ...n,
              readByUserIds,
              isRead: isDirectUserNotice ? true : n.isRead,
            };
          })
        };
      }),

      updateTaskStatus: (taskId, status) => set((state) => {
        if (isWorkspaceMutationLocked(state)) return state;
        const task = state.tasks.find(t => t.id === taskId);
        const currentUser = state.currentUser;
        if (!task || !canEditTask(currentUser, task, state.rolePermissions)) return state;

        const nextStatus = resolveTaskStatus(status, state.taskStatuses);
        if (!nextStatus) {
          useToastStore.getState().addToast('Choose a valid task status.', 'warning');
          return state;
        }

        const isCompleted = nextStatus === 'Completed';
        const isWaitingApproval = nextStatus === 'Waiting Approval';
        const isReadyForClientReview = isCompleted || isWaitingApproval;
        const wasCompleted = task.isCompleted || task.status === 'Completed';

        const newTasks = state.tasks.map(t => {
          if (t.id !== taskId) return t;

          const completionPercentage = isReadyForClientReview
            ? 100
            : wasCompleted || t.completionPercentage === 100
              ? 90
              : t.completionPercentage;

          const clientApprovalStatus = isReadyForClientReview
            ? 'Pending'
            : t.clientApprovalStatus === 'Approved' || wasCompleted
              ? 'Pending'
              : t.clientApprovalStatus;

          return {
            ...t,
            status: nextStatus,
            isCompleted,
            completionPercentage,
            clientApprovalStatus,
            updatedAt: new Date().toISOString(),
          };
        });

        const newNotifs: AppNotification[] = [];

        if (currentUser?.role !== 'Admin') {
          newNotifs.push(makeNotification({
            targetRole: 'Admin',
            title: 'Task Status Updated',
            message: `"${task.title}" was moved to ${nextStatus} by ${currentUser?.name}.`,
            route: { page: 'tasks', entityId: taskId },
            iconType: 'status'
          }));
        }

        if (isReadyForClientReview) {
          newNotifs.push(makeNotification({
            targetClient: task.clientName,
            title: isCompleted ? 'Task Completed' : 'Task Ready for Approval',
            message: `"${task.title}" is ready for client review.`,
            route: { page: 'tasks', entityId: taskId },
            iconType: 'success'
          }));
        }

        useToastStore.getState().addToast(`Status updated to "${nextStatus}"`, 'success');

        return {
          tasks: newTasks,
          notifications: [...newNotifs, ...(state.notifications || [])]
        };
      }),

      updateTaskPriority: (taskId, priority) => set((state) => {
        if (isWorkspaceMutationLocked(state)) return state;
        const task = state.tasks.find(t => t.id === taskId);
        const currentUser = state.currentUser;
        if (!task || !canEditTask(currentUser, task, state.rolePermissions)) return state;
        if (!allowedPriorities.has(priority)) {
          useToastStore.getState().addToast('Choose a valid priority.', 'warning');
          return state;
        }

        const newTasks = state.tasks.map(t => {
          if (t.id !== taskId) return t;
          return { ...t, priority, updatedAt: new Date().toISOString() };
        });

        useToastStore.getState().addToast(`Priority updated to "${priority}"`, 'success');

        return { tasks: newTasks };
      }),

      updateTaskAssignee: (taskId, assignedTo) => set((state) => {
        if (isWorkspaceMutationLocked(state)) return state;
        const task = state.tasks.find(t => t.id === taskId);
        const currentUser = state.currentUser;
        if (!task || !canEditTask(currentUser, task, state.rolePermissions)) return state;
        if (assignedTo === task.assignedTo) return state;
        if (!canAssignTasksToOthers(currentUser, state.rolePermissions)) return state;

        const assigneeUser = state.users.find(u => u.id === assignedTo && u.role !== 'Client');
        if (!assigneeUser) return state;

        const newTasks = state.tasks.map(t => {
          if (t.id !== taskId) return t;
          return { ...t, assignedTo, updatedAt: new Date().toISOString() };
        });

        const newNotifs: AppNotification[] = [];
        if (assignedTo !== task.assignedTo) {
          newNotifs.push(makeNotification({
            targetUserId: assignedTo,
            title: 'Task Assigned To You',
            message: `"${task.title}" has been assigned to you by ${currentUser?.name}.`,
            route: { page: 'tasks', entityId: taskId },
            iconType: 'task'
          }));
        }

        useToastStore.getState().addToast(`Task assigned to ${assigneeUser.name}`, 'success');

        return {
          tasks: newTasks,
          notifications: [...newNotifs, ...(state.notifications || [])]
        };
      }),

      updateTaskAttachment: (taskId, attachmentLink, attachmentName) => set((state) => {
        if (isWorkspaceMutationLocked(state)) return state;
        const task = state.tasks.find(t => t.id === taskId);
        if (!task || !canEditTask(state.currentUser, task, state.rolePermissions)) return state;

        // Validate that the attachment link is a safe http(s) URL
        const trimmedLink = attachmentLink.trim();
        const validatedLink = trimmedLink ? safeHttpsUrl(trimmedLink) : null;
        if (trimmedLink && !validatedLink) return state;

        useToastStore.getState().addToast('Attachment updated successfully', 'success');

        return {
          tasks: state.tasks.map(task =>
            task.id === taskId
              ? {
                  ...task,
                  attachmentLink: validatedLink || undefined,
                  attachmentName: attachmentName?.trim().slice(0, 200) || undefined,
                  updatedAt: new Date().toISOString()
                }
              : task
          )
        };
      }),

      updateTaskDueDate: (taskId, newDueDate) => set((state) => {
        if (isWorkspaceMutationLocked(state)) return state;
        const task = state.tasks.find(t => t.id === taskId);
        if (!task || !canEditTask(state.currentUser, task, state.rolePermissions)) return state;
        const nextDueDate = normalizeOptionalIsoDate(newDueDate);

        if (nextDueDate && !isValidIsoDate(nextDueDate)) {
          useToastStore.getState().addToast('Choose a valid due date.', 'warning');
          return state;
        }

        if (nextDueDate && isValidIsoDate(task.startDate) && new Date(nextDueDate) < new Date(task.startDate)) {
          useToastStore.getState().addToast('Due date cannot be earlier than the start date.', 'warning');
          return state;
        }

        useToastStore.getState().addToast(nextDueDate ? `Due date updated to ${nextDueDate}` : 'Due date cleared', 'success');

        return {
          tasks: state.tasks.map(t =>
            t.id === taskId ? { ...t, dueDate: nextDueDate, updatedAt: new Date().toISOString() } : t
          ),
        };
      }),

      updateTask: (taskId, data) => {
        const state = get();
        if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };
        const currentUser = state.currentUser;
        const task = state.tasks.find(t => t.id === taskId);
        if (!currentUser || !task || !canEditTask(currentUser, task, state.rolePermissions)) {
          return { ok: false, error: 'You do not have permission to edit this task.' };
        }

        const canAssignOthers = canAssignTasksToOthers(currentUser, state.rolePermissions);
        const nextAssigneeId = data.assignedTo ?? task.assignedTo;
        if (!canAssignOthers && nextAssigneeId !== task.assignedTo) {
          return { ok: false, error: 'You do not have permission to reassign this task.' };
        }

        const assignee = state.users.find(user => user.id === nextAssigneeId && user.role !== 'Client');
        if (!assignee) return { ok: false, error: 'Choose a valid internal assignee.' };

        const hasProjectInput = Object.prototype.hasOwnProperty.call(data, 'projectId');
        const requestedProjectId = hasProjectInput ? data.projectId?.trim() || undefined : task.projectId;
        const project = requestedProjectId
          ? state.projects.find(item => item.id === requestedProjectId)
          : undefined;

        if (requestedProjectId && !project) {
          return { ok: false, error: 'Selected company or project was not found.' };
        }

        if (requestedProjectId) {
          const visibleProjectIds = new Set(
            getVisibleProjects(currentUser, state.projects, state.tasks, state.rolePermissions).map(item => item.id)
          );
          if (!visibleProjectIds.has(requestedProjectId)) {
            return { ok: false, error: 'You can only link tasks to projects you can access.' };
          }
        }

        const title = data.title !== undefined ? data.title.trim() : task.title;
        const clientName = project
          ? project.clientName
          : data.clientName !== undefined
            ? data.clientName.trim()
            : task.clientName;
        const serviceType = data.serviceType !== undefined ? data.serviceType.trim() : task.serviceType;
        const startDate = data.startDate !== undefined ? normalizeRequiredStartDate(data.startDate) : normalizeRequiredStartDate(task.startDate);
        const dueDate = data.dueDate !== undefined ? normalizeOptionalIsoDate(data.dueDate) : task.dueDate;
        const status = data.status !== undefined
          ? resolveTaskStatus(data.status, state.taskStatuses)
          : task.status;

        if (!title) return { ok: false, error: 'Task title is required.' };
        if (!clientName) return { ok: false, error: 'Client or brand name is required.' };
        if (!serviceType) return { ok: false, error: 'Service type is required.' };
        if (!isValidIsoDate(startDate) || (dueDate && !isValidIsoDate(dueDate))) {
          return { ok: false, error: 'Start date must be valid. Due date must be valid when provided.' };
        }
        if (startDate && dueDate && new Date(dueDate) < new Date(startDate)) {
          return { ok: false, error: 'Due date cannot be earlier than the start date.' };
        }
        if (data.status !== undefined && !status) return { ok: false, error: 'Choose a valid task status.' };
        if (data.priority !== undefined && !allowedPriorities.has(data.priority)) {
          return { ok: false, error: 'Choose a valid priority.' };
        }

        const safeFacebookPage = data.facebookPage !== undefined
          ? (data.facebookPage.trim() ? safeHttpsUrl(data.facebookPage) : undefined)
          : task.facebookPage;
        const safeWebsite = data.website !== undefined
          ? (data.website.trim() ? safeHttpsUrl(data.website) : undefined)
          : task.website;
        const safeAttachmentLink = data.attachmentLink !== undefined
          ? (data.attachmentLink.trim() ? safeHttpsUrl(data.attachmentLink) : undefined)
          : task.attachmentLink;

        if ((data.facebookPage?.trim() && !safeFacebookPage) || (data.website?.trim() && !safeWebsite) || (data.attachmentLink?.trim() && !safeAttachmentLink)) {
          return { ok: false, error: 'Links must be valid HTTPS URLs.' };
        }

        const updatedTask: Task = {
          ...task,
          ...data,
          projectId: requestedProjectId,
          projectName: project
            ? project.projectName
            : data.projectName !== undefined
              ? data.projectName.trim() || undefined
              : task.projectName,
          clientName,
          serviceType,
          title,
          description: data.description !== undefined ? data.description.trim() : task.description,
          customerDetails: data.customerDetails !== undefined ? data.customerDetails.trim() : task.customerDetails,
          facebookPage: safeFacebookPage || undefined,
          website: safeWebsite || undefined,
          assignedTo: nextAssigneeId,
          startDate,
          dueDate,
          status,
          completionPercentage: data.completionPercentage !== undefined
            ? Math.max(0, Math.min(100, Number(data.completionPercentage) || 0))
            : task.completionPercentage,
          attachmentLink: safeAttachmentLink || undefined,
          attachmentName: data.attachmentName !== undefined ? data.attachmentName.trim() || undefined : task.attachmentName,
          notes: data.notes !== undefined ? data.notes.trim() || undefined : task.notes,
          updatedAt: new Date().toISOString(),
        };

        const notifications: AppNotification[] = [];
        if (updatedTask.assignedTo !== task.assignedTo) {
          notifications.push(makeNotification({
            targetUserId: updatedTask.assignedTo,
            title: 'Task Assigned To You',
            message: `"${updatedTask.title}" has been assigned to you by ${currentUser.name}.`,
            route: { page: 'tasks', entityId: taskId },
            iconType: 'task'
          }));
        }

        set(current => ({
          tasks: current.tasks.map(item => item.id === taskId ? updatedTask : item),
          notifications: [...notifications, ...(current.notifications || [])],
        }));

        useToastStore.getState().addToast(`Task "${updatedTask.title}" updated successfully`, 'success');
        return { ok: true };
      },

      deleteTask: (taskId) => {
        const state = get();
        if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };
        const currentUser = state.currentUser;
        const task = state.tasks.find(item => item.id === taskId);
        if (!currentUser || !task || !canDeleteTask(currentUser, task, state.rolePermissions)) {
          return { ok: false, error: 'You do not have permission to delete this task.' };
        }

        const notifications = currentUser.role !== 'Admin'
          ? [makeNotification({
              targetRole: 'Admin' as Role,
              title: 'Task Deleted',
              message: `${currentUser.name} deleted "${task.title}".`,
              route: { page: 'tasks' },
              iconType: 'alert' as const
            })]
          : [];

        set(current => ({
          tasks: current.tasks.filter(item => item.id !== taskId),
          notifications: [...notifications, ...(current.notifications || [])],
        }));
        useToastStore.getState().addToast(`Task "${task.title}" deleted`, 'success');
        return { ok: true };
      },

      reviewClientApproval: (taskId, status, note) => set((state) => {
        if (isWorkspaceMutationLocked(state)) return state;
        const currentUser = state.currentUser;
        const task = state.tasks.find(t => t.id === taskId);
        if (!currentUser || !task || !canReviewTaskAsClient(currentUser, task, state.rolePermissions)) return state;

        const event: TaskApprovalEvent = {
          id: nowId('A'),
          userId: currentUser.id,
          status,
          note: note?.trim() || undefined,
          createdAt: new Date().toISOString(),
        };

        const newTasks = state.tasks.map(t => {
          if (t.id !== taskId) return t;

          return {
            ...t,
            clientApprovalStatus: status,
            status: status === 'Approved' ? 'Completed' as TaskStatus : 'In Progress' as TaskStatus,
            isCompleted: status === 'Approved',
            completionPercentage: status === 'Approved' ? 100 : Math.min(t.completionPercentage, 90),
            revisionCount: status === 'Rejected' ? t.revisionCount + 1 : t.revisionCount,
            approvalHistory: [...(t.approvalHistory || []), event],
            updatedAt: new Date().toISOString(),
          };
        });

        const notifications: AppNotification[] = [];
        if (!shouldUseSecureSupabase()) {
          notifications.push(makeNotification({
            targetRole: 'Admin',
            title: status === 'Approved' ? 'Client Approved Task' : 'Client Requested Revision',
            message: `${currentUser.name} ${status === 'Approved' ? 'approved' : 'rejected'} "${task.title}"${note ? `: ${note}` : '.'}`,
            route: { page: 'tasks', entityId: taskId },
            iconType: status === 'Approved' ? 'success' : 'alert'
          }));

          if (status === 'Rejected') {
            notifications.push(makeNotification({
              targetUserId: task.assignedTo,
              title: 'Client Requested Revision',
              message: `${currentUser.name} requested changes on "${task.title}"${note ? `: ${note}` : '.'}`,
              route: { page: 'tasks', entityId: taskId },
              iconType: 'alert'
            }));
          } else {
            notifications.push(makeNotification({
              targetUserId: task.assignedTo,
              title: 'Client Approved Task',
              message: `${currentUser.name} approved "${task.title}".`,
              route: { page: 'tasks', entityId: taskId },
              iconType: 'success'
            }));
          }
        }

        useToastStore.getState().addToast(
          status === 'Approved' ? 'Task approved successfully' : 'Revision request submitted',
          status === 'Approved' ? 'success' : 'warning'
        );

        return {
          tasks: newTasks,
          notifications: [...notifications, ...(state.notifications || [])]
        };
      }),

      requestRevision: (taskId, note) => set((state) => {
        if (isWorkspaceMutationLocked(state)) return state;
        const currentUser = state.currentUser;
        const task = state.tasks.find(t => t.id === taskId);
        if (!currentUser || !task || !canEditTask(currentUser, task, state.rolePermissions)) return state;

        const revisionComment: TaskComment | null = note?.trim()
          ? {
              id: nowId('C'),
              userId: currentUser.id,
              text: `Revision requested: ${note.trim()}`,
              createdAt: new Date().toISOString(),
            }
          : null;

        const newTasks = state.tasks.map(t => {
          if (t.id !== taskId) return t;

          return {
            ...t,
            revisionCount: t.revisionCount + 1,
            clientApprovalStatus: 'Rejected' as ClientApprovalStatus,
            status: 'In Progress' as TaskStatus,
            isCompleted: false,
            completionPercentage: Math.min(t.completionPercentage, 90),
            comments: revisionComment ? [...(t.comments || []), revisionComment] : t.comments,
            updatedAt: new Date().toISOString(),
          };
        });

        useToastStore.getState().addToast('Revision requested successfully', 'warning');

        return {
          tasks: newTasks,
          notifications: [
            makeNotification({
              targetUserId: task.assignedTo,
              title: 'Revision Requested',
              message: `${currentUser.name} requested a revision on "${task.title}".`,
              route: { page: 'tasks', entityId: taskId },
              iconType: 'alert'
            }),
            ...(state.notifications || [])
          ]
        };
      }),

      addTask: (taskData) => {
        const state = get();
        if (isWorkspaceMutationLocked(state)) {
          useToastStore.getState().addToast(pendingMutationMessage, 'warning');
          return '';
        }
        const currentUser = state.currentUser;
        if (!currentUser || !canCreateTasks(currentUser, state.rolePermissions)) return '';
        if (!state.users.some(user => user.id === taskData.assignedTo && user.role !== 'Client')) return '';

        const project = taskData.projectId
          ? state.projects.find(item => item.id === taskData.projectId)
          : undefined;
        if (taskData.projectId) {
          if (!project) return '';
          const visibleProjectIds = new Set(
            getVisibleProjects(currentUser, state.projects, state.tasks, state.rolePermissions).map(project => project.id)
          );
          if (!visibleProjectIds.has(taskData.projectId)) return '';
        }

        const title = taskData.title.trim();
        const clientName = project ? project.clientName : taskData.clientName.trim();
        const serviceType = taskData.serviceType.trim();
        const startDate = normalizeRequiredStartDate(taskData.startDate);
        const dueDate = normalizeOptionalIsoDate(taskData.dueDate);
        const status = resolveTaskStatus(taskData.status, state.taskStatuses);

        if (!title || !clientName || !serviceType) return '';
        if (!allowedDepartments.has(taskData.department) || taskData.department === 'Client') return '';
        if (!allowedPriorities.has(taskData.priority)) return '';
        if (!status) return '';
        if (!isValidIsoDate(startDate) || (dueDate && !isValidIsoDate(dueDate))) return '';
        if (startDate && dueDate && new Date(dueDate) < new Date(startDate)) return '';

        const taskId = `T-${Date.now().toString().slice(-6)}`;
        set((state) => {
          if (!canCreateTasks(state.currentUser, state.rolePermissions)) return state;

          const newTask: Task = {
            ...taskData,
            id: taskId,
            title,
            clientName,
            projectName: project ? project.projectName : taskData.projectName,
            serviceType,
            startDate,
            dueDate,
            status,
            isCompleted: false,
            revisionCount: 0,
            clientApprovalStatus: 'Pending',
            dueReminderSent: false,
            approvalHistory: [],
            updatedAt: new Date().toISOString(),
          };

          return {
            tasks: [...state.tasks, newTask],
            notifications: [
              makeNotification({
                targetUserId: taskData.assignedTo,
                title: 'New Task Assigned',
                message: `You have been assigned a new task: "${taskData.title}".`,
                route: { page: 'tasks', entityId: taskId },
                iconType: 'task'
              }),
              ...(state.notifications || [])
            ]
          };
        });

        useToastStore.getState().addToast(`Task "${taskData.title}" created successfully`, 'success');
        return taskId;
      },

      addProject: (projectData) => {
        const state = get();
        if (isWorkspaceMutationLocked(state)) {
          useToastStore.getState().addToast(pendingMutationMessage, 'warning');
          return '';
        }
        const currentUser = state.currentUser;
        if (!currentUser || !canManageProjects(currentUser, state.rolePermissions)) return '';

        const clientName = projectData.clientName.trim();
        const projectName = projectData.projectName.trim() || clientName;
        const services = Array.from(new Map(
          projectData.services.map(service => [service.trim().toLowerCase(), service.trim()])
        ).values()).filter(Boolean);
        const startDate = projectData.startDate || getTodayInputDate();
        const deadline = projectData.deadline?.trim() || '';

        if (!clientName || !projectName || services.length === 0) return '';
        if (!isValidIsoDate(startDate)) return '';
        if (deadline && (!isValidIsoDate(deadline) || new Date(deadline) < new Date(startDate))) return '';

        const newProject: Project = {
          ...projectData,
          clientName,
          projectName,
          services,
          startDate,
          deadline,
          createdBy: currentUser.id,
          totalTasks: 0,
          completedTasks: 0,
          id: `P-${Date.now().toString().slice(-6)}`,
          updatedAt: new Date().toISOString(),
        };
        set((state) => ({ projects: [...state.projects, newProject] }));
        useToastStore.getState().addToast(`Company "${clientName}" created successfully`, 'success');
        return newProject.id;
      },

      updateProject: (projectId, data) => {
        const state = get();
        if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };
        const currentUser = state.currentUser;
        const project = state.projects.find(item => item.id === projectId);
        if (!currentUser || !project || !canEditProject(currentUser, project, state.rolePermissions)) {
          return { ok: false, error: 'You do not have permission to edit this company.' };
        }

        const clientName = data.clientName !== undefined ? data.clientName.trim() : project.clientName;
        const projectName = data.projectName !== undefined ? data.projectName.trim() : clientName;
        const services = data.services !== undefined
          ? Array.from(new Map(data.services.map(service => [service.trim().toLowerCase(), service.trim()])).values()).filter(Boolean)
          : project.services;
        const startDate = data.startDate || project.startDate || getTodayInputDate();
        const deadline = data.deadline !== undefined ? data.deadline.trim() : project.deadline;

        if (!clientName) return { ok: false, error: 'Company or brand name is required.' };
        if (!projectName) return { ok: false, error: 'Project name is required.' };
        if (services.length === 0) return { ok: false, error: 'Select or add at least one service.' };
        if (!isValidIsoDate(startDate)) return { ok: false, error: 'Start date must be a valid date.' };
        if (deadline && (!isValidIsoDate(deadline) || new Date(deadline) < new Date(startDate))) {
          return { ok: false, error: 'Deadline cannot be earlier than the start date.' };
        }

        const updatedProject: Project = {
          ...project,
          clientName,
          projectName,
          services,
          startDate,
          deadline,
          updatedAt: new Date().toISOString(),
        };

        set(current => ({
          projects: current.projects.map(item => item.id === projectId ? updatedProject : item),
          tasks: current.tasks.map(task => task.projectId === projectId
            ? { ...task, clientName, projectName, updatedAt: new Date().toISOString() }
            : task
          ),
        }));
        useToastStore.getState().addToast(`Company "${clientName}" updated successfully`, 'success');
        return { ok: true };
      },

      deleteProject: (projectId) => {
        const state = get();
        if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };
        const currentUser = state.currentUser;
        const project = state.projects.find(item => item.id === projectId);
        if (!currentUser || !project || !canDeleteProject(currentUser, project, state.rolePermissions)) {
          return { ok: false, error: 'You do not have permission to delete this company.' };
        }

        set(current => ({
          projects: current.projects.filter(item => item.id !== projectId),
          tasks: current.tasks.map(task => task.projectId === projectId
            ? { ...task, projectId: undefined, projectName: undefined, updatedAt: new Date().toISOString() }
            : task
          ),
        }));
        useToastStore.getState().addToast(`Company "${project.clientName}" deleted. Existing tasks were kept.`, 'success');
        return { ok: true };
      },

      upsertClientProfile: (clientName, data) => {
        const state = get();
        if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };
        const currentUser = state.currentUser;
        if (!canEditClientProfile(currentUser, clientName, state.tasks, state.rolePermissions)) {
          return { ok: false, error: 'You need Manage assigned clients permission and a direct task assignment to edit this client.' };
        }

        const name = clientName.trim();
        if (!name) return { ok: false, error: 'Client or brand name is required.' };
        if (name.length > 240) return { ok: false, error: 'Client or brand name must be 240 characters or less.' };

        const website = data.website?.trim() ? safeHttpsUrl(data.website) : undefined;
        const facebookPage = data.facebookPage?.trim() ? safeHttpsUrl(data.facebookPage) : undefined;
        if (data.website?.trim() && !website) return { ok: false, error: 'Website must be a valid HTTPS URL.' };
        if (data.facebookPage?.trim() && !facebookPage) return { ok: false, error: 'Facebook page must be a valid HTTPS URL.' };

        const existing = state.clients.find(client => normalizeClientKey(client.clientName) === normalizeClientKey(name));
        const now = new Date().toISOString();
        const profile: ClientProfile = {
          id: existing?.id || nowId('CL'),
          clientName: existing?.clientName || name,
          contactPerson: cleanProfileText(data.contactPerson, 160),
          email: cleanProfileText(data.email, 320),
          phone: cleanProfileText(data.phone, 80),
          address: cleanProfileText(data.address, 1000),
          website,
          facebookPage,
          notes: cleanProfileText(data.notes, 5000),
          createdAt: existing?.createdAt || now,
          updatedAt: now,
        };

        set((current) => ({
          clients: existing
            ? current.clients.map(client => client.id === existing.id ? profile : client)
            : [...current.clients, profile],
        }));

        useToastStore.getState().addToast(`Client details saved for "${profile.clientName}".`, 'success');
        return { ok: true, id: profile.id };
      },

      renameClient: (oldClientName, newClientName) => {
        const state = get();
        if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };
        const currentUser = state.currentUser;
        const oldName = oldClientName.trim();
        const nextName = newClientName.trim();
        const oldKey = normalizeClientKey(oldName);
        const nextKey = normalizeClientKey(nextName);

        if (!oldName) return { ok: false, error: 'Choose a client to rename.' };
        if (!nextName) return { ok: false, error: 'New client name is required.' };
        if (nextName.length > 240) return { ok: false, error: 'Client name must be 240 characters or less.' };
        if (oldKey === nextKey) return { ok: false, error: 'New client name must be different.' };
        if (!canRenameClient(currentUser)) {
          return { ok: false, error: 'Only admins can rename clients.' };
        }

        const duplicateExists = [
          ...state.clients.map(client => client.clientName),
          ...state.tasks.map(task => task.clientName),
          ...state.projects.map(project => project.clientName),
          ...state.users.filter(user => user.role === 'Client').map(user => user.companyName || ''),
        ].some(name => normalizeClientKey(name) === nextKey);
        if (duplicateExists) {
          return { ok: false, error: 'Another client already uses that name.' };
        }

        const hasOldClient = [
          ...state.clients.map(client => client.clientName),
          ...state.tasks.map(task => task.clientName),
          ...state.projects.map(project => project.clientName),
          ...state.users.filter(user => user.role === 'Client').map(user => user.companyName || ''),
        ].some(name => normalizeClientKey(name) === oldKey);
        if (!hasOldClient) return { ok: false, error: 'Client was not found.' };

        const now = new Date().toISOString();
        const renamedProjectIds = new Set(
          state.projects
            .filter(project => normalizeClientKey(project.clientName) === oldKey)
            .map(project => project.id)
        );

        set((current) => ({
          clients: current.clients.map(client => (
            normalizeClientKey(client.clientName) === oldKey
              ? { ...client, clientName: nextName, updatedAt: now }
              : client
          )),
          tasks: current.tasks.map(task => {
            const matchesClient = normalizeClientKey(task.clientName) === oldKey;
            const matchesRenamedProject = Boolean(task.projectId && renamedProjectIds.has(task.projectId));
            if (!matchesClient && !matchesRenamedProject) return task;

            return {
              ...task,
              clientName: nextName,
              projectName: matchesRenamedProject || normalizeClientKey(task.projectName) === oldKey
                ? nextName
                : task.projectName,
              updatedAt: now,
            };
          }),
          projects: current.projects.map(project => (
            normalizeClientKey(project.clientName) === oldKey
              ? { ...project, clientName: nextName, projectName: nextName, updatedAt: now }
              : project
          )),
          users: current.users.map(user => (
            user.role === 'Client' && normalizeClientKey(user.companyName) === oldKey
              ? { ...user, companyName: nextName, updatedAt: now }
              : user
          )),
          currentUser: current.currentUser?.role === 'Client' && normalizeClientKey(current.currentUser.companyName) === oldKey
            ? { ...current.currentUser, companyName: nextName, updatedAt: now }
            : current.currentUser,
          notifications: current.notifications.map(notification => (
            normalizeClientKey(notification.targetClient) === oldKey
              ? { ...notification, targetClient: nextName }
              : notification
          )),
        }));

        useToastStore.getState().addToast(`Client renamed to "${nextName}".`, 'success');
        return { ok: true };
      },

      deleteClientProfile: (clientId) => {
        const state = get();
        if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };
        const currentUser = state.currentUser;
        if (!canManageClientProfiles(currentUser)) {
          return { ok: false, error: 'Only admins can delete client profiles.' };
        }

        const client = state.clients.find(c => c.id === clientId);
        if (!client) return { ok: false, error: 'Client profile not found.' };

        set(current => ({
          clients: current.clients.filter(c => c.id !== clientId),
          deletedClientIds: Array.from(new Set([...(current.deletedClientIds || []), clientId])),
        }));

        useToastStore.getState().addToast(`Client profile for "${client.clientName}" deleted.`, 'success');
        return { ok: true };
      },

      addComment: (taskId, text) => set((state) => {
        if (isWorkspaceMutationLocked(state)) return state;
        const currentUser = state.currentUser;
        const task = state.tasks.find(t => t.id === taskId);
        if (!currentUser || !task || !canCommentOnTask(currentUser, task, state.rolePermissions)) return state;

        // Enforce a reasonable length cap to prevent storage abuse
        const safeText = text.trim().slice(0, 2000);
        if (!safeText) return state;

        const newComment: TaskComment = {
          id: nowId('C'),
          userId: currentUser.id,
          text: safeText,
          createdAt: new Date().toISOString(),
        };

        const newTasks = state.tasks.map(t => {
          if (t.id === taskId) {
            return { ...t, comments: [...(t.comments || []), newComment], updatedAt: new Date().toISOString() };
          }
          return t;
        });

        const newNotifs: AppNotification[] = [];
        const serverGeneratesClientNotifications = shouldUseSecureSupabase() && currentUser.role === 'Client';
        if (!serverGeneratesClientNotifications && currentUser.role !== 'Admin') {
          newNotifs.push(makeNotification({
            targetRole: 'Admin',
            title: currentUser.role === 'Client' ? 'Client Feedback' : 'New Comment',
            message: `${currentUser.name} commented on "${task.title}".`,
            route: { page: 'tasks', entityId: taskId },
            iconType: 'status'
          }));
        }

        if (!serverGeneratesClientNotifications && task.assignedTo !== currentUser.id) {
          newNotifs.push(makeNotification({
            targetUserId: task.assignedTo,
            title: currentUser.role === 'Client' ? 'Client Feedback' : 'New Comment',
            message: `${currentUser.name} commented on your task "${task.title}".`,
            route: { page: 'tasks', entityId: taskId },
            iconType: 'status'
          }));
        }

        return {
          tasks: newTasks,
          notifications: [...newNotifs, ...(state.notifications || [])]
        };
      }),

      sendDueDateReminders: () => set((state) => {
        if (isWorkspaceMutationLocked(state)) return state;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const newNotifs: AppNotification[] = [];
        const tasks = state.tasks.map(task => {
          if (task.isCompleted || task.dueReminderSent) return task;
          if (!task.dueDate || !isValidIsoDate(task.dueDate)) return task;
          const dueDate = new Date(`${task.dueDate}T00:00:00`);
          const isApproaching = dueDate.getTime() === today.getTime() || dueDate.getTime() === tomorrow.getTime();
          if (!isApproaching) return task;

          const when = dueDate.getTime() === today.getTime() ? 'today' : 'tomorrow';
          newNotifs.push(makeNotification({
            targetUserId: task.assignedTo,
            title: 'Task Deadline Approaching',
            message: `"${task.title}" is due ${when}.`,
            route: { page: 'tasks', entityId: task.id },
            iconType: 'alert'
          }));
          newNotifs.push(makeNotification({
            targetRole: 'Admin',
            title: 'Task Deadline Approaching',
            message: `"${task.title}" for ${task.clientName} is due ${when}.`,
            route: { page: 'tasks', entityId: task.id },
            iconType: 'alert'
          }));

          return { ...task, dueReminderSent: true };
        });

        if (newNotifs.length === 0) return state;

        return {
          tasks,
          notifications: [...newNotifs, ...(state.notifications || [])]
        };
      }),

      registerUser: async (data) => {
        const name = data.name.trim();
        const email = data.email.trim().toLowerCase();
        const phone = data.phone.trim();
        const jobPosition = data.jobPosition.trim();

        if (!name || !email || !phone || !jobPosition || !profileEmailPattern.test(email)) {
          return { ok: false, error: 'Complete all fields with a valid email address.' };
        }

        if (shouldUseSecureSupabase()) {
          const password = data.password?.trim() || '';
          if (password.length < 12) {
            return { ok: false, error: 'Use a password with at least 12 characters.' };
          }
          const { data: signUpData, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                aitask_registration_source: 'staff_signup',
                name,
                phone,
                job_position: jobPosition,
              },
            },
          });
          if (error) return { ok: false, error: error.message };
          if (signUpData.session) await supabase.auth.signOut({ scope: 'local' });
          return { ok: true };
        }

        set((state) => {
          const newReg: Registration = {
            name,
            email,
            phone,
            jobPosition,
            requestedRole: 'Staff',
            onboardingMode: 'self_signup',
            id: nowId('R'),
            status: 'Pending',
            createdAt: new Date().toISOString()
          };

          const bossKoo = state.users.find(u => u.name === 'Boss Koo');
          const newNotifs = [...(state.notifications || [])];

          if (bossKoo) {
            newNotifs.unshift(makeNotification({
              targetUserId: bossKoo.id,
              title: 'New Registration',
              message: `${name} has registered and is waiting for your approval.`,
              route: { page: 'approvals' },
              iconType: 'status'
            }));
          }

          return {
            registrations: [...(state.registrations || []), newReg],
            notifications: newNotifs
          };
        });
        return { ok: true };
      },

      addUserBySuperAdmin: async (data) => {
        const state = get();
        if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };
        const currentUser = state.currentUser;
        if (!canCreateUsers(currentUser, state.rolePermissions)) {
          return { ok: false, error: 'Only Boss Koo can add members directly.' };
        }

        const name = data.name.trim();
        const email = data.email?.trim();
        const initialPassword = data.password?.trim() || DEFAULT_USER_PASSWORD;
        const sendInvitation = data.sendInvitation !== false;
        const companyName = data.role === 'Client' ? data.companyName?.trim() : undefined;

        if (!name) return { ok: false, error: 'Member name is required.' };
        if (initialPassword !== DEFAULT_USER_PASSWORD && initialPassword.length < 12) {
          return { ok: false, error: 'Custom initial passwords must be at least 12 characters.' };
        }
        if (data.role === 'Client' && !companyName) {
          return { ok: false, error: 'Client company is required for Client users.' };
        }

        const duplicate = !data.memberId && !data.registrationId && get().users.some(user => (
          user.name.toLowerCase() === name.toLowerCase() ||
          (email && user.email?.toLowerCase() === email.toLowerCase())
        ));

        if (duplicate) {
          return { ok: false, error: 'A member with that name or email already exists.' };
        }

        const pendingRegistration = !data.registrationId && email
          ? get().registrations.find(registration => (
              registration.status === 'Pending' && registration.email.trim().toLowerCase() === email.toLowerCase()
            ))
          : undefined;
        if (pendingRegistration) {
          return {
            ok: false,
            error: 'This email already has a pending Staff signup. Approve it from Pending Registrations instead.',
          };
        }

        if (shouldUseSecureSupabase()) {
          if (!email || !profileEmailPattern.test(email)) {
            return { ok: false, error: 'A valid email is required for a secure invitation.' };
          }
          const registration = data.registrationId
            ? get().registrations.find(item => item.id === data.registrationId)
            : undefined;
          const needsTemporaryPassword = !sendInvitation && (
            !data.registrationId || registration?.onboardingMode === 'legacy_invite'
          );
          if (needsTemporaryPassword && initialPassword.length < 12) {
            return { ok: false, error: 'Temporary passwords must be at least 12 characters.' };
          }

          const { data: authData, error: authError } = await supabase.auth.getUser();
          if (authError || !authData.user) {
            return { ok: false, error: 'Your secure session has expired. Sign out, then sign in again.' };
          }
          if (!currentUser.authUserId || currentUser.authUserId !== authData.user.id) {
            await get().initializeBackend();
            return {
              ok: false,
              error: 'Your signed-in account changed. AiTask refreshed the session; please try again.',
            };
          }

          const { data: { session }, error: sessionError } = await supabase.auth.getSession();
          if (sessionError || !session?.access_token) {
            return { ok: false, error: 'Your secure session has expired. Sign out, then sign in again.' };
          }
          const { error } = await supabase.functions.invoke('invite-aitask-member', {
            headers: { Authorization: `Bearer ${session.access_token}` },
            body: {
              name,
              email,
              role: data.role,
              department: data.department,
              companyName,
              customRoleId: data.customRoleId,
              registrationId: data.registrationId,
              memberId: data.memberId,
              sendInvitation,
              password: needsTemporaryPassword ? initialPassword : undefined,
            },
          });
          if (error) return { ok: false, error: await getFunctionErrorMessage(error, 'Unable to send the invitation.') };
          await get().pullBackendNow({ force: true });
          return { ok: true };
        }

        const customRole = data.customRoleId
          ? get().rolePermissions.find(role => role.id === data.customRoleId)
          : undefined;

        const userId = nowId('U');
        try {
          await setLocalUserPassword(userId, initialPassword);
        } catch {
          return { ok: false, error: 'This browser could not save the member credential.' };
        }

        const newUser: User = {
          id: userId,
          name,
          email,
          role: data.role,
          department: data.role === 'Client' ? 'Client' : data.department,
          mustResetPassword: true,
          companyName,
          isSuperAdmin: false,
          customRoleId: customRole?.id,
          customRoleName: customRole?.name,
          permissions: undefined,
          avatar: `https://i.pravatar.cc/150?u=${encodeURIComponent(name.replace(/\s/g, ''))}`,
          updatedAt: new Date().toISOString()
        };

        set((state) => ({
          users: [...state.users, newUser],
          notifications: [
            makeNotification({
              targetRole: 'Admin',
              title: 'Member Added',
              message: `${currentUser.name} added ${name} as ${data.role}.`,
              route: { page: 'approvals' },
              iconType: 'success'
            }),
            ...(state.notifications || [])
          ]
        }));

        return { ok: true };
      },

      addCustomRole: (data) => {
        const state = get();
        if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };
        const currentUser = state.currentUser;
        if (!canCreateUsers(currentUser, state.rolePermissions)) {
          return { ok: false, error: 'Only Boss Koo can create custom roles.' };
        }

        const name = data.name.trim();
        if (!name) return { ok: false, error: 'Role name is required.' };

        const duplicate = get().rolePermissions.some(role => role.name.toLowerCase() === name.toLowerCase());
        if (duplicate) return { ok: false, error: 'A role with this name already exists.' };

        const now = new Date().toISOString();
        const id = nowId('CR');
        const customRole: CustomRole = {
          ...data,
          id,
          name,
          description: data.description?.trim() || undefined,
          isProtected: false,
          createdAt: now,
          updatedAt: now,
        };

        set((state) => ({
          rolePermissions: [...state.rolePermissions, customRole],
        }));

        return { ok: true, id };
      },

      updateCustomRole: (id, data) => {
        const state = get();
        if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };
        const currentUser = state.currentUser;
        if (!canCreateUsers(currentUser, state.rolePermissions)) {
          return { ok: false, error: 'Only Boss Koo can update custom roles.' };
        }

        const targetRole = get().rolePermissions.find(role => role.id === id);
        if (!targetRole) return { ok: false, error: 'Custom role was not found.' };
        if (targetRole.isProtected) return { ok: false, error: 'Protected roles cannot be changed.' };

        const nextName = data.name?.trim() || targetRole.name;
        const duplicate = get().rolePermissions.some(role => role.id !== id && role.name.toLowerCase() === nextName.toLowerCase());
        if (duplicate) return { ok: false, error: 'A role with this name already exists.' };

        set((state) => {
          const nextRoles = state.rolePermissions.map(role => (
            role.id === id
              ? {
                  ...role,
                  ...data,
                  name: nextName,
                  description: data.description?.trim() || undefined,
                  updatedAt: new Date().toISOString(),
                }
              : role
          ));

          return {
            rolePermissions: nextRoles,
            users: state.users.map(user => (
              user.customRoleId === id
                ? { ...user, customRoleName: nextName }
                : user
            )),
          };
        });

        return { ok: true };
      },

      deleteCustomRole: (id) => {
        const state = get();
        if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };
        const currentUser = state.currentUser;
        if (!canCreateUsers(currentUser, state.rolePermissions)) {
          return { ok: false, error: 'Only Boss Koo can delete custom roles.' };
        }

        const targetRole = get().rolePermissions.find(role => role.id === id);
        if (!targetRole) return { ok: false, error: 'Custom role was not found.' };
        if (targetRole.isProtected) return { ok: false, error: 'Protected roles cannot be deleted.' };

        set((state) => ({
          rolePermissions: state.rolePermissions.filter(role => role.id !== id),
          deletedRoleIds: Array.from(new Set([...(state.deletedRoleIds || []), id])),
          users: state.users.map(user => (
            user.customRoleId === id
              ? { ...user, customRoleId: undefined, customRoleName: undefined, permissions: undefined }
              : user
          )),
        }));

        return { ok: true };
      },

      assignCustomRoleToUser: (userId, customRoleId) => {
        const state = get();
        if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };
        const currentUser = state.currentUser;
        if (!canCreateUsers(currentUser, state.rolePermissions)) {
          return { ok: false, error: 'Only Boss Koo can assign custom roles.' };
        }

        const targetUser = get().users.find(user => user.id === userId);
        if (!targetUser) return { ok: false, error: 'User account was not found.' };
        if (isBossKoo(targetUser)) return { ok: false, error: 'Boss Koo keeps permanent super admin permissions.' };

        const customRole = customRoleId
          ? get().rolePermissions.find(role => role.id === customRoleId)
          : undefined;

        if (customRoleId && !customRole) return { ok: false, error: 'Custom role was not found.' };

        set((state) => ({
          users: state.users.map(user => (
            user.id === userId
              ? {
                  ...user,
                  customRoleId: customRole?.id,
                  customRoleName: customRole?.name,
                  permissions: undefined,
                  updatedAt: new Date().toISOString(),
                }
              : user
          )),
        }));

        return { ok: true };
      },

      approveRegistration: (id, role, department, companyName, customRoleId) => set((state) => {
        if (isWorkspaceMutationLocked(state)) return state;
        if (!canApproveRegistrations(state.currentUser, state.rolePermissions)) return state;

        const reg = state.registrations.find(r => r.id === id);
        if (!reg) return state;
        if (shouldUseSecureSupabase()) {
          return {
            registrations: state.registrations.map(r => r.id === id ? { ...r, status: 'Approved' } : r),
          };
        }
        const customRole = customRoleId
          ? state.rolePermissions.find(role => role.id === customRoleId)
          : undefined;

        const newUser: User = {
          id: nowId('U'),
          name: reg.name,
          mustResetPassword: true,
          role,
          department,
          companyName,
          customRoleId: customRole?.id,
          customRoleName: customRole?.name,
          avatar: `https://i.pravatar.cc/150?u=${reg.name.replace(/\s/g, '')}`,
          updatedAt: new Date().toISOString()
        };

        return {
          registrations: state.registrations.map(r => r.id === id ? { ...r, status: 'Approved' } : r),
          users: [...state.users, newUser]
        };
      }),

      rejectRegistration: (id) => set((state) => {
        if (isWorkspaceMutationLocked(state)) return state;
        return {
          registrations: canApproveRegistrations(state.currentUser, state.rolePermissions)
            ? state.registrations.map(r => r.id === id ? { ...r, status: 'Rejected' } : r)
            : state.registrations
        };
      }),

      deleteUser: async (userId) => {
        const state = get();
        const targetUser = state.users.find(user => user.id === userId);

        if (!canDeleteUser(state.currentUser, targetUser, state.rolePermissions)) {
          const error = !targetUser
            ? 'User account was not found.'
            : targetUser.id === state.currentUser?.id
              ? 'You cannot delete your own account.'
              : isBossKoo(targetUser)
                ? 'Protected super admin accounts cannot be deleted.'
                : 'Only Boss Koo can delete members.';

          return { ok: false, error };
        }

        if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };

        if (shouldUseSecureSupabase()) {
          const { data: { session }, error: sessionError } = await supabase.auth.getSession();
          if (sessionError || !session?.access_token) {
            return { ok: false, error: 'Your secure session has expired. Sign out, then sign in again.' };
          }
          const { error } = await supabase.functions.invoke('invite-aitask-member', {
            headers: { Authorization: `Bearer ${session.access_token}` },
            body: { action: 'delete_member', memberId: userId },
          });
          if (error) return { ok: false, error: await getFunctionErrorMessage(error, 'Unable to delete the member account.') };
          await get().pullBackendNow({ force: true, silent: true });
          return { ok: true };
        }

        set((current) => ({
          users: current.users.filter(user => user.id !== userId),
          deletedUserIds: Array.from(new Set([...(current.deletedUserIds || []), userId])),
          notifications: [
            makeNotification({
              targetRole: 'Admin',
              title: 'Member Removed',
              message: `${state.currentUser?.name || 'Super admin'} removed ${targetUser?.name}.`,
              route: { page: 'approvals' },
              iconType: 'alert'
            }),
            ...(current.notifications || [])
          ]
        }));

        return { ok: true };
      },

      _forceSyncMockData: () => {
        if (!shouldShowDemoLogin() || get().backend.mode === 'supabase') return;

        set((state) => {
          // Keep local development seeds compatible without touching hosted workspaces.
          const usersWithProtectedOwner = state.users.map(user => {
            const isBoss = user.id === 'u-boss' || user.name === 'Boss Koo';
            const normalizedUser = normalizeUserAccount(user);

            return {
              ...normalizedUser,
              ...(isBoss ? { isSuperAdmin: true } : {}),
            };
          });

          const newUsers = mockUsers
            .filter(mu => !usersWithProtectedOwner.some(su => su.id === mu.id))
            .map(user => normalizeUserAccount(user));
          const newProjects = mockProjects.filter(mp => !state.projects.some(sp => sp.id === mp.id));
          const tasksWithoutLegacyDemo = state.tasks.filter(task => !legacyDemoTaskIdSet.has(task.id));
          const newTasks = mockTasks.filter(mt => !tasksWithoutLegacyDemo.some(st => st.id === mt.id));
          const nextUsers = [...usersWithProtectedOwner, ...newUsers];
          const normalizedUsersChanged = usersWithProtectedOwner.some((user, index) => {
            const previous = state.users[index];
            return Boolean(previous.password) ||
              previous.mustResetPassword !== user.mustResetPassword ||
              previous.isSuperAdmin !== user.isSuperAdmin;
          });

          if (
            !normalizedUsersChanged &&
            newUsers.length === 0 &&
            newProjects.length === 0 &&
            newTasks.length === 0 &&
            tasksWithoutLegacyDemo.length === state.tasks.length
          ) {
            return state;
          }

          return {
            users: nextUsers,
            currentUser: getCurrentUserFromSnapshot(state.currentUser, nextUsers),
            projects: [...state.projects, ...newProjects],
            tasks: [...tasksWithoutLegacyDemo, ...newTasks],
          };
        });
      },

      addTaskStatus: (status) => {
        if (isWorkspaceMutationLocked(get())) return { ok: false, error: pendingMutationMessage };
        if (!isBossKoo(get().currentUser)) return { ok: false, error: 'Only Boss Koo can manage task statuses.' };
        const trimmed = status.trim();
        if (!trimmed) {
          return { ok: false, error: 'Status name cannot be empty.' };
        }
        if (trimmed.length > 50) {
          return { ok: false, error: 'Status name must be 50 characters or less.' };
        }
        const exists = get().taskStatuses.some(
          (s) => s.toLowerCase() === trimmed.toLowerCase()
        );
        if (exists) {
          return { ok: false, error: 'A status with this name already exists.' };
        }
        set((state) => ({
          taskStatuses: [...state.taskStatuses, trimmed],
          deletedTaskStatuses: (state.deletedTaskStatuses || []).filter(s => s.toLowerCase() !== trimmed.toLowerCase())
        }));
        useToastStore.getState().addToast(`Status "${trimmed}" added successfully`, 'success');
        return { ok: true };
      },

      deleteTaskStatus: (status) => {
        if (isWorkspaceMutationLocked(get())) return { ok: false, error: pendingMutationMessage };
        if (!isBossKoo(get().currentUser)) return { ok: false, error: 'Only Boss Koo can manage task statuses.' };
        const DEFAULTS = ['Pending', 'In Progress', 'Waiting Approval', 'Completed', 'Cancelled'];
        if (DEFAULTS.some(d => d.toLowerCase() === status.toLowerCase())) {
          return { ok: false, error: 'Cannot delete default system status.' };
        }
        const inUse = get().tasks.some(task => task.status.toLowerCase() === status.toLowerCase());
        if (inUse) {
          return { ok: false, error: 'Cannot delete status because it is currently assigned to tasks.' };
        }
        set((state) => ({
          taskStatuses: state.taskStatuses.filter(s => s.toLowerCase() !== status.toLowerCase()),
          deletedTaskStatuses: Array.from(new Set([...(state.deletedTaskStatuses || []), status.toLowerCase()]))
        }));
        useToastStore.getState().addToast(`Status "${status}" deleted successfully`, 'success');
        return { ok: true };
      }
    }),
    {
      name: 'market-task-storage',
      version: 2,
      migrate: (persistedState) => shouldUseSupabase() ? {} : persistedState as StoreState,
      partialize: (state) => {
        if (shouldUseSupabase()) return {};

        return {
          // Local-only development keeps its browser workspace; Supabase mode persists nothing here.
          currentUser: state.currentUser
            ? stripPassword(state.currentUser as User & { password?: string })
            : null,
          tasks: state.tasks,
          projects: state.projects,
          clients: state.clients,
          users: state.users.map(user => stripPassword(user as User & { password?: string })),
          registrations: state.registrations.map(r => stripPassword(r)),
          notifications: state.notifications,
          rolePermissions: state.rolePermissions,
          taskStatuses: state.taskStatuses,
          deletedUserIds: state.deletedUserIds || [],
          deletedRoleIds: state.deletedRoleIds || [],
          deletedTaskStatuses: state.deletedTaskStatuses || [],
          deletedClientIds: state.deletedClientIds || [],
        };
      },
    }
  )
);

let backendAutoSyncStarted = false;
export const startBackendAutoSync = () => {
  if (backendAutoSyncStarted) return;
  backendAutoSyncStarted = true;

  useStore.subscribe((state, previousState) => {
    if (!shouldUseSupabase() || state.backend.isLoading || state.backend.isPulling || isApplyingRemoteSnapshot) return;

    const workspaceChanged =
      state.users !== previousState.users ||
      state.clients !== previousState.clients ||
      state.projects !== previousState.projects ||
      state.tasks !== previousState.tasks ||
      state.notifications !== previousState.notifications ||
      state.registrations !== previousState.registrations ||
      state.rolePermissions !== previousState.rolePermissions ||
      state.taskStatuses !== previousState.taskStatuses ||
      state.deletedUserIds !== previousState.deletedUserIds ||
      state.deletedRoleIds !== previousState.deletedRoleIds ||
      state.deletedTaskStatuses !== previousState.deletedTaskStatuses ||
      state.deletedClientIds !== previousState.deletedClientIds;

    if (!workspaceChanged) return;

    if (!state.backend.hasLocalChanges) {
      useStore.setState((current) => ({
        backend: {
          ...current.backend,
          status: typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'saving',
          hasLocalChanges: true,
          pendingMutations: 1,
          message: current.backend.hasRemoteUpdate
            ? current.backend.message
            : typeof navigator !== 'undefined' && navigator.onLine === false
              ? 'Offline. This change has not been saved.'
              : 'Saving change.',
        }
      }));
    }

    if (shouldUseSecureSupabase()) return;
    if (state.backend.hasRemoteUpdate || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
    queueMicrotask(() => void useStore.getState().syncBackendNow());
  });

  const pullLatest = () => {
    if (!shouldUseSupabase() || document.visibilityState !== 'visible') return;
    const state = useStore.getState();
    if (shouldUseSecureSupabase() && !state.currentUser) return;
    void state.pullBackendNow({ silent: true });
  };

  window.setInterval(pullLatest, 15000);
  window.addEventListener('focus', pullLatest);
  document.addEventListener('visibilitychange', pullLatest);
  window.addEventListener('offline', () => {
    useStore.setState((state) => ({
      backend: {
        ...state.backend,
        status: 'offline',
        message: state.backend.hasLocalChanges
          ? 'Offline. A local change is waiting for your retry.'
          : 'Offline. Live sync will resume when you reconnect.',
      },
    }));
  });
  window.addEventListener('online', () => {
    useStore.setState((state) => ({
      backend: {
        ...state.backend,
        status: state.backend.hasLocalChanges ? 'retry_required' : 'loading',
        message: state.backend.hasLocalChanges
          ? 'Back online. Review and retry the pending change.'
          : 'Back online. Checking the latest workspace.',
      },
    }));
    const state = useStore.getState();
    if (!shouldUseSecureSupabase() || state.currentUser) {
      void state.pullBackendNow({ silent: true });
    }
  });
};
