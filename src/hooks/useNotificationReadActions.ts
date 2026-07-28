import { useCallback, useMemo, useRef, useState } from 'react';
import { getUnreadNotifications } from '../lib/access';
import {
  captureNotificationReadState,
  createNotificationMutationLock,
  isNotificationMutationBlocked,
  restoreNotificationReadState,
} from '../lib/notificationReads';
import type { SecureCommandType } from '../lib/secureWorkspace';
import { useStore } from '../store';
import { useToastStore } from '../store/useToastStore';

export interface NotificationReadActions {
  markRead: (notificationId: string) => Promise<boolean>;
  markAllRead: () => Promise<boolean>;
  isUpdating: boolean;
}

export const useNotificationReadActions = (): NotificationReadActions => {
  const [isUpdating, setIsUpdating] = useState(false);
  const mutationLock = useRef(createNotificationMutationLock());
  const markNotificationRead = useStore(state => state.markNotificationRead);
  const markAllNotificationsRead = useStore(state => state.markAllNotificationsRead);

  const persistChange = useCallback(async (
    notificationIds: string[],
    commandType: SecureCommandType,
    change: () => void,
  ) => {
    if (notificationIds.length === 0) return true;
    if (!mutationLock.current.tryAcquire()) {
      useToastStore.getState().addToast('Another notification update is still saving.', 'warning');
      return false;
    }

    const current = useStore.getState();
    if (isNotificationMutationBlocked(current.backend)) {
      mutationLock.current.release();
      useToastStore.getState().addToast(
        'Resolve the current workspace sync change before updating notifications.',
        'warning',
      );
      return false;
    }

    const previousReadState = captureNotificationReadState(current.notifications, notificationIds);
    setIsUpdating(true);
    change();

    try {
      const result = await useStore.getState().commitPendingMutation(commandType);
      if (result.ok) return true;

      useStore.setState(state => ({
        notifications: restoreNotificationReadState(state.notifications, previousReadState),
      }));
      useToastStore.getState().addToast(
        'Unable to update the notification. It remains unread; the sync issue is still available to retry.',
        'error',
      );
      return false;
    } finally {
      mutationLock.current.release();
      setIsUpdating(false);
    }
  }, []);

  return useMemo(() => ({
    markRead: (notificationId: string) => persistChange(
      [notificationId],
      'notification.read',
      () => markNotificationRead(notificationId),
    ),
    markAllRead: () => {
      const state = useStore.getState();
      const notificationIds = state.currentUser
        ? getUnreadNotifications(state.currentUser, state.notifications).map(notification => notification.id)
        : [];
      return persistChange(notificationIds, 'notification.read_all', markAllNotificationsRead);
    },
    isUpdating,
  }), [isUpdating, markAllNotificationsRead, markNotificationRead, persistChange]);
};
