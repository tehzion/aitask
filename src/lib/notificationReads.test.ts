import { describe, expect, it } from 'vitest';
import type { AppNotification } from '../types';
import {
  captureNotificationReadState,
  createNotificationMutationLock,
  isNotificationMutationBlocked,
  restoreNotificationReadState,
} from './notificationReads';

const notification = (id: string, isRead = false): AppNotification => ({
  id,
  title: `Notice ${id}`,
  message: 'A task changed.',
  route: { page: 'tasks' },
  isRead,
  readByUserIds: isRead ? ['staff-1'] : [],
  createdAt: '2026-07-28T00:00:00.000Z',
  iconType: 'task',
});

describe('notification read persistence safety', () => {
  it('blocks reads while another workspace mutation needs attention', () => {
    expect(isNotificationMutationBlocked({
      status: 'retry_required',
      isLoading: false,
      isSaving: false,
      isPulling: false,
      hasLocalChanges: true,
      pendingMutations: 1,
    })).toBe(true);
  });

  it('allows reads only when synchronization is idle', () => {
    expect(isNotificationMutationBlocked({
      status: 'live',
      isLoading: false,
      isSaving: false,
      isPulling: false,
      hasLocalChanges: false,
      pendingMutations: 0,
    })).toBe(false);
  });

  it('serializes rapid notification read attempts', () => {
    const lock = createNotificationMutationLock();
    expect(lock.tryAcquire()).toBe(true);
    expect(lock.tryAcquire()).toBe(false);
    lock.release();
    expect(lock.tryAcquire()).toBe(true);
  });

  it('restores only affected read fields and preserves newly arrived notifications', () => {
    const original = [notification('one'), notification('two')];
    const snapshot = captureNotificationReadState(original, ['one']);
    const afterFailure = restoreNotificationReadState([
      notification('new'),
      { ...notification('one', true), message: 'Updated content' },
      notification('two', true),
    ], snapshot);

    expect(afterFailure.map(item => item.id)).toEqual(['new', 'one', 'two']);
    expect(afterFailure[1]).toMatchObject({
      id: 'one',
      message: 'Updated content',
      isRead: false,
      readByUserIds: [],
    });
    expect(afterFailure[2].isRead).toBe(true);
  });
});
