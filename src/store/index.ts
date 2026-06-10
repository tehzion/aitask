import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useToastStore } from './useToastStore';
import {
  User,
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
import { DEFAULT_USER_PASSWORD, hasDefaultPassword } from '../lib/auth';
import { getBackendStatus, shouldUseSupabase } from '../lib/backend';
import {
  loadSupabaseSnapshot,
  PersistedWorkspaceState,
  saveSupabaseSnapshot,
  SnapshotResult,
} from '../lib/supabaseSnapshot';
import {
  canEditTask,
  canApproveRegistrations,
  canCreateTasks,
  canCreateUsers,
  canDeleteUser,
  canManageProjects,
  canReviewTaskAsClient,
  isNotificationReadByUser,
  isNotificationVisible,
  isBossKoo,
} from '../lib/access';

interface BackendRuntimeState {
  mode: 'local' | 'supabase';
  isConfigured: boolean;
  isLoading: boolean;
  isSaving: boolean;
  isPulling: boolean;
  lastSyncedAt?: string;
  lastPulledAt?: string;
  remoteVersion?: number;
  remoteUpdatedAt?: string;
  hasRemoteUpdate: boolean;
  hasLocalChanges: boolean;
  error?: string;
  message: string;
}

interface StoreState {
  currentUser: User | null;
  users: User[];
  projects: Project[];
  tasks: Task[];
  notifications: AppNotification[];
  registrations: Registration[];
  rolePermissions: CustomRole[];
  backend: BackendRuntimeState;
  taskStatuses: string[];
  isCreateTaskModalOpen: boolean;
  setCreateTaskModalOpen: (open: boolean) => void;

  initializeBackend: () => Promise<void>;
  syncBackendNow: () => Promise<void>;
  pullBackendNow: (options?: { force?: boolean; silent?: boolean }) => Promise<void>;
  login: (name: string, password?: string) => boolean;
  updateCurrentUserProfile: (data: Pick<User, 'name' | 'avatar'>) => { ok: boolean; error?: string };
  updateCurrentUserPassword: (data: { currentPassword?: string; newPassword: string; confirmPassword: string }) => { ok: boolean; error?: string };
  updateTaskStatus: (taskId: string, status: TaskStatus) => void;
  updateTaskPriority: (taskId: string, priority: Priority) => void;
  updateTaskAssignee: (taskId: string, assignedTo: string) => void;
  updateTaskDueDate: (taskId: string, newDueDate: string) => void;
  updateTaskAttachment: (taskId: string, attachmentLink: string, attachmentName?: string) => void;
  reviewClientApproval: (taskId: string, status: ClientApprovalStatus, note?: string) => void;
  requestRevision: (taskId: string, note?: string) => void;
  addTask: (task: Omit<Task, 'id' | 'isCompleted' | 'revisionCount' | 'clientApprovalStatus' | 'dueReminderSent' | 'approvalHistory'>) => void;
  addProject: (project: Omit<Project, 'id' | 'totalTasks' | 'completedTasks'>) => string;
  addComment: (taskId: string, text: string) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  sendDueDateReminders: () => void;
  registerUser: (data: Omit<Registration, 'id' | 'status' | 'createdAt'>) => void;
  addUserBySuperAdmin: (data: Omit<User, 'id' | 'avatar' | 'isSuperAdmin'>) => { ok: boolean; error?: string };
  addCustomRole: (data: Omit<CustomRole, 'id' | 'createdAt' | 'updatedAt' | 'isProtected'>) => { ok: boolean; id?: string; error?: string };
  updateCustomRole: (id: string, data: Partial<Pick<CustomRole, 'name' | 'description' | 'baseRole' | 'permissions'>>) => { ok: boolean; error?: string };
  deleteCustomRole: (id: string) => { ok: boolean; error?: string };
  assignCustomRoleToUser: (userId: string, customRoleId?: string) => { ok: boolean; error?: string };
  approveRegistration: (id: string, role: Role, department: Department, companyName?: string, customRoleId?: string) => void;
  rejectRegistration: (id: string) => void;
  deleteUser: (userId: string) => { ok: boolean; error?: string };
  _forceSyncMockData: () => void;
  addTaskStatus: (status: string) => { ok: boolean; error?: string };
  deleteTaskStatus: (status: string) => { ok: boolean; error?: string };
}

const nowId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
let isApplyingRemoteSnapshot = false;
const seededUserIds = new Set(mockUsers.map(user => user.id));
const legacyDemoTaskIdSet = new Set<string>(legacyDemoTaskIds);

const selectPersistedWorkspaceState = (state: Pick<StoreState, 'users' | 'projects' | 'tasks' | 'notifications' | 'registrations' | 'rolePermissions' | 'taskStatuses'>): PersistedWorkspaceState => ({
  users: state.users,
  projects: state.projects,
  tasks: state.tasks,
  notifications: state.notifications || [],
  registrations: state.registrations || [],
  rolePermissions: state.rolePermissions || [],
  taskStatuses: state.taskStatuses || [],
});

const makeBackendRuntimeState = (): BackendRuntimeState => {
  const status = getBackendStatus();
  return {
    mode: status.mode,
    isConfigured: status.configured,
    isLoading: false,
    isSaving: false,
    isPulling: false,
    hasRemoteUpdate: false,
    hasLocalChanges: false,
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

const normalizeWorkspaceState = (state: PersistedWorkspaceState): PersistedWorkspaceState => ({
  users: state.users || [],
  projects: state.projects || [],
  tasks: state.tasks || [],
  notifications: state.notifications || [],
  registrations: state.registrations || [],
  rolePermissions: state.rolePermissions || [],
  taskStatuses: state.taskStatuses || [],
});

const mergeWorkspaceStates = (
  localRaw: PersistedWorkspaceState,
  remoteRaw: PersistedWorkspaceState,
  lastSyncedAt: string
): PersistedWorkspaceState => {
  const local = normalizeWorkspaceState(localRaw);
  const remote = normalizeWorkspaceState(remoteRaw);
  const lastSyncedTime = new Date(lastSyncedAt || 0).getTime();

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

  // 2. Merge Projects
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

  // 3. Merge Users
  const localUsersMap = new Map(local.users.map(u => [u.id, u]));
  const remoteUsersMap = new Map(remote.users.map(u => [u.id, u]));
  const allUserIds = new Set([...localUsersMap.keys(), ...remoteUsersMap.keys()]);
  const mergedUsers: User[] = Array.from(allUserIds).map(id => {
    const localUser = localUsersMap.get(id);
    const remoteUser = remoteUsersMap.get(id);
    return remoteUser || localUser!;
  });

  // 4. Merge Registrations
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

  // 5. Merge Notifications
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
      isRead: localNotif.isRead && remoteNotif.isRead,
      readByUserIds,
    };
  });

  // 6. Merge Task Statuses
  const mergedTaskStatuses = Array.from(new Set([
    ...(local.taskStatuses || []),
    ...(remote.taskStatuses || [])
  ]));

  // 7. Merge Custom Roles
  const localRolesMap = new Map((local.rolePermissions || []).map(r => [r.id, r]));
  const remoteRolesMap = new Map((remote.rolePermissions || []).map(r => [r.id, r]));
  const allRoleIds = new Set([...localRolesMap.keys(), ...remoteRolesMap.keys()]);
  const mergedRolePermissions = Array.from(allRoleIds).map(id => {
    const localRole = localRolesMap.get(id);
    const remoteRole = remoteRolesMap.get(id);
    return remoteRole || localRole!;
  });

  return {
    users: mergedUsers,
    projects: mergedProjects,
    tasks: mergedTasks,
    notifications: mergedNotifications,
    registrations: mergedRegistrations,
    rolePermissions: mergedRolePermissions,
    taskStatuses: mergedTaskStatuses,
  };
};

