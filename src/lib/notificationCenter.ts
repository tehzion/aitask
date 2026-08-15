import { isToday, isYesterday } from 'date-fns';
import type {
  AppNotification,
  NotificationCategory,
  NotificationImportance,
  User,
} from '../types';
import { isNotificationReadByUser } from './access';

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  'assignment',
  'deadline',
  'review',
  'feedback',
  'account',
  'status',
  'system',
];

export const notificationCategoryLabels: Record<NotificationCategory, string> = {
  assignment: 'Assignments',
  deadline: 'Deadlines',
  review: 'Reviews',
  feedback: 'Feedback',
  account: 'Accounts',
  status: 'Status updates',
  system: 'System',
};

const actionCategories = new Set<NotificationCategory>([
  'assignment',
  'deadline',
  'review',
  'feedback',
]);

export const classifyNotification = (
  notification: Pick<AppNotification, 'category' | 'title' | 'message' | 'route'>,
): NotificationCategory => {
  if (notification.category && NOTIFICATION_CATEGORIES.includes(notification.category)) {
    return notification.category;
  }

  const content = `${notification.title} ${notification.message}`.toLowerCase();
  if (/assign(?:ed|ment)?/.test(content)) return 'assignment';
  if (/deadline|due soon|due date|overdue/.test(content)) return 'deadline';
  if (/approval|approved|revision|requested changes|ready for (?:approval|review)/.test(content)) return 'review';
  if (/comment|feedback|replied|reply/.test(content)) return 'feedback';
  if (/registration|member|account|password|invite/.test(content)) return 'account';
  if (/status|completed|task created|created by staff/.test(content)) return 'status';
  return notification.route.page === 'settings' ? 'account' : 'system';
};

export const getNotificationImportance = (
  notification: Pick<AppNotification, 'importance' | 'category' | 'title' | 'message' | 'route'>,
): NotificationImportance => {
  if (notification.importance === 'action' || notification.importance === 'informational') {
    return notification.importance;
  }
  const category = classifyNotification(notification);
  if (actionCategories.has(category)) return 'action';
  if (category === 'account') {
    const content = `${notification.title} ${notification.message}`.toLowerCase();
    return /new registration|registered.+waiting|staff.+(?:approval|approve)/.test(content)
      ? 'action'
      : 'informational';
  }
  return 'informational';
};

export const enrichNotificationMetadata = <T extends AppNotification>(notification: T): T => ({
  ...notification,
  category: classifyNotification(notification),
  importance: getNotificationImportance(notification),
});

export const isActionNotification = (notification: AppNotification) => (
  getNotificationImportance(notification) === 'action'
);

export interface NotificationGroup {
  id: string;
  category: NotificationCategory;
  importance: NotificationImportance;
  notifications: AppNotification[];
  latest: AppNotification;
  unreadCount: number;
}

const GROUP_WINDOW_MS = 60 * 60 * 1000;

const notificationGroupKey = (notification: AppNotification) => (
  `${notification.route.page}:${notification.route.entityId || notification.id}:${classifyNotification(notification)}`
);

export const groupNotifications = (
  notifications: AppNotification[],
  currentUser: User | null | undefined,
): NotificationGroup[] => {
  const sorted = [...notifications].sort((left, right) => (
    new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    || right.id.localeCompare(left.id)
  ));
  const groups: NotificationGroup[] = [];

  sorted.forEach(notification => {
    const enriched = enrichNotificationMetadata(notification);
    const enrichedKey = notificationGroupKey(enriched);
    let matchingGroup: NotificationGroup | undefined;
    for (let index = groups.length - 1; index >= 0; index -= 1) {
      const candidate = groups[index];
      const elapsed = new Date(candidate.notifications.at(-1)?.createdAt || 0).getTime() - new Date(enriched.createdAt).getTime();
      if (elapsed < 0 || elapsed > GROUP_WINDOW_MS) break;
      if (notificationGroupKey(candidate.latest) === enrichedKey) {
        matchingGroup = candidate;
        break;
      }
    }

    if (matchingGroup) {
      matchingGroup.notifications.push(enriched);
      if (!isNotificationReadByUser(currentUser, enriched)) matchingGroup.unreadCount += 1;
      return;
    }

    groups.push({
      id: `${enrichedKey}:${enriched.id}`,
      category: enriched.category!,
      importance: enriched.importance!,
      notifications: [enriched],
      latest: enriched,
      unreadCount: isNotificationReadByUser(currentUser, enriched) ? 0 : 1,
    });
  });

  return groups;
};

export type NotificationDateSection = 'Today' | 'Yesterday' | 'Earlier';

export const getNotificationDateSection = (createdAt: string): NotificationDateSection => {
  const date = new Date(createdAt);
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return 'Earlier';
};

export const sectionNotificationGroups = (groups: NotificationGroup[]) => {
  const sections: Record<NotificationDateSection, NotificationGroup[]> = {
    Today: [],
    Yesterday: [],
    Earlier: [],
  };
  groups.forEach(group => sections[getNotificationDateSection(group.latest.createdAt)].push(group));
  return sections;
};

export const mergeNotificationPages = (
  current: AppNotification[],
  incoming: AppNotification[],
) => {
  const byId = new Map(current.map(notification => [notification.id, notification]));
  incoming.forEach(notification => byId.set(notification.id, notification));
  return [...byId.values()].sort((left, right) => (
    new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    || right.id.localeCompare(left.id)
  ));
};
