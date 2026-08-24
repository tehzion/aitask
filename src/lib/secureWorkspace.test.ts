import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersistedWorkspaceState } from './supabaseSnapshot';

const { rpc, refreshSession, from } = vi.hoisted(() => ({
  rpc: vi.fn(),
  refreshSession: vi.fn(),
  from: vi.fn(),
}));

vi.mock('./supabaseClient', () => ({
  supabase: { rpc, from, auth: { refreshSession } },
}));

import {
  BACKEND_UPGRADE_REQUIRED_MESSAGE,
  buildOperations,
  acknowledgeSecureReleaseNotice,
  discardSecureWorkspaceCommand,
  getSecureReleaseNoticeAcknowledgement,
  inferSecureCommandType,
  isSecureCommandType,
  isWorkspaceConflict,
  loadSecureBackendCapabilities,
  loadSecureNotificationPage,
  loadSecureWorkspace,
  overlayRetainedWorkspaceEntities,
  rebaseRetryableCommand,
  restoreSecureWorkspaceCommand,
  retrySecureWorkspaceCommand,
  saveSecureMemberDepartments,
  saveSecureWorkspace,
  serializeClientProjectedTask,
  setSecureNotificationsRead,
  type WorkspaceOperation,
} from './secureWorkspace';

afterEach(() => {
  discardSecureWorkspaceCommand();
  vi.unstubAllGlobals();
});

describe('Client portal command projection', () => {
  it('serializes only allowlisted client-visible task fields', () => {
    const projected = serializeClientProjectedTask({
      id: 'client-task',
      version: 4,
      clientName: 'Acme',
      projectId: 'project-1',
      serviceType: 'Design',
      title: 'Client artwork',
      description: 'Visible brief',
      department: 'Client',
      assignedTo: 'staff-1',
      createdBy: 'internal-admin',
      startDate: '2026-08-01',
      dueDate: '2026-08-08',
      priority: 'Urgent',
      status: 'Waiting Approval',
      completionPercentage: 100,
      notes: 'Private agency note',
      isCompleted: true,
      revisionCount: 1,
      clientApprovalStatus: 'Pending',
      isRecurring: true,
      recurrenceFrequency: 'Weekly',
      dueReminderSent: true,
      clientProjection: true,
      updatedAt: '2026-08-01T10:00:00.000Z',
    });

    expect(projected).toMatchObject({
      id: 'client-task',
      title: 'Client artwork',
      status: 'Waiting Approval',
      clientApprovalStatus: 'Pending',
    });
    expect(Object.keys(projected)).not.toEqual(expect.arrayContaining([
      'notes', 'priority', 'department', 'createdBy', 'isRecurring',
      'recurrenceFrequency', 'dueReminderSent', 'version', 'updatedAt',
    ]));
  });
});

const operation = (
  entityType: string,
  action: WorkspaceOperation['action'] = 'update',
): WorkspaceOperation => ({
  kind: entityType === 'member' ? 'member' : 'entity',
  action,
  entityType,
  entityId: `${entityType}-1`,
  expectedVersion: action === 'insert' ? 0 : 2,
  data: action === 'delete' ? undefined : { id: `${entityType}-1` },
});

describe('inferSecureCommandType', () => {
  beforeEach(() => {
    rpc.mockReset();
    refreshSession.mockReset();
    from.mockReset();
  });

  it('labels focused task commands', () => {
    expect(inferSecureCommandType([operation('task', 'insert')])).toBe('task.create');
    expect(inferSecureCommandType([operation('task')])).toBe('task.update');
    expect(inferSecureCommandType([operation('task', 'delete')])).toBe('task.delete');
  });

  it('labels notification and administration commands', () => {
    expect(inferSecureCommandType([operation('notification')])).toBe('notification.read');
    expect(inferSecureCommandType([operation('notification'), { ...operation('notification'), entityId: 'notification-2' }])).toBe('notification.read_all');
    expect(inferSecureCommandType([operation('member')])).toBe('member.update');
    expect(inferSecureCommandType([operation('custom_role')])).toBe('role.manage');
  });

  it('uses a transactional workspace patch for cross-entity changes', () => {
    expect(inferSecureCommandType([operation('project', 'delete'), operation('task')])).toBe('workspace.patch');
  });

  it('rejects command names that the Supabase RPC does not support', () => {
    expect(isSecureCommandType('task.update')).toBe(true);
    expect(isSecureCommandType('task_date_range')).toBe(false);
  });
});