const getCurrentUserFromSnapshot = (currentUser: User | null, users: User[]) => {
  if (!currentUser) return null;
  const nextUser = users.find(user => user.id === currentUser.id);
  return nextUser ? stripPassword(nextUser) as User : null;
};

const makeWorkspacePatch = (current: StoreState, snapshot: SnapshotResult) => {
  const workspace = normalizeWorkspaceState(snapshot.state);
  return {
    ...workspace,
    rolePermissions: workspace.rolePermissions || [],
    taskStatuses: workspace.taskStatuses && workspace.taskStatuses.length > 0
      ? workspace.taskStatuses
      : ['Pending', 'In Progress', 'Waiting Approval', 'Completed', 'Cancelled'],
    currentUser: getCurrentUserFromSnapshot(current.currentUser, workspace.users),
  };
};

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      users: mockUsers,
      projects: mockProjects,
      tasks: mockTasks,
      taskStatuses: ['Pending', 'In Progress', 'Waiting Approval', 'Completed', 'Cancelled'],
      isCreateTaskModalOpen: false,
      setCreateTaskModalOpen: (open) => set({ isCreateTaskModalOpen: open }),
      notifications: [],
      registrations: [],
      rolePermissions: [],
      backend: makeBackendRuntimeState(),

      initializeBackend: async () => {
        const status = getBackendStatus();
        set({
          backend: {
            mode: status.mode,
            isConfigured: status.configured,
            isLoading: status.mode === 'supabase' && status.configured,
            isSaving: false,
            isPulling: false,
            hasRemoteUpdate: false,
            hasLocalChanges: false,
            message: status.message,
            error: status.ready ? undefined : status.message,
          }
        });

        if (!shouldUseSupabase()) return;

        try {
          const result = await loadSupabaseSnapshot(selectPersistedWorkspaceState(get()));
          const syncedAt = new Date().toISOString();
          isApplyingRemoteSnapshot = true;
          set((state) => ({
            ...makeWorkspacePatch(state, result),
            backend: {
              mode: 'supabase',
              isConfigured: true,
              isLoading: false,
              isSaving: false,
              isPulling: false,
              lastSyncedAt: syncedAt,
              lastPulledAt: syncedAt,
              remoteVersion: result.version,
              remoteUpdatedAt: result.updatedAt,
              hasRemoteUpdate: false,
              hasLocalChanges: false,
              message: result.message,
            }
          }));
          isApplyingRemoteSnapshot = false;
        } catch (error) {
          set({
            backend: {
              mode: 'supabase',
              isConfigured: true,
              isLoading: false,
              isSaving: false,
              isPulling: false,
              hasRemoteUpdate: false,
              hasLocalChanges: false,
              message: 'Supabase sync failed. Continuing with local state.',
              error: error instanceof Error ? error.message : 'Unable to load Supabase state.',
            }
          });
        }
      },

      syncBackendNow: async () => {
        if (!shouldUseSupabase()) return;

        const current = get();
        if (current.backend.hasRemoteUpdate) {
          get().pullBackendNow();
          return;
        }

        set((state) => ({
          backend: {
            ...state.backend,
            isSaving: true,
            error: undefined,
          }
        }));

        try {
          const stateToSave = get();
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
              isSaving: false,
              lastSyncedAt: syncedAt,
              lastPulledAt: syncedAt,
              remoteVersion: result.version,
              remoteUpdatedAt: result.updatedAt,
              hasRemoteUpdate: false,
              hasLocalChanges: false,
              message: result.message,
            }
          }));
        } catch (error) {
          set((state) => ({
            backend: {
              ...state.backend,
              isSaving: false,
              message: 'Supabase save failed. Local state is still available.',
              error: error instanceof Error ? error.message : 'Unable to save Supabase state.',
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
            isPulling: true,
            error: undefined,
            message: options.silent ? state.backend.message : 'Checking for the latest workspace data.',
          }
        }));

        try {
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
              isPulling: false,
              message: 'Unable to check the latest Supabase state.',
              error: error instanceof Error ? error.message : 'Unable to load Supabase state.',
            }
          }));
        }
      },

      login: (name, password) => {
        // Match by name (case-insensitive) — never expose user IDs to the login UI
        const user = get().users.find(u => u.name.toLowerCase() === name.trim().toLowerCase());
        if (!user) return false;

        const expectedPassword = user.password || DEFAULT_USER_PASSWORD;
        if (expectedPassword !== password) {
          return false;
        }

        const mustResetPassword =
          Boolean(user.mustResetPassword) ||
          (!seededUserIds.has(user.id) && hasDefaultPassword(expectedPassword));
        const nextUser = {
          ...user,
          password: expectedPassword,
          mustResetPassword,
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

      updateCurrentUserProfile: (data) => {
        const currentUser = get().currentUser;
        if (!currentUser) return { ok: false, error: 'You must be logged in to update your profile.' };

        const name = data.name.trim();
        const avatar = data.avatar?.trim() || undefined;

        if (!name) return { ok: false, error: 'Name is required.' };

        const duplicate = get().users.some(user => (
          user.id !== currentUser.id &&
          user.name.toLowerCase() === name.toLowerCase()
        ));
        if (duplicate) return { ok: false, error: 'Another user already uses this name.' };

        const isAllowedAvatar =
          !avatar ||
          avatar.startsWith('/') ||
          avatar.startsWith('data:image/') ||
          /^https?:\/\//i.test(avatar);
        if (!isAllowedAvatar) {
          return { ok: false, error: 'Avatar must be a web image URL, data image, or app-relative path.' };
        }

        const nextCurrentUser: User = {
          ...currentUser,
          name,
          avatar,
        };

        set((state) => ({
          currentUser: nextCurrentUser,
          users: state.users.map(user => (
            user.id === currentUser.id
              ? { ...user, name, avatar }
              : user
          )),
        }));

        return { ok: true };
      },

      updateCurrentUserPassword: (data) => {
        const currentUser = get().currentUser;
        if (!currentUser) return { ok: false, error: 'You must be logged in to update your password.' };

        const account = get().users.find(user => user.id === currentUser.id);
        if (!account) return { ok: false, error: 'User account was not found.' };

        const currentPassword = data.currentPassword || '';
        const newPassword = data.newPassword.trim();
        const confirmPassword = data.confirmPassword.trim();
        const expectedCurrentPassword = account.password || DEFAULT_USER_PASSWORD;

        if (expectedCurrentPassword !== currentPassword) {
          return { ok: false, error: 'Current password is incorrect.' };
        }
        if (newPassword.length < 8) {
          return { ok: false, error: 'New password must be at least 8 characters.' };
        }
        if (newPassword !== confirmPassword) {
          return { ok: false, error: 'New password and confirmation do not match.' };
        }
        if (account.password === newPassword) {
          return { ok: false, error: 'New password must be different from the current password.' };
        }

        set((state) => ({
          currentUser: {
            ...currentUser,
            mustResetPassword: false,
          },
          users: state.users.map(user => (
            user.id === currentUser.id
              ? { ...user, password: newPassword, mustResetPassword: false }
              : user
          )),
        }));

        return { ok: true };
      },

      markNotificationRead: (id) => set((state) => {
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
        const task = state.tasks.find(t => t.id === taskId);
        const currentUser = state.currentUser;
        if (!task || !canEditTask(currentUser, task, state.rolePermissions)) return state;

        const isCompleted = status === 'Completed';
        const isWaitingApproval = status === 'Waiting Approval';
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
            status,
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
            message: `"${task.title}" was moved to ${status} by ${currentUser?.name}.`,
            link: `/tasks?taskId=${taskId}`,
            iconType: 'status'
          }));
        }

        if (isReadyForClientReview) {
          newNotifs.push(makeNotification({
            targetClient: task.clientName,
            title: isCompleted ? 'Task Completed' : 'Task Ready for Approval',
            message: `"${task.title}" is ready for client review.`,
            link: `/tasks?taskId=${taskId}`,
            iconType: 'success'
          }));
        }

        useToastStore.getState().addToast(`Status updated to "${status}"`, 'success');

        return {
          tasks: newTasks,
          notifications: [...newNotifs, ...(state.notifications || [])]
        };
      }),

      updateTaskPriority: (taskId, priority) => set((state) => {
        const task = state.tasks.find(t => t.id === taskId);
        const currentUser = state.currentUser;
        if (!task || !canEditTask(currentUser, task, state.rolePermissions)) return state;

        const newTasks = state.tasks.map(t => {
          if (t.id !== taskId) return t;
          return { ...t, priority, updatedAt: new Date().toISOString() };
        });

        useToastStore.getState().addToast(`Priority updated to "${priority}"`, 'success');

        return { tasks: newTasks };
      }),

      updateTaskAssignee: (taskId, assignedTo) => set((state) => {
        const task = state.tasks.find(t => t.id === taskId);
        const currentUser = state.currentUser;
        if (!task || !canEditTask(currentUser, task, state.rolePermissions)) return state;

        const newTasks = state.tasks.map(t => {
          if (t.id !== taskId) return t;
          return { ...t, assignedTo, updatedAt: new Date().toISOString() };
        });

        const assigneeUser = state.users.find(u => u.id === assignedTo);
        const assigneeName = assigneeUser ? assigneeUser.name : 'someone';

        const newNotifs: AppNotification[] = [];
        if (assignedTo !== task.assignedTo) {
          newNotifs.push(makeNotification({
            targetUserId: assignedTo,
            title: 'Task Assigned To You',
            message: `"${task.title}" has been assigned to you by ${currentUser?.name}.`,
            link: `/tasks?taskId=${taskId}`,
            iconType: 'task'
          }));
        }

        useToastStore.getState().addToast(`Task assigned to ${assigneeName}`, 'success');

        return {
          tasks: newTasks,
          notifications: [...newNotifs, ...(state.notifications || [])]
        };
      }),

      updateTaskAttachment: (taskId, attachmentLink, attachmentName) => set((state) => {
        const task = state.tasks.find(t => t.id === taskId);
        if (!task || !canEditTask(state.currentUser, task, state.rolePermissions)) return state;

        // Validate that the attachment link is a safe http(s) URL
        const trimmedLink = attachmentLink.trim();
        if (trimmedLink) {
          try {
            const parsed = new URL(trimmedLink);
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return state;
          } catch {
            return state; // Invalid URL — reject silently
          }
        }

        useToastStore.getState().addToast('Attachment updated successfully', 'success');

        return {
          tasks: state.tasks.map(task =>
            task.id === taskId
              ? {
                  ...task,
                  attachmentLink: trimmedLink || undefined,
                  attachmentName: attachmentName?.trim().slice(0, 200) || undefined,
                  updatedAt: new Date().toISOString()
                }
              : task
          )
        };
      }),

      updateTaskDueDate: (taskId, newDueDate) => set((state) => {
        const task = state.tasks.find(t => t.id === taskId);
        if (!task || !canEditTask(state.currentUser, task, state.rolePermissions)) return state;

        // Basic ISO date validation (YYYY-MM-DD)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(newDueDate)) return state;

        useToastStore.getState().addToast(`Due date updated to ${newDueDate}`, 'success');

        return {
          tasks: state.tasks.map(t =>
            t.id === taskId ? { ...t, dueDate: newDueDate, updatedAt: new Date().toISOString() } : t
          ),
        };
      }),

      reviewClientApproval: (taskId, status, note) => set((state) => {
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

        const notifications = [
          makeNotification({
            targetRole: 'Admin',
            title: status === 'Approved' ? 'Client Approved Task' : 'Client Requested Revision',
            message: `${currentUser.name} ${status === 'Approved' ? 'approved' : 'rejected'} "${task.title}"${note ? `: ${note}` : '.'}`,
            link: `/tasks?taskId=${taskId}`,
            iconType: status === 'Approved' ? 'success' : 'alert'
          }),
        ];

        if (status === 'Rejected') {
          notifications.push(makeNotification({
            targetUserId: task.assignedTo,
            title: 'Client Requested Revision',
            message: `${currentUser.name} requested changes on "${task.title}"${note ? `: ${note}` : '.'}`,
            link: `/tasks?taskId=${taskId}`,
            iconType: 'alert'
          }));
        } else {
          notifications.push(makeNotification({
            targetUserId: task.assignedTo,
            title: 'Client Approved Task',
            message: `${currentUser.name} approved "${task.title}".`,
            link: `/tasks?taskId=${taskId}`,
            iconType: 'success'
          }));
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
              link: `/tasks?taskId=${taskId}`,
              iconType: 'alert'
            }),
            ...(state.notifications || [])
          ]
        };
      }),

      addTask: (taskData) => set((state) => {
        if (!canCreateTasks(state.currentUser, state.rolePermissions)) return state;

        const taskId = `T-${Date.now().toString().slice(-6)}`;
        const newTask: Task = {
          ...taskData,
          id: taskId,
          isCompleted: false,
          revisionCount: 0,
          clientApprovalStatus: 'Pending',
          dueReminderSent: false,
          approvalHistory: [],
          updatedAt: new Date().toISOString(),
        };

        useToastStore.getState().addToast(`Task "${taskData.title}" created successfully`, 'success');

        return {
          tasks: [...state.tasks, newTask],
          notifications: [
            makeNotification({
              targetUserId: taskData.assignedTo,
              title: 'New Task Assigned',
              message: `You have been assigned a new task: "${taskData.title}".`,
              link: `/tasks?taskId=${taskId}`,
              iconType: 'task'
            }),
            ...(state.notifications || [])
          ]
        };
      }),

      addProject: (projectData) => {
        if (!canManageProjects(get().currentUser, get().rolePermissions)) return '';

        const newProject: Project = {
          ...projectData,
          totalTasks: 0,
          completedTasks: 0,
          id: `P-${Date.now().toString().slice(-6)}`,
          updatedAt: new Date().toISOString(),
        };
        set((state) => ({ projects: [...state.projects, newProject] }));
        useToastStore.getState().addToast(`Project "${projectData.projectName}" created successfully`, 'success');
        return newProject.id;
      },

      addComment: (taskId, text) => set((state) => {
        const currentUser = state.currentUser;
        const task = state.tasks.find(t => t.id === taskId);
        if (!currentUser || !task || !canEditTask(currentUser, task, state.rolePermissions)) return state;

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
        if (currentUser.role !== 'Admin') {
          newNotifs.push(makeNotification({
            targetRole: 'Admin',
            title: 'New Comment',
            message: `${currentUser.name} commented on "${task.title}".`,
            link: `/tasks?taskId=${taskId}`,
            iconType: 'status'
          }));
        } else if (task.assignedTo !== currentUser.id) {
          newNotifs.push(makeNotification({
            targetUserId: task.assignedTo,
            title: 'New Comment',
            message: `${currentUser.name} commented on your task "${task.title}".`,
            link: `/tasks?taskId=${taskId}`,
            iconType: 'status'
          }));
        }

        return {
          tasks: newTasks,
          notifications: [...newNotifs, ...(state.notifications || [])]
        };
      }),

      sendDueDateReminders: () => set((state) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const newNotifs: AppNotification[] = [];
        const tasks = state.tasks.map(task => {
          if (task.isCompleted || task.dueReminderSent) return task;
          const dueDate = new Date(`${task.dueDate}T00:00:00`);
          const isApproaching = dueDate.getTime() === today.getTime() || dueDate.getTime() === tomorrow.getTime();
          if (!isApproaching) return task;

          const when = dueDate.getTime() === today.getTime() ? 'today' : 'tomorrow';
          newNotifs.push(makeNotification({
            targetUserId: task.assignedTo,
            title: 'Task Deadline Approaching',
            message: `"${task.title}" is due ${when}.`,
            link: `/tasks?taskId=${task.id}`,
            iconType: 'alert'
          }));
          newNotifs.push(makeNotification({
            targetRole: 'Admin',
            title: 'Task Deadline Approaching',
            message: `"${task.title}" for ${task.clientName} is due ${when}.`,
            link: `/tasks?taskId=${task.id}`,
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

      registerUser: (data) => set((state) => {
        const newReg: Registration = {
          ...data,
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
            message: `${data.name} has registered and is waiting for your approval.`,
            link: '/approvals',
            iconType: 'status'
          }));
        }

        return {
          registrations: [...(state.registrations || []), newReg],
          notifications: newNotifs
        };
      }),

      addUserBySuperAdmin: (data) => {
        const currentUser = get().currentUser;
        if (!canCreateUsers(currentUser, get().rolePermissions)) {
          return { ok: false, error: 'Only Boss Koo can add members directly.' };
        }

        const name = data.name.trim();
        const email = data.email?.trim();
        const password = data.password?.trim() || DEFAULT_USER_PASSWORD;
        const companyName = data.role === 'Client' ? data.companyName?.trim() : undefined;

        if (!name) return { ok: false, error: 'Member name is required.' };
        if (data.role === 'Client' && !companyName) {
          return { ok: false, error: 'Client company is required for Client users.' };
        }

        const duplicate = get().users.some(user => (
          user.name.toLowerCase() === name.toLowerCase() ||
          (email && user.email?.toLowerCase() === email.toLowerCase())
        ));

        if (duplicate) {
          return { ok: false, error: 'A member with that name or email already exists.' };
        }

        const customRole = data.customRoleId
          ? get().rolePermissions.find(role => role.id === data.customRoleId)
          : undefined;

        const newUser: User = {
          ...data,
          id: nowId('U'),
          name,
          email,
          password,
          mustResetPassword: true,
          companyName,
          isSuperAdmin: false,
          customRoleId: customRole?.id,
          customRoleName: customRole?.name,
          permissions: undefined,
          avatar: `https://i.pravatar.cc/150?u=${encodeURIComponent(name.replace(/\s/g, ''))}`
        };

        set((state) => ({
          users: [...state.users, newUser],
          notifications: [
            makeNotification({
              targetRole: 'Admin',
              title: 'Member Added',
              message: `${currentUser.name} added ${name} as ${data.role}.`,
              link: '/approvals',
              iconType: 'success'
            }),
            ...(state.notifications || [])
          ]
        }));

        return { ok: true };
      },

      addCustomRole: (data) => {
        const currentUser = get().currentUser;
        if (!canCreateUsers(currentUser, get().rolePermissions)) {
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
        const currentUser = get().currentUser;
        if (!canCreateUsers(currentUser, get().rolePermissions)) {
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
        const currentUser = get().currentUser;
        if (!canCreateUsers(currentUser, get().rolePermissions)) {
          return { ok: false, error: 'Only Boss Koo can delete custom roles.' };
        }

        const targetRole = get().rolePermissions.find(role => role.id === id);
        if (!targetRole) return { ok: false, error: 'Custom role was not found.' };
        if (targetRole.isProtected) return { ok: false, error: 'Protected roles cannot be deleted.' };

        set((state) => ({
          rolePermissions: state.rolePermissions.filter(role => role.id !== id),
          users: state.users.map(user => (
            user.customRoleId === id
              ? { ...user, customRoleId: undefined, customRoleName: undefined, permissions: undefined }
              : user
          )),
        }));

        return { ok: true };
      },

      assignCustomRoleToUser: (userId, customRoleId) => {
        const currentUser = get().currentUser;
        if (!canCreateUsers(currentUser, get().rolePermissions)) {
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
                }
              : user
          )),
        }));

        return { ok: true };
      },

      approveRegistration: (id, role, department, companyName, customRoleId) => set((state) => {
        if (!canApproveRegistrations(state.currentUser, state.rolePermissions)) return state;

        const reg = state.registrations.find(r => r.id === id);
        if (!reg) return state;
        const customRole = customRoleId
          ? state.rolePermissions.find(role => role.id === customRoleId)
          : undefined;

        const newUser: User = {
          id: nowId('U'),
          name: reg.name,
          password: DEFAULT_USER_PASSWORD,
          mustResetPassword: true,
          role,
          department,
          companyName,
          customRoleId: customRole?.id,
          customRoleName: customRole?.name,
          avatar: `https://i.pravatar.cc/150?u=${reg.name.replace(/\s/g, '')}`
        };

        return {
          registrations: state.registrations.map(r => r.id === id ? { ...r, status: 'Approved' } : r),
          users: [...state.users, newUser]
        };
      }),

      rejectRegistration: (id) => set((state) => ({
        registrations: canApproveRegistrations(state.currentUser, state.rolePermissions)
          ? state.registrations.map(r => r.id === id ? { ...r, status: 'Rejected' } : r)
          : state.registrations
      })),

      deleteUser: (userId) => {
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

        set((current) => ({
          users: current.users.filter(user => user.id !== userId),
          notifications: [
            makeNotification({
              targetRole: 'Admin',
              title: 'Member Removed',
              message: `${state.currentUser?.name || 'Super admin'} removed ${targetUser?.name}.`,
              link: '/approvals',
              iconType: 'alert'
            }),
            ...(current.notifications || [])
          ]
        }));

        return { ok: true };
      },

      _forceSyncMockData: () => set((state) => {
        // Re-apply isSuperAdmin and restore passwords for known mock accounts.
        // Passwords may be absent in older localStorage snapshots, so we
        // hydrate only missing mock passwords without overriding user changes.
        const mockPasswordMap = new Map(mockUsers.map(u => [u.id, u.password]));

        const usersWithProtectedOwner = state.users.map(user => {
          const isBoss = user.id === 'u-boss' || user.name === 'Boss Koo';
          const restoredPassword = mockPasswordMap.get(user.id);
          const isSeededUser = seededUserIds.has(user.id);
          const password = user.password || restoredPassword || DEFAULT_USER_PASSWORD;
          const mustResetPassword = isSeededUser
            ? user.mustResetPassword
            : user.mustResetPassword || hasDefaultPassword(password);

          return {
            ...user,
            password,
            mustResetPassword,
            ...(isBoss ? { isSuperAdmin: true } : {}),
          };
        });

        const newUsers = mockUsers.filter(mu => !usersWithProtectedOwner.some(su => su.id === mu.id));
        const newProjects = mockProjects.filter(mp => !state.projects.some(sp => sp.id === mp.id));
        const tasksWithoutLegacyDemo = state.tasks.filter(task => !legacyDemoTaskIdSet.has(task.id));
        const newTasks = mockTasks.filter(mt => !tasksWithoutLegacyDemo.some(st => st.id === mt.id));

        return {
          users: [...usersWithProtectedOwner, ...newUsers],
          projects: [...state.projects, ...newProjects],
          tasks: [...tasksWithoutLegacyDemo, ...newTasks],
        };
      }),

      addTaskStatus: (status) => {
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
          taskStatuses: [...state.taskStatuses, trimmed]
        }));
        useToastStore.getState().addToast(`Status "${trimmed}" added successfully`, 'success');
        return { ok: true };
      },

      deleteTaskStatus: (status) => {
        const DEFAULTS = ['Pending', 'In Progress', 'Waiting Approval', 'Completed', 'Cancelled'];
        if (DEFAULTS.some(d => d.toLowerCase() === status.toLowerCase())) {
          return { ok: false, error: 'Cannot delete default system status.' };
        }
        const inUse = get().tasks.some(task => task.status.toLowerCase() === status.toLowerCase());
        if (inUse) {
          return { ok: false, error: 'Cannot delete status because it is currently assigned to tasks.' };
        }
        set((state) => ({
          taskStatuses: state.taskStatuses.filter(s => s.toLowerCase() !== status.toLowerCase())
        }));
        useToastStore.getState().addToast(`Status "${status}" deleted successfully`, 'success');
        return { ok: true };
      }
    }),
    {
      name: 'market-task-storage',
      partialize: (state) => ({
        // currentUser never holds a password — strip it before writing to localStorage.
        // users[] keeps passwords so that user-changed passwords survive page reloads.
        // Registrations strip passwords (one-time use during approval flow).
        currentUser: state.currentUser
          ? stripPassword(state.currentUser as User & { password?: string })
          : null,
        tasks: state.tasks,
        projects: state.projects,
        users: state.users,
        registrations: state.registrations.map(r => stripPassword(r)),
        notifications: state.notifications,
        rolePermissions: state.rolePermissions,
        taskStatuses: state.taskStatuses,
      }),
    }
  )
);

