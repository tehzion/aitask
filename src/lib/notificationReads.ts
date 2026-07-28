import type { AppNotification } from '../types';

export interface NotificationReadState {
  id: string;
  isRead: boolean;
  readByUserIds?: string[];
}

export interface NotificationMutationBackend {
  status: string;
  isLoading: boolean;
  isSaving: boolean;
  isPulling: boolean;
  hasLocalChanges: boolean;
  pendingMutations: number;
}

export const createNotificationMutationLock = () => {
  let active = false;
  return {
    tryAcquire: () => {
      if (active) return false;
      active = true;
      return true;
    },
    release: () => {
      active = false;
    },
  };
};

export const isNotificationMutationBlocked = (backend: NotificationMutationBackend) => (
  backend.isLoading
  || backend.isSaving
  || backend.isPulling
  || backend.hasLocalChanges
  || backend.pendingMutations > 0
  || ['loading', 'offline', 'conflict', 'retry_required'].includes(backend.status)
);

export const captureNotificationReadState = (
  notifications: AppNotification[],
  notificationIds: Iterable<string>,
): NotificationReadState[] => {
  const ids = new Set(notificationIds);
  return notifications
    .filter(notification => ids.has(notification.id))
    .map(notification => ({
      id: notification.id,
      isRead: notification.isRead,
      readByUserIds: notification.readByUserIds
        ? [...notification.readByUserIds]
        : undefined,
    }));
};

export const restoreNotificationReadState = (
  notifications: AppNotification[],
  snapshots: NotificationReadState[],
): AppNotification[] => {
  const snapshotById = new Map(snapshots.map(snapshot => [snapshot.id, snapshot]));
  return notifications.map(notification => {
    const snapshot = snapshotById.get(notification.id);
    if (!snapshot) return notification;
    return {
      ...notification,
      isRead: snapshot.isRead,
      readByUserIds: snapshot.readByUserIds
        ? [...snapshot.readByUserIds]
        : undefined,
    };
  });
};
