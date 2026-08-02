import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppNotification, User } from '../types';
import {
  classifyNotification,
  getNotificationDateSection,
  getNotificationImportance,
  groupNotifications,
  mergeNotificationPages,
} from './notificationCenter';

const staff: User = {
  id: 'staff-1',
  name: 'Staff',
  role: 'Staff',
  departments: ['Designer'],
};

const notification = (
  id: string,
  createdAt: string,
  overrides: Partial<AppNotification> = {},
): AppNotification => ({
  id,
  targetUserId: staff.id,
  title: 'Task Status Updated',
  message: 'A task changed.',
  route: { page: 'tasks', entityId: 'task-1' },
  isRead: false,
  readByUserIds: [],
  createdAt,
  iconType: 'status',
  ...overrides,
});

afterEach(() => vi.useRealTimers());

describe('notification center utilities', () => {
  it('classifies legacy notifications without rewriting them', () => {
    expect(classifyNotification(notification('assignment', '2026-08-02T10:00:00Z', {
      title: 'New Task Assigned',
    }))).toBe('assignment');
    expect(classifyNotification(notification('deadline', '2026-08-02T10:00:00Z', {
      title: 'Task Deadline Approaching',
    }))).toBe('deadline');
    expect(classifyNotification(notification('review', '2026-08-02T10:00:00Z', {
      title: 'Client Requested Revision',
    }))).toBe('review');
    expect(classifyNotification(notification('comment', '2026-08-02T10:00:00Z', {
      title: 'New Comment',
    }))).toBe('feedback');
  });

  it('limits interruption to action categories', () => {
    expect(getNotificationImportance(notification('action', '2026-08-02T10:00:00Z', {
      title: 'Task Ready for Approval',
    }))).toBe('action');
    expect(getNotificationImportance(notification('routine', '2026-08-02T10:00:00Z'))).toBe('informational');
    expect(getNotificationImportance(notification('registration', '2026-08-02T10:00:00Z', {
      title: 'New Registration',
      message: 'A Staff applicant is waiting for your approval.',
    }))).toBe('action');
    expect(getNotificationImportance(notification('member', '2026-08-02T10:00:00Z', {
      title: 'Member Added',
      message: 'A member was added to the workspace.',
    }))).toBe('informational');
  });

  it('groups adjacent updates for one task and category within 60 minutes', () => {
    const groups = groupNotifications([
      notification('new', '2026-08-02T10:00:00Z'),
      notification('near', '2026-08-02T09:15:00Z'),
      notification('old', '2026-08-02T07:00:00Z'),
    ], staff);
    expect(groups).toHaveLength(2);
    expect(groups[0].notifications.map(item => item.id)).toEqual(['new', 'near']);
    expect(groups[1].notifications.map(item => item.id)).toEqual(['old']);
  });

  it('keeps raw unread totals inside a visual group', () => {
    const groups = groupNotifications([
      notification('one', '2026-08-02T10:00:00Z'),
      notification('two', '2026-08-02T09:30:00Z', { readByUserIds: [staff.id] }),
    ], staff);
    expect(groups).toHaveLength(1);
    expect(groups[0].unreadCount).toBe(1);
  });

  it('uses local-day sections', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-02T12:00:00Z'));
    expect(getNotificationDateSection('2026-08-02T08:00:00Z')).toBe('Today');
    expect(getNotificationDateSection('2026-08-01T08:00:00Z')).toBe('Yesterday');
    expect(getNotificationDateSection('2026-07-20T08:00:00Z')).toBe('Earlier');
  });

  it('merges paginated and refreshed records without duplicates', () => {
    const current = [notification('one', '2026-08-02T10:00:00Z')];
    const replacement = notification('one', '2026-08-02T10:00:00Z', { message: 'Updated' });
    const older = notification('two', '2026-08-01T10:00:00Z');
    expect(mergeNotificationPages(current, [replacement, older])).toEqual([replacement, older]);
  });
});