let backendAutoSyncStarted = false;
let backendAutoSyncTimer: number | undefined;

export const startBackendAutoSync = () => {
  if (backendAutoSyncStarted) return;
  backendAutoSyncStarted = true;

  useStore.subscribe((state, previousState) => {
    if (!shouldUseSupabase() || state.backend.isLoading || state.backend.isPulling || isApplyingRemoteSnapshot) return;

    const workspaceChanged =
      state.users !== previousState.users ||
      state.projects !== previousState.projects ||
      state.tasks !== previousState.tasks ||
      state.notifications !== previousState.notifications ||
      state.registrations !== previousState.registrations ||
      state.rolePermissions !== previousState.rolePermissions ||
      state.taskStatuses !== previousState.taskStatuses;

    if (!workspaceChanged) return;

    if (!state.backend.hasLocalChanges) {
      useStore.setState((current) => ({
        backend: {
          ...current.backend,
          hasLocalChanges: true,
          message: current.backend.hasRemoteUpdate
            ? current.backend.message
            : 'Local changes pending sync.',
        }
      }));
    }

    if (state.backend.hasRemoteUpdate) return;

    if (backendAutoSyncTimer) window.clearTimeout(backendAutoSyncTimer);
    backendAutoSyncTimer = window.setTimeout(() => {
      void useStore.getState().syncBackendNow();
    }, 800);
  });

  const pullLatest = () => {
    if (!shouldUseSupabase() || document.visibilityState !== 'visible') return;
    void useStore.getState().pullBackendNow({ silent: true });
  };

  window.setInterval(pullLatest, 15000);
  window.addEventListener('focus', pullLatest);
  document.addEventListener('visibilitychange', pullLatest);
};
