import { useCallback, useMemo, useState } from 'react';
import { getUnreadNotifications } from '../lib/access';
import {
  captureNotificationReadState,
  createNotificationMutationLock,
  restoreNotificationReadState,
} from '../lib/notificationReads';
import { setSecureNotificationsRead } from '../lib/secureWorkspace';
import { shouldUseSecureSupabase } from '../lib/supabaseClient';
import { useStore } from '../store';
import { useToastStore } from '../store/useToastStore';

export interface NotificationReadActions {
  markRead: (notificationIds: string | string[]) => Promise<boolean>;
  markUnread: (notificationIds: string | string[]) => Promise<boolean>;
  markAllRead: () => Promise<boolean>;
  isUpdating: boolean;
}

const notificationMutationLock = createNotificationMutationLock();
const toIds = (value: string | string[]) => Array.from(new Set(
  (Array.isArray(value) ? value : [value]).map(id => id.trim()).filter(Boolean),
));

export const useNotificationReadActions = (): NotificationReadActions => {
  const [isUpdating, setIsUpdating] = useState(false);
  const markNotificationRead = useStore(state => state.markNotificationRead);
  const markNotificationUnread = useStore(state => state.markNotificationUnread);
  const markAllNotificationsRead = useStore(state => state.markAllNotificationsRead);

  const persistChange = useCallback(async (
    notificationIds: string[],
    isRead: boolean,
    markAll: boolean,
    change: () => void,
  ) => {
    if (!markAll && notificationIds.length === 0) return true;
    if (!notificationMutationLock.tryAcquire()) {
      useToastStore.getState().addToast('Another notification update is still saving.', 'warning');
      return false;
    }

    const current = useStore.getState();
    const affectedIds = markAll && current.currentUser
      ? getUnreadNotifications(current.currentUser, current.notifications).map(notification => notification.id)
      : notificationIds;
    const previousReadState = captureNotificationReadState(current.notifications, affectedIds);
    setIsUpdating(true);
    change();

    try {
      if (shouldUseSecureSupabase()) {
        const result = await setSecureNotificationsRead(notificationIds, isRead, markAll);
        if (result.ok === true) {
          const savedAt = new Date().toISOString();
          useStore.setState(state => ({
            notificationUnreadCount: Math.max(0, Number(result.data.unreadCount) || 0),
            backend: {
              ...state.backend,
              workspaceVersion: Math.max(state.backend.workspaceVersion || 0, result.workspaceVersion),
              remoteVersion: Math.max(state.backend.remoteVersion || 0, result.workspaceVersion),
              lastSavedAt: savedAt,
            },
          }));
          return true;
        }

        useStore.setState(state => ({
          notifications: restoreNotificationReadState(state.notifications, previousReadState),
        }));
        useToastStore.getState().addToast(
          result.code === 'OFFLINE'
            ? 'You are offline. The notification state was not changed.'
            : 'Unable to update notifications. The previous read state was restored.',
          'error',
        );
        return false;
      }

      const next = useStore.getState();
      useStore.setState({
        notificationUnreadCount: getUnreadNotifications(next.currentUser, next.notifications).length,
      });
      return true;
    } finally {
      notificationMutationLock.release();
      setIsUpdating(false);
    }
  }, []);

  return useMemo(() => ({
    markRead: (notificationIds: string | string[]) => {
      const ids = toIds(notificationIds);
      return persistChange(ids, true, false, () => ids.forEach(markNotificationRead));
    },
    markUnread: (notificationIds: string | string[]) => {
      const ids = toIds(notificationIds);
      return persistChange(ids, false, false, () => ids.forEach(markNotificationUnread));
    },
    markAllRead: () => persistChange([], true, true, markAllNotificationsRead),
    isUpdating,
  }), [isUpdating, markAllNotificationsRead, markNotificationRead, markNotificationUnread, persistChange]);
};
