import { describe, expect, it } from 'vitest';
import { AppNotification, User } from '../types';
import { getIncomingUnreadNotificationIds, seedSeenNotificationIds } from './notificationPopups';

const staff: User = {
  id: 'staff-1',
  name: 'Staff',
  role: 'Staff',
  departments: ['Designer'],
  department: 'Designer',
};

const notification = (
  id: string,
  overrides: Partial<AppNotification> = {},
): AppNotification => ({
  id,
  targetUserId: staff.id,
  title: `Notice ${id}`,
  message: 'A task changed.',
  route: { page: 'tasks', entityId: 'task-1' },
  isRead: false,
  readByUserIds: [],
  createdAt: `2026-07-28T10:00:0${id.slice(-1)}.000Z`,
  iconType: 'task',
  category: 'assignment',
  importance: 'action',
  ...overrides,
});

describe('notification popup detection', () => {
  it('seeds existing notifications so login does not show a backlog', () => {
    const existing = [notification('notice-1'), notification('notice-2')];
    const seenIds = seedSeenNotificationIds(existing);

    expect(getIncomingUnreadNotificationIds(staff, existing, seenIds).incomingIds).toEqual([]);
  });

  it('returns only new visible unread notifications and never repeats them', () => {
    const existing = notification('notice-1');
    const visible = notification('notice-2');
    const otherUser = notification('notice-3', { targetUserId: 'staff-2' });
    const alreadyRead = notification('notice-4', { readByUserIds: [staff.id] });
    const first = getIncomingUnreadNotificationIds(
      staff,
      [visible, otherUser, alreadyRead, existing],
      seedSeenNotificationIds([existing]),
    );

    expect(first.incomingIds).toEqual([visible.id]);
    expect(
      getIncomingUnreadNotificationIds(
        staff,
        [visible, otherUser, alreadyRead, existing],
        first.seenIds,
      ).incomingIds,
    ).toEqual([]);
  });

  it('orders a batch newest first while recording every received ID', () => {
    const older = notification('notice-5', { createdAt: '2026-07-28T10:00:00.000Z' });
    const newer = notification('notice-6', { createdAt: '2026-07-28T11:00:00.000Z' });
    const result = getIncomingUnreadNotificationIds(staff, [older, newer], new Set());

    expect(result.incomingIds).toEqual([newer.id, older.id]);
    expect(Array.from(result.seenIds).sort()).toEqual([older.id, newer.id]);
  });

  it('keeps routine status updates in the center without showing a popup', () => {
    const routine = notification('notice-7', {
      title: 'Task Status Updated',
      category: 'status',
      importance: 'informational',
    });
    expect(getIncomingUnreadNotificationIds(staff, [routine], new Set()).incomingIds).toEqual([]);
  });
});