const stateWithUser = (id: string): PersistedWorkspaceState => ({
  users: [{
    id,
    authUserId: `00000000-0000-4000-8000-${id.padStart(12, '0').slice(-12)}`,
    workspaceId: 'aitask-main',
    name: `User ${id}`,
    email: `${id}@example.com`,
    role: 'Staff',
    departments: ['Designer'],
    department: 'Designer',
  }],
  clients: [],
  projects: [],
  tasks: [],
  notifications: [],
  registrations: [],
  rolePermissions: [],
  taskStatuses: [],
});

describe('buildOperations', () => {
  beforeEach(() => {
    rpc.mockReset();
    refreshSession.mockReset();
    from.mockReset();
  });

  it('strips client-side unread tombstones from notification diffs', () => {
    const notification = {
      id: 'notice-1',
      title: 'Notice',
      message: 'A task changed.',
      route: { page: 'tasks' as const, entityId: 'task-1' },
      isRead: false,
      readByUserIds: ['member-1'],
      unreadByUserIds: ['member-2'],
      createdAt: '2026-08-16T00:00:00.000Z',
      iconType: 'status' as const,
    };
    const state: PersistedWorkspaceState = {
      ...stateWithUser('member-1'),
      notifications: [notification],
    };
    const operations = buildOperations(state);
    const notificationOp = operations.find(operation => (
      operation.entityType === 'notification' && operation.entityId === 'notice-1'
    ));
    expect(notificationOp).toBeDefined();
    expect(notificationOp?.data).not.toHaveProperty('unreadByUserIds');
    expect(notificationOp?.data).not.toHaveProperty('visibleToCurrentUser');
    expect(notificationOp?.data).toHaveProperty('readByUserIds');
  });
});

