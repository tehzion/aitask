import { describe, expect, it } from 'vitest';
import {
  legacyLinkToNotificationRoute,
  notificationRouteToPath,
  parseNotification,
  parseTask,
  parseWorkspaceSnapshot,
  safeHttpsUrl,
} from './security';

const taskFixture = {
  id: 'task-1',
  clientName: 'Acme',
  serviceType: 'Design',
  title: 'Campaign artwork',
  description: '<img src=x onerror=alert(1)>',
  department: 'Designer',
  assignedTo: 'staff-1',
  createdBy: 'admin-1',
  startDate: '2026-07-13',
  dueDate: '',
  priority: 'Medium',
  status: 'Pending',
  completionPercentage: 0,
  isCompleted: false,
  revisionCount: 0,
  clientApprovalStatus: 'Pending',
  isRecurring: false,
  recurrenceFrequency: 'None',
};

describe('safeHttpsUrl', () => {
  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'java%73cript:alert(1)',
    'https://user:password@example.com/file',
    'https://example.com\\@attacker.test',
    ' https://example.com/path with spaces ',
    '//example.com/path',
    'http://example.com/path',
  ])('rejects unsafe URL %s', (value) => {
    expect(safeHttpsUrl(value)).toBeNull();
  });

  it('normalizes a valid HTTPS URL', () => {
    expect(safeHttpsUrl('https://example.com/brief?id=1')).toBe('https://example.com/brief?id=1');
  });
});

describe('notification routes', () => {
  it('accepts only allowlisted internal legacy routes', () => {
    expect(legacyLinkToNotificationRoute('/tasks?taskId=T-1')).toEqual({ page: 'tasks', entityId: 'T-1' });
    expect(legacyLinkToNotificationRoute('/tasks?redirect=https://attacker.test')).toBeNull();
    expect(legacyLinkToNotificationRoute('//attacker.test/tasks')).toBeNull();
    expect(legacyLinkToNotificationRoute('javascript:alert(1)')).toBeNull();
  });

  it('encodes task identifiers when creating a destination', () => {
    expect(notificationRouteToPath({ page: 'tasks', entityId: 'T-1&admin=true' }))
      .toBe('/tasks?taskId=T-1%26admin%3Dtrue');
  });

  it('drops a notification with a compromised destination', () => {
    expect(parseNotification({
      id: 'notice-1',
      title: 'Unsafe',
      message: 'Do not open',
      link: 'javascript:alert(1)',
      isRead: false,
      createdAt: '2026-07-13T00:00:00.000Z',
      iconType: 'alert',
    })).toBeNull();
  });

  it('accepts only supported notification center metadata', () => {
    const parsed = parseNotification({
      id: 'notice-2',
      title: 'Assigned',
      message: 'A task was assigned.',
      route: { page: 'tasks', entityId: 'task-1' },
      isRead: false,
      readByUserIds: [],
      category: 'assignment',
      importance: 'action',
      createdAt: '2026-08-02T00:00:00.000Z',
      iconType: 'task',
    });
    expect(parsed).toMatchObject({ category: 'assignment', importance: 'action' });

    const unsupported = parseNotification({
      ...parsed,
      category: 'marketing',
      importance: 'urgent',
    });
    expect(unsupported?.category).toBeUndefined();
    expect(unsupported?.importance).toBeUndefined();
  });
});

describe('remote snapshot validation', () => {
  it('keeps text escaped as data and removes unsafe task links', () => {
    const parsed = parseTask({
      ...taskFixture,
      website: 'javascript:alert(1)',
      attachmentLink: 'data:text/html,<script>alert(1)</script>',
    });

    expect(parsed?.description).toBe(taskFixture.description);
    expect(parsed?.website).toBeUndefined();
    expect(parsed?.attachmentLink).toBeUndefined();
  });

  it('preserves server row versions and timestamps for conflict checks', () => {
    const parsed = parseTask({
      ...taskFixture,
      version: 7,
      updatedAt: '2026-07-15T01:02:03.000Z',
      comments: [{
        id: 'comment-1',
        userId: 'staff-1',
        text: 'Ready for review',
        createdAt: '2026-07-15T01:00:00.000Z',
        version: 3,
        updatedAt: '2026-07-15T01:01:00.000Z',
      }],
    });

    expect(parsed?.version).toBe(7);
    expect(parsed?.updatedAt).toBe('2026-07-15T01:02:03.000Z');
    expect(parsed?.comments?.[0].version).toBe(3);
  });

  it('accepts only valid ISO completion timestamps', () => {
    expect(parseTask({
      ...taskFixture,
      status: 'Completed',
      isCompleted: true,
      completedAt: '2026-07-31T03:00:00.000Z',
    })?.completedAt).toBe('2026-07-31T03:00:00.000Z');
    expect(parseTask({ ...taskFixture, completedAt: 'not-a-timestamp' })?.completedAt).toBeUndefined();
  });

  it('preserves legacy video departments without dropping users or tasks', () => {
    const parsed = parseWorkspaceSnapshot({
      users: [{
        id: 'video-editor-1',
        name: 'Video Editor',
        role: 'Staff',
        department: 'Editor',
      }],
      tasks: [{
        ...taskFixture,
        id: 'video-task-1',
        department: 'Videoshooting',
      }],
    });

    expect(parsed.users[0]?.department).toBe('Video Editor');
    expect(parsed.users[0]?.departments).toEqual(['Video Editor']);
    expect(parsed.tasks[0]?.department).toBe('Video Shooting');
  });

  it('accepts multiple equal departments and removes duplicate legacy aliases', () => {
    const parsed = parseWorkspaceSnapshot({
      users: [{
        id: 'multi-department-1',
        name: 'Multi Department',
        role: 'Staff',
        departments: ['Designer', 'Editor', 'Video Editor'],
        department: 'Operation',
      }],
    });

    expect(parsed.users[0]?.departments).toEqual(['Video Editor', 'Designer']);
  });

  it('accepts the new video positions as independent values', () => {
    expect(parseTask({ ...taskFixture, department: 'Video Editor' })?.department).toBe('Video Editor');
    expect(parseTask({ ...taskFixture, department: 'Video Shooting' })?.department).toBe('Video Shooting');
  });

  it('does not carry password or token fields into users', () => {
    const parsed = parseWorkspaceSnapshot({
      users: [{
        id: 'staff-1',
        name: 'Staff',
        role: 'Staff',
        department: 'Designer',
        password: 'not-allowed',
        api_token: 'not-allowed',
      }],
    });

    expect(parsed.users).toHaveLength(1);
    expect(parsed.users[0]).not.toHaveProperty('password');
    expect(parsed.users[0]).not.toHaveProperty('api_token');
  });
});
