import { AppNotification, User } from '../types';
import { isNotificationReadByUser, isNotificationVisible } from './access';
import { isActionNotification } from './notificationCenter';

interface IncomingNotificationResult {
  incomingIds: string[];
  seenIds: Set<string>;
}

export const seedSeenNotificationIds = (
  currentUser: User,
  notifications: AppNotification[],
) => new Set(
  notifications
    .filter(notification => isNotificationVisible(currentUser, notification))
    .map(notification => notification.id)
);

export const getIncomingUnreadNotificationIds = (
  currentUser: User,
  notifications: AppNotification[],
  seenNotificationIds: Set<string>,
): IncomingNotificationResult => {
  const nextSeenIds = new Set(seenNotificationIds);
  const incomingIds = notifications
    .filter(notification => !seenNotificationIds.has(notification.id))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .filter(notification => (
      isNotificationVisible(currentUser, notification) &&
      !isNotificationReadByUser(currentUser, notification) &&
      isActionNotification(notification)
    ))
    .map(notification => notification.id);

  notifications.forEach(notification => {
    if (isNotificationVisible(currentUser, notification)) nextSeenIds.add(notification.id);
  });
  return { incomingIds, seenIds: nextSeenIds };
};
