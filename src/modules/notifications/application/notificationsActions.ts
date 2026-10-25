import { isWorkspaceMutationLocked } from '../../../infrastructure/commands/mutationGuard';
import {
  shouldUseSecureSupabase
} from '../../../infrastructure/database/supabaseClient';
import { workspaceMutationRuntime } from '../../../infrastructure/persistence/workspaceMutationRuntime';
import {
  canEditTask,
  isNotificationReadByUser,
  isNotificationVisible
} from '../../../shared/authorization/access';
import {
  type AppNotification
} from '../../../shared/types/index';
import { type StoreState, type WorkspaceSet } from '../../../shared/types/workspaceStore';
import { isValidIsoDate } from '../../../shared/validation/workspaceInput';
import { appendNotification, countUnreadForUser, getNotificationReadReceipts, resolveTaskUpdateRecipientIds, taskUpdateNotifications } from './notificationRules';
export const createNotificationsActions = (set: WorkspaceSet): Pick<StoreState, "markNotificationRead" | "markNotificationUnread" | "markAllNotificationsRead" | "sendDueDateReminders"> => ({
  markNotificationRead: (id) => {
    workspaceMutationRuntime.isApplyingNotificationRead = true;
    set((state) => {
      const currentUser = state.currentUser;
      if (!currentUser) return state;
      const notifications = (state.notifications || []).map(notification => (
        notification.id === id
          ? {
            ...notification,
            readByUserIds: Array.from(new Set([
              ...getNotificationReadReceipts(notification, state.users),
              currentUser.id,
            ])),
            unreadByUserIds: (notification.unreadByUserIds || []).filter(userId => userId !== currentUser.id),
            isRead: notification.targetUserId === currentUser.id && !notification.targetRole && !notification.targetClient
              ? true
              : notification.isRead,
          }
          : notification
      ));
      return { notifications, notificationUnreadCount: shouldUseSecureSupabase() ? state.notificationUnreadCount : countUnreadForUser(currentUser, notifications) };
    });
    workspaceMutationRuntime.isApplyingNotificationRead = false;
  },
  markNotificationUnread: (id) => {
    workspaceMutationRuntime.isApplyingNotificationRead = true;
    set((state) => {
      const currentUser = state.currentUser;
      if (!currentUser) return state;
      const notifications = (state.notifications || []).map(notification => (
        notification.id === id
          ? {
            ...notification,
            readByUserIds: getNotificationReadReceipts(notification, state.users)
              .filter(userId => userId !== currentUser.id),
            unreadByUserIds: Array.from(new Set([
              ...(notification.unreadByUserIds || []),
              currentUser.id,
            ])),
            isRead: false,
          }
          : notification
      ));
      return { notifications, notificationUnreadCount: shouldUseSecureSupabase() ? state.notificationUnreadCount : countUnreadForUser(currentUser, notifications) };
    });
    workspaceMutationRuntime.isApplyingNotificationRead = false;
  },
  markAllNotificationsRead: () => {
    workspaceMutationRuntime.isApplyingNotificationRead = true;
    set((state) => {
      const currentUser = state.currentUser;
      if (!currentUser) return state;
      const notifications = (state.notifications || []).map(notification => {
        const isMine = isNotificationVisible(currentUser, notification);
        if (!isMine || isNotificationReadByUser(currentUser, notification)) return notification;
        return {
          ...notification,
          readByUserIds: Array.from(new Set([
            ...getNotificationReadReceipts(notification, state.users),
            currentUser.id,
          ])),
          unreadByUserIds: (notification.unreadByUserIds || []).filter(userId => userId !== currentUser.id),
          isRead: notification.targetUserId === currentUser.id && !notification.targetRole && !notification.targetClient
            ? true
            : notification.isRead,
        };
      });
      return { notifications, notificationUnreadCount: shouldUseSecureSupabase() ? state.notificationUnreadCount : countUnreadForUser(currentUser, notifications) };
    });
    workspaceMutationRuntime.isApplyingNotificationRead = false;
  },
  sendDueDateReminders: () => set((state) => {
    if (isWorkspaceMutationLocked(state)) return state;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const newNotifs: AppNotification[] = [];
    const tasks = state.tasks.map(task => {
      if (
        task.isCompleted
        || task.status === 'Cancelled'
        || task.dueReminderSent
        || !canEditTask(state.currentUser, task, state.rolePermissions, { users: state.users, clients: state.clients, projects: state.projects })
      ) return task;
      if (!task.dueDate || !isValidIsoDate(task.dueDate)) return task;
      const dueDate = new Date(`${task.dueDate}T00:00:00`);
      const isApproaching = dueDate.getTime() === today.getTime() || dueDate.getTime() === tomorrow.getTime();
      if (!isApproaching) return task;

      const when = dueDate.getTime() === today.getTime() ? 'today' : 'tomorrow';
      if (task.assignedTo) {
        appendNotification(newNotifs, {
          targetUserId: task.assignedTo,
          title: 'Task Deadline Approaching',
          message: `"${task.title}" is due ${when}.`,
          route: { page: 'tasks', entityId: task.id },
          iconType: 'alert'
        });
      }
      newNotifs.push(...taskUpdateNotifications(
        resolveTaskUpdateRecipientIds(state.users, task, state.clients, state.projects, state.rolePermissions)
          .filter(id => id !== task.assignedTo),
        {
          title: 'Task Deadline Approaching',
          message: `"${task.title}" for ${task.clientName} is due ${when}.`,
          route: { page: 'tasks', entityId: task.id },
          iconType: 'alert',
        },
        state.currentUser?.id,
      ));

      return { ...task, dueReminderSent: true };
    });

    if (newNotifs.length === 0) return state;

    return {
      tasks,
      notifications: [...newNotifs, ...(state.notifications || [])]
    };
  })
});
