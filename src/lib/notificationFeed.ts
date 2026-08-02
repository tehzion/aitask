import type {
  AppNotification,
  NotificationFeedPage,
  User,
} from '../types';
import { isNotificationReadByUser, isNotificationVisible } from './access';
import {
  classifyNotification,
  enrichNotificationMetadata,
} from './notificationCenter';
import {
  loadSecureNotificationPage,
  type NotificationFeedQuery,
} from './secureWorkspace';
import { shouldUseSecureSupabase } from './supabaseClient';

const compareNewestFirst = (left: AppNotification, right: AppNotification) => (
  new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  || right.id.localeCompare(left.id)
);

const isBeforeCursor = (notification: AppNotification, query: NotificationFeedQuery) => {
  if (!query.cursor) return true;
  const notificationTime = new Date(notification.createdAt).getTime();
  const cursorTime = new Date(query.cursor.createdAt).getTime();
  return notificationTime < cursorTime
    || (notificationTime === cursorTime && notification.id.localeCompare(query.cursor.id) < 0);
};

export const loadNotificationFeedPage = async (
  currentUser: User,
  notifications: AppNotification[],
  query: NotificationFeedQuery = {},
): Promise<NotificationFeedPage> => {
  if (shouldUseSecureSupabase()) return loadSecureNotificationPage(query);

  const limit = Math.min(50, Math.max(1, Math.floor(query.limit || 50)));
  const search = query.search?.trim().toLocaleLowerCase() || '';
  const visible = notifications
    .filter(notification => isNotificationVisible(currentUser, notification))
    .map(enrichNotificationMetadata)
    .sort(compareNewestFirst);
  const filtered = visible.filter(notification => (
    isBeforeCursor(notification, query)
    && (!query.unreadOnly || !isNotificationReadByUser(currentUser, notification))
    && (!query.category || classifyNotification(notification) === query.category)
    && (!search || `${notification.title} ${notification.message}`.toLocaleLowerCase().includes(search))
  ));
  const items = filtered.slice(0, limit);
  const last = items.at(-1);

  return {
    items,
    unreadCount: visible.filter(notification => !isNotificationReadByUser(currentUser, notification)).length,
    nextCursor: filtered.length > limit && last
      ? { createdAt: last.createdAt, id: last.id }
      : undefined,
  };
};
