import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersistedWorkspaceState } from './supabaseSnapshot';

const { rpc, refreshSession } = vi.hoisted(() => ({
  rpc: vi.fn(),
  refreshSession: vi.fn(),
}));

vi.mock('./supabaseClient', () => ({
  supabase: { rpc, auth: { refreshSession } },
}));

import {
  inferSecureCommandType,
  rebaseRetryableCommand,
  retrySecureWorkspaceCommand,
  saveSecureWorkspace,
  type WorkspaceOperation,
} from './secureWorkspace';

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
});

const stateWithUser = (id: string): PersistedWorkspaceState => ({
  users: [{
    id,
    authUserId: `00000000-0000-4000-8000-${id.padStart(12, '0').slice(-12)}`,
    workspaceId: 'aitask-main',
    name: `User ${id}`,
    email: `${id}@example.com`,
    role: 'Staff',
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

describe('secure command retry identity', () => {
  beforeEach(() => {
    rpc.mockReset();
    refreshSession.mockReset();
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