describe('secure command retry identity', () => {
  beforeEach(() => {
    rpc.mockReset();
    refreshSession.mockReset();
    from.mockReset();
  });

  it('does not send an unsupported command to Supabase at runtime', async () => {
    const result = await saveSecureWorkspace(stateWithUser('invalid'), 'task_date_range' as never);

    expect(result).toMatchObject({ ok: false, code: 'VALIDATION' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('sends versioned multi-department updates through the dedicated RPC', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        ok: true,
        commandId: '00000000-0000-4000-8000-000000000120',
        workspaceVersion: 12,
        member: {
          id: '12',
          departments: ['Video Editor', 'Designer'],
          department: 'Video Editor',
          version: 2,
          updated_at: '2026-07-29T00:00:00Z',
        },
      },
      error: null,
    });
    const member = stateWithUser('12').users[0];
    const result = await saveSecureMemberDepartments(member, ['Designer', 'Video Editor']);

    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith('aitask_update_member_departments', expect.objectContaining({
      p_member_id: '12',
      p_departments: ['Video Editor', 'Designer'],
      p_expected_version: 1,
    }));
  });

  it('refreshes an expired session once and keeps the command ID', async () => {
    rpc
      .mockResolvedValueOnce({ data: null, error: { code: 'PGRST301', message: 'JWT expired' } })
      .mockResolvedValueOnce({
        data: { ok: true, workspaceVersion: 2, changed: [{ entityType: 'member', entityId: '3', version: 1, updatedAt: '2026-07-15T00:00:00Z' }] },
        error: null,
      });
    refreshSession.mockResolvedValueOnce({ data: { session: { access_token: 'refreshed' } }, error: null });

    const result = await saveSecureWorkspace(stateWithUser('3'));

    expect(result.ok).toBe(true);
    expect(refreshSession).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[1][1].p_command_id).toBe(rpc.mock.calls[0][1].p_command_id);
  });

  it('retains a command after a thrown network error', async () => {
    rpc
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValueOnce({
        data: { ok: true, workspaceVersion: 2, changed: [{ entityType: 'member', entityId: '4', version: 1, updatedAt: '2026-07-15T00:00:00Z' }] },
        error: null,
      });

    const first = await saveSecureWorkspace(stateWithUser('4'));
    expect(first).toMatchObject({ ok: false, code: 'RETRY_REQUIRED' });
    const firstCommandId = rpc.mock.calls[0][1].p_command_id;

    const retry = await retrySecureWorkspaceCommand();
    expect(retry.ok).toBe(true);
    expect(rpc.mock.calls[1][1].p_command_id).toBe(firstCommandId);
  });

  it('keeps one retry command in account-scoped session storage', async () => {
    const values = new Map<string, string>();
    const sessionStorage: Storage = {
      get length() { return values.size; },
      clear: () => values.clear(),
      getItem: key => values.get(key) ?? null,
      key: index => [...values.keys()][index] ?? null,
      removeItem: key => { values.delete(key); },
      setItem: (key, value) => { values.set(key, value); },
    };
    vi.stubGlobal('window', { sessionStorage });
    restoreSecureWorkspaceCommand('auth-user-9');
    rpc.mockRejectedValueOnce(new Error('fetch failed'));

    const result = await saveSecureWorkspace(stateWithUser('9'));

    expect(result).toMatchObject({ ok: false, code: 'RETRY_REQUIRED' });
    expect(sessionStorage.length).toBe(1);
    expect(restoreSecureWorkspaceCommand('auth-user-9')).not.toBeNull();
    discardSecureWorkspaceCommand();
    expect(sessionStorage.length).toBe(0);
  });

  it('clears a retained command when the authenticated account changes', async () => {
    const values = new Map<string, string>();
    const sessionStorage: Storage = {
      get length() { return values.size; },
      clear: () => values.clear(),
      getItem: key => values.get(key) ?? null,
      key: index => [...values.keys()][index] ?? null,
      removeItem: key => { values.delete(key); },
      setItem: (key, value) => { values.set(key, value); },
    };
    vi.stubGlobal('window', { sessionStorage });
    restoreSecureWorkspaceCommand('auth-user-a');
    rpc.mockRejectedValueOnce(new Error('fetch failed'));
    await saveSecureWorkspace(stateWithUser('10'));

    expect(sessionStorage.length).toBe(1);
    expect(restoreSecureWorkspaceCommand('auth-user-b')).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });

  it('translates a missing command signature without exposing PostgREST internals', async () => {
    restoreSecureWorkspaceCommand('auth-user-11');
    rpc.mockResolvedValueOnce({
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function public.aitask_execute_command in the schema cache.' },
    });

    const result = await saveSecureWorkspace(stateWithUser('11'));

    expect(result).toMatchObject({
      ok: false,
      code: 'RETRY_REQUIRED',
      error: BACKEND_UPGRADE_REQUIRED_MESSAGE,
    });
    expect(JSON.stringify(result)).not.toContain('schema cache');
  });

  it('reuses the command ID after an uncertain request', async () => {
    rpc
      .mockResolvedValueOnce({ data: null, error: { message: 'Network response was interrupted.' } })
      .mockResolvedValueOnce({
        data: { ok: true, workspaceVersion: 2, changed: [{ entityType: 'member', entityId: '1', version: 1, updatedAt: '2026-07-15T00:00:00Z' }] },
        error: null,
      });

    const first = await saveSecureWorkspace(stateWithUser('1'));
    expect(first.ok).toBe(false);
    const firstCommandId = rpc.mock.calls[0][1].p_command_id;

    const retry = await retrySecureWorkspaceCommand();
    expect(retry.ok).toBe(true);
    expect(rpc.mock.calls[1][1].p_command_id).toBe(firstCommandId);
  });

  it('uses a new command ID and reviewed version after a conflict', async () => {
    const conflict = {
      entityType: 'member',
      entityId: '2',
      expectedVersion: 0,
      actualVersion: 4,
      current: { name: 'Latest name' },
    };
    rpc
      .mockResolvedValueOnce({ data: { ok: false, code: 'CONFLICT', error: 'Conflict', conflict }, error: null })
      .mockResolvedValueOnce({
        data: { ok: true, workspaceVersion: 3, changed: [{ entityType: 'member', entityId: '2', version: 5, updatedAt: '2026-07-15T00:00:01Z' }] },
        error: null,
      });

    const first = await saveSecureWorkspace(stateWithUser('2'));
    expect(first.ok).toBe(false);
    const firstCommandId = rpc.mock.calls[0][1].p_command_id;
    expect(rebaseRetryableCommand(conflict)).toBe(true);

    const retry = await retrySecureWorkspaceCommand();
    expect(retry.ok).toBe(true);
    expect(rpc.mock.calls[1][1].p_command_id).not.toBe(firstCommandId);
    expect(rpc.mock.calls[1][1].p_operations[0].expectedVersion).toBe(4);
  });
});

