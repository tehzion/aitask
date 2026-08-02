import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isNotificationReadByUser } from '../lib/access';
import type { AppNotification, User } from '../types';
import { useStore } from './index';

const initialState = useStore.getState();

const firstStaff: User = {
  id: 'notification-staff-1',
  name: 'First Staff',
  role: 'Staff',
  departments: ['Designer'],
};

const secondStaff: User = {
  id: 'notification-staff-2',
  name: 'Second Staff',
  role: 'Staff',
  departments: ['Designer'],
};

const legacyReadNotification: AppNotification = {
  id: 'legacy-read-notification',
  targetRole: 'Staff',
  title: 'Legacy update',
  message: 'This notification predates per-user receipts.',
  route: { page: 'tasks' },
  isRead: true,
  createdAt: '2026-08-02T00:00:00.000Z',
  iconType: 'status',
};

describe('notification receipt store compatibility', () => {
  beforeEach(() => {
    useStore.setState({
      ...initialState,
      currentUser: firstStaff,
      users: [firstStaff, secondStaff],
      notifications: [legacyReadNotification],
      notificationUnreadCount: 0,
    }, true);
  });

  afterEach(() => {
    useStore.setState(initialState, true);
  });

  it('marks only the current user unread when converting a legacy role notification', () => {
    useStore.getState().markNotificationUnread(legacyReadNotification.id);
    const notification = useStore.getState().notifications[0];

    expect(notification.readByUserIds).toEqual([secondStaff.id]);
    expect(isNotificationReadByUser(firstStaff, notification)).toBe(false);
    expect(isNotificationReadByUser(secondStaff, notification)).toBe(true);
  });
});
