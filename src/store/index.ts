import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  User,
  Project,
  Task,
  TaskStatus,
  AppNotification,
  TaskComment,
  Registration,
  Role,
  Department,
  ClientApprovalStatus,
  TaskApprovalEvent,
  CustomRole,
} from '../types';
import { mockUsers, mockProjects, mockTasks } from '../mock';
import { getBackendStatus, shouldUseSupabase } from '../lib/backend';
import {
  loadSupabaseSnapshot,
  PersistedWorkspaceState,
  saveSupabaseSnapshot,
} from '../lib/supabaseSnapshot';
import {
  canEditTask,
  canApproveRegistrations,
  canCreateTasks,
  canCreateUsers,
  canDeleteUser,
  canManageProjects,
  canReviewTaskAsClient,
  isBossKoo,
} from '../lib/access';

interface BackendRuntimeState {
  mode: 'local' | 'supabase';
  isConfigured: boolean;
  isLoading: boolean;
  isSaving: boolean;
  lastSyncedAt?: string;
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

  initializeBackend: () => Promise<void>;
  syncBackendNow: () => Promise<void>;
  login: (name: string, password?: string) => boolean;
  updateCurrentUserProfile: (data: Pick<User, 'name' | 'avatar'>) => { ok: boolean; error?: string };
  updateCurrentUserPassword: (data: { currentPassword?: string; newPassword: string; confirmPassword: string }) => { ok: boolean; error?: string };
  updateTaskStatus: (taskId: string, status: TaskStatus) => void;
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
}

const nowId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const selectPersistedWorkspaceState = (state: Pick<StoreState, 'users' | 'projects' | 'tasks' | 'notifications' | 'registrations' | 'rolePermissions'>): PersistedWorkspaceState => ({
  users: state.users,
  projects: state.projects,
  tasks: state.tasks,
  notifications: state.notifications || [],
  registrations: state.registrations || [],
  rolePermissions: state.rolePermissions || [],
});

const makeBackendRuntimeState = (): BackendRuntimeState => {
  const status = getBackendStatus();
  return {
    mode: status.mode,
    isConfigured: status.configured,
    isLoading: false,
    isSaving: false,
    message: status.message,
  };
};

const makeNotification = (data: Omit<AppNotification, 'id' | 'isRead' | 'createdAt'>): AppNotification => ({
  ...data,
  id: nowId('N'),
  isRead: false,
  createdAt: new Date().toISOString(),
});

const stripPassword = <T extends { password?: string }>(item: T): Omit<T, 'password'> => {
  const cleanItem = { ...item };
  delete cleanItem.password;
  return cleanItem;
};

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      users: mockUsers,
      projects: mockProjects,
      tasks: mockTasks,
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
            message: status.message,
            error: status.ready ? undefined : status.message,
          }
        });

        if (!shouldUseSupabase()) return;

        try {
          const result = await loadSupabaseSnapshot(selectPersistedWorkspaceState(get()));
          set((state) => ({
            ...result.state,
            rolePermissions: result.state.rolePermissions || [],
            currentUser: state.currentUser
              ? result.state.users.find(user => user.id === state.currentUser?.id) || null
              : null,
            backend: {
              mode: 'supabase',
              isConfigured: true,
              isLoading: false,
              isSaving: false,
              lastSyncedAt: new Date().toISOString(),
              message: result.message,
            }
          }));
        } catch (error) {
          set({
            backend: {
              mode: 'supabase',
              isConfigured: true,
              isLoading: false,
              isSaving: false,
              message: 'Supabase sync failed. Continuing with local state.',
              error: error instanceof Error ? error.message : 'Unable to load Supabase state.',
            }
          });
        }
      },

      syncBackendNow: async () => {
        if (!shouldUseSupabase()) return;

        set((state) => ({
          backend: {
            ...state.backend,
            isSaving: true,
            error: undefined,
          }
        }));

        try {
          await saveSupabaseSnapshot(selectPersistedWorkspaceState(get()));
          set((state) => ({
            backend: {
              ...state.backend,
              isSaving: false,
              lastSyncedAt: new Date().toISOString(),
              message: 'Workspace state synced to Supabase.',
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

      login: (name, password) => {
        // Match by name (case-insensitive) — never expose user IDs to the login UI
        const user = get().users.find(u => u.name.toLowerCase() === name.trim().toLowerCase());
        if (!user) return false;

        // If the user has a password set, it must match exactly
        if (user.password && user.password !== password) {
          return false;
        }

        // Strip sensitive fields before placing in currentUser session state
        set({ currentUser: stripPassword(user) as User });
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

        if (account.password && account.password !== currentPassword) {
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
          users: state.users.map(user => (
            user.id === currentUser.id
              ? { ...user, password: newPassword }
              : user
          )),
        }));

        return { ok: true };
      },

      markNotificationRead: (id) => set((state) => ({
        notifications: (state.notifications || []).map(n =>
          n.id === id ? { ...n, isRead: true } : n
        )
      })),

      markAllNotificationsRead: () => set((state) => {
        const currentUser = state.currentUser;
        if (!currentUser) return state;

        return {
          notifications: (state.notifications || []).map(n => {
            const isMine =
              n.targetUserId === currentUser.id ||
              n.targetRole === currentUser.role ||
              (currentUser.role === 'Client' && n.targetClient === currentUser.companyName);

            return isMine ? { ...n, isRead: true } : n;
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

        return {
          tasks: state.tasks.map(task =>
            task.id === taskId
              ? {
                  ...task,
                  attachmentLink: trimmedLink || undefined,
                  attachmentName: attachmentName?.trim().slice(0, 200) || undefined
                }
              : task
          )
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
          };
        });

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
        };

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
        };
        set((state) => ({ projects: [...state.projects, newProject] }));
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
            return { ...t, comments: [...(t.comments || []), newComment] };
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
        const password = data.password?.trim();
        const companyName = data.role === 'Client' ? data.companyName?.trim() : undefined;

        if (!name) return { ok: false, error: 'Member name is required.' };
        if (!password) return { ok: false, error: 'Password is required.' };
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
          password: reg.password,
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
          return {
            ...user,
            ...(!user.password && restoredPassword ? { password: restoredPassword } : {}),
            ...(isBoss ? { isSuperAdmin: true } : {}),
          };
        });

        const newUsers = mockUsers.filter(mu => !usersWithProtectedOwner.some(su => su.id === mu.id));
        const newProjects = mockProjects.filter(mp => !state.projects.some(sp => sp.id === mp.id));
        const newTasks = mockTasks.filter(mt => !state.tasks.some(st => st.id === mt.id));

        return {
          users: [...usersWithProtectedOwner, ...newUsers],
          projects: [...state.projects, ...newProjects],
          tasks: [...state.tasks, ...newTasks],
        };
      })
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
    if (!shouldUseSupabase() || state.backend.isLoading) return;

    const workspaceChanged =
      state.users !== previousState.users ||
      state.projects !== previousState.projects ||
      state.tasks !== previousState.tasks ||
      state.notifications !== previousState.notifications ||
      state.registrations !== previousState.registrations ||
      state.rolePermissions !== previousState.rolePermissions;

    if (!workspaceChanged) return;

    if (backendAutoSyncTimer) window.clearTimeout(backendAutoSyncTimer);
    backendAutoSyncTimer = window.setTimeout(() => {
      void useStore.getState().syncBackendNow();
    }, 800);
  });
};