describe('secure backend compatibility', () => {
  beforeEach(() => {
    rpc.mockReset();
    refreshSession.mockReset();
    from.mockReset();
  });

  it('enables writes only after the complete capability contract is confirmed', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        ok: true,
        schemaVersion: 2,
        workspaceOptimisticLock: true,
        serviceOperations: true,
        releaseNoticeAcknowledgements: true,
      },
      error: null,
    });

    const result = await loadSecureBackendCapabilities();

    expect(result).toMatchObject({ compatible: true, capabilities: { schemaVersion: 2 } });
    expect(rpc).toHaveBeenCalledWith('aitask_get_backend_capabilities', { p_workspace_id: 'aitask-main' });
  });

  it('turns a missing PostgREST function into a read-only upgrade state', async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function in the schema cache.' },
    });

    const result = await loadSecureBackendCapabilities();

    expect(result).toEqual({
      compatible: false,
      code: 'PGRST202',
      error: BACKEND_UPGRADE_REQUIRED_MESSAGE,
    });
    expect(JSON.stringify(result)).not.toContain('schema cache');
  });
});

describe('workspace optimistic lock', () => {
  beforeEach(() => {
    rpc.mockReset();
    refreshSession.mockReset();
    from.mockReset();
  });

  it('sends the expected workspace version with save commands', async () => {
    rpc.mockResolvedValueOnce({
      data: { ok: true, workspaceVersion: 9, changed: [{ entityType: 'member', entityId: '5', version: 3, updatedAt: '2026-08-16T00:00:00Z' }] },
      error: null,
    });

    const result = await saveSecureWorkspace(stateWithUser('5'), undefined, 8);

    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith('aitask_execute_command', expect.objectContaining({
      p_expected_workspace_version: 8,
    }));
  });

  it('omits the workspace precondition when no version is known', async () => {
    rpc.mockResolvedValueOnce({
      data: { ok: true, workspaceVersion: 2, changed: [{ entityType: 'member', entityId: '6', version: 1, updatedAt: '2026-08-16T00:00:00Z' }] },
      error: null,
    });

    await saveSecureWorkspace(stateWithUser('6'));

    expect(rpc).toHaveBeenCalledWith('aitask_execute_command', expect.objectContaining({
      p_expected_workspace_version: null,
    }));
  });

  it('surfaces a workspace-scoped conflict from the server', async () => {
    const conflict = {
      entityType: 'workspace',
      entityId: 'aitask-main',
      expectedVersion: 8,
      actualVersion: 9,
      current: { workspaceVersion: 9, updatedAt: '2026-08-16T00:00:00Z' },
    };
    rpc.mockResolvedValueOnce({
      data: { ok: false, code: 'CONFLICT', error: 'The workspace changed since your last sync. Review the latest data before retrying.', conflict },
      error: null,
    });

    const result = await saveSecureWorkspace(stateWithUser('7'), undefined, 8);

    expect(result).toMatchObject({ ok: false, code: 'CONFLICT' });
    if (result.ok === false) {
      expect(isWorkspaceConflict(result.conflict)).toBe(true);
      expect(result.conflict).toMatchObject({ entityType: 'workspace', expectedVersion: 8, actualVersion: 9 });
    }
    expect(isWorkspaceConflict(undefined)).toBe(false);
    expect(isWorkspaceConflict({ entityType: 'task', entityId: 't-1', expectedVersion: 1, actualVersion: 2 })).toBe(false);
  });

  it('sends the expected workspace version when retrying a retained command', async () => {
    rpc
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValueOnce({
        data: { ok: true, workspaceVersion: 3, changed: [{ entityType: 'member', entityId: '8', version: 1, updatedAt: '2026-08-16T00:00:00Z' }] },
        error: null,
      });

    await saveSecureWorkspace(stateWithUser('8'), undefined, 2);
    const retry = await retrySecureWorkspaceCommand(2);

    expect(retry.ok).toBe(true);
    expect(rpc.mock.calls[1][1].p_expected_workspace_version).toBe(2);
  });
});

