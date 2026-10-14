import { describe, expect, it } from 'vitest';
import type { AppNotification } from '../types';
import { presentNotification, notificationCategoryLabel } from './notificationPresentation';
import { getNotificationImportance } from './notificationCenter';
const notification = (title: string, message: string): AppNotification => ({ id: 'notice', title, message, route: { page: 'tasks', entityId: 'task' }, targetUserId: 'hod', createdAt: '2026-10-14T00:00:00Z', isRead: false, iconType: 'alert' });
describe('system notification presentation', () => {
  it('translates system text and statuses without changing user names or quoted task titles', () => {
    const notice = notification('Task Status Updated', '"Pending \\"launch\\"" was moved to In Progress by Designer.');
    const translated = presentNotification(notice, 'zh');
    expect(translated.message).toContain('Pending \\"launch\\"');
    expect(translated.message).toContain('Designer');
    expect(translated.message).toContain('进行中');
    expect(presentNotification(notice, 'en').message).toBe(notice.message);
  });
  it('preserves unknown and freeform messages even when they contain status words', () => {
    const notice = notification('Private note', 'Please keep In Progress and Designer exactly as written.');
    expect(presentNotification(notice, 'zh')).toMatchObject({ title: notice.title, message: notice.message });
    expect(presentNotification(notification('New Comment', notice.message), 'zh').message).toBe(notice.message);
  });
  it('uses actionable help and calm acceptance/clearance feedback', () => {
    const help = notification('Task Status Updated', '"Artwork": help requested by Alex.');
    expect(getNotificationImportance({ ...help, category: 'status', importance: 'informational' })).toBe('action');
    expect(presentNotification(help, 'zh')).toMatchObject({ iconType: 'alert', categoryLabel: '反馈' });
    expect(presentNotification(notification('Task Status Updated', '"Artwork": assignment accepted by Alex.'), 'zh').iconType).toBe('success');
    expect(presentNotification(notification('Task Status Updated', '"Artwork": blocker cleared by Alex.'), 'en').iconType).toBe('success');
  });
  it('keeps notification terminology separate from appearance/account terminology', () => {
    expect(notificationCategoryLabel('system', 'zh')).toBe('系统');
    expect(notificationCategoryLabel('account', 'zh')).toBe('账号');
  });
});