describe('overlayRetainedWorkspaceEntities', () => {
  const task = (id: string, title: string) => ({ id, title });
  const member = (id: string, name: string) => ({ id, name });

  const remote = (): PersistedWorkspaceState => ({
    ...stateWithUser('member-1'),
    users: [member('member-1', 'Remote me'), member('member-2', 'Teammate')] as unknown as PersistedWorkspaceState['users'],
    clients: [{ id: 'client-1', clientName: 'Acme' }] as unknown as NonNullable<PersistedWorkspaceState['clients']>,
    projects: [],
    tasks: [task('task-1', 'Remote title'), task('task-2', 'Untouched'), task('task-3', 'Delete me')] as unknown as PersistedWorkspaceState['tasks'],
    notifications: [],
    registrations: [],
    rolePermissions: [],
    taskStatuses: ['Pending', 'Cancelled'],
  });

  const local = (): PersistedWorkspaceState => ({
    ...remote(),
    users: [member('member-1', 'Local edit'), member('member-2', 'Teammate')] as unknown as PersistedWorkspaceState['users'],
    tasks: [
      task('task-1', 'Local edit'),
      task('task-2', 'Untouched'),
      task('task-3', 'Delete me'),
      task('task-4', 'Fresh insert'),
      { ...task('task-1', 'Local edit'), comments: [{ id: 'comment-1', text: 'Local note' }] },
    ] as unknown as PersistedWorkspaceState['tasks'],
    taskStatuses: ['Pending', 'Cancelled', 'Archived'],
  });

  it('overlays only the entities touched by the retained operations', () => {
    const operations: WorkspaceOperation[] = [
      { kind: 'member', action: 'update', entityType: 'member', entityId: 'member-1', expectedVersion: 2, data: { name: 'Local edit' } },
      { kind: 'entity', action: 'update', entityType: 'task', entityId: 'task-1', expectedVersion: 2, data: { title: 'Local edit' } },
    ];

    const merged = overlayRetainedWorkspaceEntities(remote(), local(), operations);

    expect((merged.users as { id: string; name: string }[]).find(user => user.id === 'member-1')?.name).toBe('Local edit');
    expect((merged.users as { id: string; name: string }[]).find(user => user.id === 'member-2')?.name).toBe('Teammate');
    expect((merged.tasks as { id: string; title: string }[]).find(item => item.id === 'task-1')?.title).toBe('Local edit');
    expect((merged.tasks as { id: string; title: string }[]).find(item => item.id === 'task-2')?.title).toBe('Untouched');
  });

  it('reconstructs a retained edit from command data after a page reload', () => {
    const operations: WorkspaceOperation[] = [
      {
        kind: 'entity',
        action: 'update',
        entityType: 'task',
        entityId: 'task-1',
        expectedVersion: 2,
        data: { id: 'task-1', title: 'Recovered from session storage' },
      },
    ];

    const merged = overlayRetainedWorkspaceEntities(remote(), remote(), operations);

    expect((merged.tasks as { id: string; title: string }[]).find(item => item.id === 'task-1')?.title)
      .toBe('Recovered from session storage');
  });

  it('re-adds inserted entities and honours deletions', () => {
    const operations: WorkspaceOperation[] = [
      { kind: 'entity', action: 'insert', entityType: 'task', entityId: 'task-4', expectedVersion: 0, data: { title: 'Fresh insert' } },
      { kind: 'entity', action: 'delete', entityType: 'task', entityId: 'task-3', expectedVersion: 2 },
    ];

    const merged = overlayRetainedWorkspaceEntities(remote(), local(), operations);
    const ids = (merged.tasks as { id: string }[]).map(item => item.id);

    expect(ids).toContain('task-4');
    expect(ids).not.toContain('task-3');
  });

  it('overlays the parent task when only child comments changed', () => {
    const operations: WorkspaceOperation[] = [
      { kind: 'entity', action: 'insert', entityType: 'comment', entityId: 'comment-1', parentId: 'task-1', expectedVersion: 0, data: { text: 'Local note' } },
    ];

    const merged = overlayRetainedWorkspaceEntities(remote(), local(), operations);
    const overlaid = (merged.tasks as { id: string; comments?: unknown[] }[]).find(item => item.id === 'task-1');

    expect(overlaid?.comments).toHaveLength(1);
  });

  it('applies task status additions and removals', () => {
    const operations: WorkspaceOperation[] = [
      { kind: 'entity', action: 'insert', entityType: 'task_status', entityId: 'Archived', expectedVersion: 0 },
      { kind: 'entity', action: 'delete', entityType: 'task_status', entityId: 'Cancelled', expectedVersion: 2 },
    ];

    const merged = overlayRetainedWorkspaceEntities(remote(), local(), operations);

    expect(merged.taskStatuses).toEqual(['Pending', 'Archived']);
  });
});

describe('secure notification transport', () => {
  beforeEach(() => {
    rpc.mockReset();
    refreshSession.mockReset();
    from.mockReset();
  });

  it('loads a whitelisted cursor page and maps the current member receipt', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        ok: true,
        memberId: 'staff-1',
        unreadCount: 7,
        items: [{
          id: 'notice-1',
          version: 3,
          updatedAt: '2026-08-02T10:01:00.000Z',
          title: 'New Task Assigned',
          message: 'A task needs your attention.',
          route: { page: 'tasks', entityId: 'task-1' },
          isRead: true,
          createdAt: '2026-08-02T10:00:00.000Z',
          iconType: 'task',
          category: 'assignment',
          importance: 'action',
        }],
        nextCursor: { createdAt: '2026-08-02T10:00:00.000Z', id: 'notice-1' },
      },
      error: null,
    });

    const page = await loadSecureNotificationPage({ limit: 80, unreadOnly: true, search: ' assigned ' });

    expect(rpc).toHaveBeenCalledWith('aitask_read_notifications', expect.objectContaining({
      p_limit: 50,
      p_unread_only: true,
      p_search: 'assigned',
    }));
    expect(page).toMatchObject({ unreadCount: 7, nextCursor: { id: 'notice-1' } });
    expect(page.items[0]).toMatchObject({
      id: 'notice-1',
      readByUserIds: ['staff-1'],
      visibleToCurrentUser: true,
    });
    expect(page.items[0].targetUserId).toBeUndefined();
  });

  it('reuses an uncertain read command receipt and keeps task commands separate', async () => {
    rpc
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValueOnce({
        data: {
          ok: true,
          commandId: '00000000-0000-4000-8000-000000000116',
          memberId: 'staff-1',
          workspaceVersion: 44,
          unreadCount: 6,
          changedNotifications: [{ id: 'notice-1', version: 4 }],
        },
        error: null,
      });

    const first = await setSecureNotificationsRead(['notice-1'], true);
    expect(first).toMatchObject({ ok: false, code: 'RETRY_REQUIRED' });
    const firstCommandId = rpc.mock.calls[0][1].p_command_id;

    const unrelated = await setSecureNotificationsRead(['notice-2'], true);
    expect(unrelated).toMatchObject({ ok: false, code: 'RETRY_REQUIRED' });
    expect(rpc).toHaveBeenCalledTimes(1);

    const retry = await setSecureNotificationsRead(['notice-1'], true);
    expect(retry).toMatchObject({ ok: true, workspaceVersion: 44 });
    expect(rpc.mock.calls[1][0]).toBe('aitask_set_notifications_read');
    expect(rpc.mock.calls[1][1].p_command_id).toBe(firstCommandId);
  });
});

describe('secure release notice acknowledgement transport', () => {
  beforeEach(() => {
    rpc.mockReset();
    refreshSession.mockReset();
    from.mockReset();
  });

  it('checks the fixed notice for the current secure workspace', async () => {
    rpc.mockResolvedValueOnce({
      data: { ok: true, noticeId: '2026-08-service-operations', acknowledged: false },
      error: null,
    });

    const result = await getSecureReleaseNoticeAcknowledgement('2026-08-service-operations');

    expect(result).toEqual({ ok: true, acknowledged: false });
    expect(rpc).toHaveBeenCalledWith('aitask_get_release_notice_acknowledgement', {
      p_workspace_id: 'aitask-main',
      p_notice_id: '2026-08-service-operations',
    });
  });

  it('refreshes an expired session before acknowledging the notice', async () => {
    rpc
      .mockResolvedValueOnce({ data: null, error: { code: 'PGRST301', message: 'JWT expired' } })
      .mockResolvedValueOnce({
        data: { ok: true, noticeId: '2026-08-service-operations', acknowledged: true },
        error: null,
      });
    refreshSession.mockResolvedValueOnce({ data: { session: { access_token: 'refreshed' } }, error: null });

    const result = await acknowledgeSecureReleaseNotice('2026-08-service-operations');

    expect(result).toEqual({ ok: true, acknowledged: true });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenLastCalledWith('aitask_acknowledge_release_notice', {
      p_workspace_id: 'aitask-main',
      p_notice_id: '2026-08-service-operations',
    });
  });

  it('does not accept an acknowledgement response for a different release', async () => {
    rpc.mockResolvedValueOnce({
      data: { ok: true, noticeId: 'unexpected-release', acknowledged: true },
      error: null,
    });

    await expect(acknowledgeSecureReleaseNotice('2026-08-service-operations')).resolves.toMatchObject({
      ok: false,
      code: 'VALIDATION',
    });
  });
});

describe('secure workspace baseline', () => {
  beforeEach(() => {
    rpc.mockReset();
    refreshSession.mockReset();
    from.mockReset();
  });

  it('does not turn parser defaults into unrelated task updates', async () => {
    const member = {
      id: 'staff-9',
      workspace_id: 'aitask-main',
      auth_user_id: '00000000-0000-4000-8000-000000000009',
      name: 'Staff Nine',
      email: 'staff9@example.com',
      role: 'Staff',
      departments: ['Designer'],
      department: 'Designer',
      avatar: null,
      client_name: null,
      is_super_admin: false,
      must_reset_password: false,
      custom_role_id: null,
      custom_role_name: null,
      permissions: {},
      version: 3,
      updated_at: '2026-07-18T00:00:00Z',
    };
    const existingTask = {
      workspace_id: 'aitask-main',
      entity_type: 'task',
      entity_id: 'task-existing',
      parent_id: 'project-admin',
      data: {
        id: 'task-existing',
        projectId: 'project-admin',
        clientName: 'Acme',
        serviceType: 'Design',
        title: 'Existing artwork',
        department: 'Designer',
        assignedTo: member.id,
        createdBy: member.id,
        startDate: '2026-07-18',
        priority: 'Medium',
        status: 'Pending',
      },
      version: 7,
      updated_at: '2026-07-18T00:00:00Z',
    };

    from.mockImplementation((table: string) => ({
      select: () => ({
        eq: () => table === 'aitask_workspaces'
          ? { single: () => Promise.resolve({ data: { version: 11, updated_at: '2026-07-18T00:00:00Z', sync_protocol_version: 1 }, error: null }) }
          : table === 'aitask_entities'
            ? { neq: () => Promise.resolve({ data: [existingTask], error: null }) }
            : Promise.resolve({ data: [member], error: null }),
      }),
    }));
    rpc.mockResolvedValueOnce({
      data: { ok: true, memberId: member.id, items: [], unreadCount: 0, nextCursor: null },
      error: null,
    });

    const loaded = await loadSecureWorkspace({ id: member.auth_user_id } as never);
    rpc.mockClear();
    const newTask = {
      ...loaded.state.tasks[0],
      id: 'task-new',
      version: undefined,
      title: 'New artwork',
    };
    rpc.mockResolvedValueOnce({
      data: {
        ok: true,
        workspaceVersion: 12,
        changed: [{ entityType: 'task', entityId: newTask.id, version: 1, updatedAt: '2026-07-18T00:01:00Z' }],
      },
      error: null,
    });

    const result = await saveSecureWorkspace({ ...loaded.state, tasks: [...loaded.state.tasks, newTask] });

    expect(result.ok).toBe(true);
    expect(rpc.mock.calls[0][1].p_operations).toEqual([
      expect.objectContaining({ action: 'insert', entityType: 'task', entityId: 'task-new', expectedVersion: 0 }),
    ]);

    rpc.mockResolvedValueOnce({
      data: {
        ok: true,
        workspaceVersion: 13,
        changed: [{ entityType: 'task', entityId: existingTask.entity_id, version: 8, updatedAt: '2026-07-18T00:02:00Z' }],
      },
      error: null,
    });
    const updatedExistingTask = {
      ...loaded.state.tasks[0],
      startDate: '2026-07-20',
      dueDate: '2026-07-24',
    };
    const dateResult = await saveSecureWorkspace({
      ...loaded.state,
      tasks: [updatedExistingTask, newTask],
    });

    expect(dateResult.ok).toBe(true);
    expect(rpc.mock.calls[1][1].p_command_type).toBe('task.update');
    expect(rpc.mock.calls[1][1].p_operations).toEqual([
      expect.objectContaining({
        action: 'update',
        entityType: 'task',
        entityId: existingTask.entity_id,
        expectedVersion: 7,
        data: expect.objectContaining({
          startDate: '2026-07-20',
          dueDate: '2026-07-24',
        }),
      }),
    ]);
  });

  it('discards full Client rows and maps only projected tasks and read-only contacts', async () => {
    const clientMember = {
      id: 'client-1',
      workspace_id: 'aitask-main',
      auth_user_id: '00000000-0000-4000-8000-000000000101',
      name: 'Acme Client',
      email: 'client@acme.example',
      role: 'Client',
      departments: ['Client'],
      department: 'Client',
      avatar: null,
      client_name: 'Acme',
      is_super_admin: false,
      must_reset_password: false,
      custom_role_id: null,
      custom_role_name: null,
      permissions: {},
      version: 2,
      updated_at: '2026-08-01T00:00:00Z',
    };
    const internalMember = {
      ...clientMember,
      id: 'staff-private',
      auth_user_id: '00000000-0000-4000-8000-000000000102',
      name: 'Private Staff',
      email: 'private@agency.example',
      role: 'Staff',
      departments: ['Management'],
      department: 'Management',
      client_name: null,
      permissions: { editTasks: true },
    };
    const fullTask = {
      workspace_id: 'aitask-main',
      entity_type: 'task',
      entity_id: 'task-client',
      parent_id: null,
      data: {
        id: 'task-client',
        clientName: 'Acme',
        serviceType: 'Design',
        title: 'Private full row',
        description: 'Visible description',
        department: 'Management',
        assignedTo: internalMember.id,
        createdBy: internalMember.id,
        startDate: '2026-08-01',
        dueDate: '2026-08-08',
        priority: 'Urgent',
        status: 'Waiting Approval',
        completionPercentage: 100,
        notes: 'Never return this note',
        isCompleted: true,
        revisionCount: 0,
        clientApprovalStatus: 'Pending',
        isRecurring: true,
      },
      version: 8,
      updated_at: '2026-08-01T03:00:00Z',
    };

    from.mockImplementation((table: string) => ({
      select: () => ({
        eq: () => table === 'aitask_workspaces'
          ? { single: () => Promise.resolve({ data: { version: 30, updated_at: '2026-08-01T03:00:00Z', sync_protocol_version: 1 }, error: null }) }
          : table === 'aitask_entities'
            ? { neq: () => Promise.resolve({ data: [fullTask], error: null }) }
            : Promise.resolve({ data: [clientMember, internalMember], error: null }),
      }),
    }));
    rpc.mockResolvedValueOnce({
      data: { ok: true, memberId: clientMember.id, items: [], unreadCount: 0, nextCursor: null },
      error: null,
    });
    rpc.mockResolvedValueOnce({
      data: {
        workspaceId: 'aitask-main',
        clientName: 'Acme',
        tasks: [{
          id: 'task-client',
          version: 8,
          clientName: 'Acme',
          serviceType: 'Design',
          title: 'Projected title',
          description: 'Visible description',
          assignedTo: internalMember.id,
          startDate: '2026-08-01',
          dueDate: '2026-08-08',
          status: 'Waiting Approval',
          completionPercentage: 100,
          isCompleted: true,
          revisionCount: 0,
          clientApprovalStatus: 'Pending',
          updatedAt: '2026-08-01T03:00:00Z',
        }],
        projects: [],
        clients: [],
        contacts: [{ id: internalMember.id, name: internalMember.name, avatar: null }],
      },
      error: null,
    });

    const loaded = await loadSecureWorkspace({ id: clientMember.auth_user_id } as never);

    expect(loaded.state.tasks).toHaveLength(1);
    expect(loaded.state.tasks[0]).toMatchObject({
      title: 'Projected title',
      department: 'Client',
      priority: 'Medium',
      clientProjection: true,
    });
    expect(loaded.state.tasks[0].notes).toBeUndefined();
    expect(loaded.state.users.map(user => user.id)).toEqual(['client-1', 'staff-private']);
    expect(loaded.state.users[1]).toMatchObject({ name: 'Private Staff', directoryOnly: true });
    expect(loaded.state.users[1].email).toBeUndefined();
    expect(rpc).toHaveBeenCalledWith('aitask_read_client_portal', { p_workspace_id: 'aitask-main' });
  });
});
