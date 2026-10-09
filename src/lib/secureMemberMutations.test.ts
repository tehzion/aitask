import { describe, expect, it, vi } from 'vitest';
import { createSecureMemberMutations } from './secureMemberMutations';
import type { SecureMemberMutationRuntime } from './secureWorkspace';

// The canonical member may advance after the original command commits.
describe('member receipt baseline reconciliation', () => {
  it.each(['departments', 'permissions', 'role'] as const)('preserves a newer baseline after a %s receipt replay', async kind => {
    const current = { version: 3, data: { departments: ['Video Editor'] }, serialized: 'canonical version 3' };
    const baseline = new Map([['member:member-1', current]]);
    const clearPersistedRetryableMemberMutation = vi.fn();
    const runtime = {
      captureWorkspaceSession: () => 'session-1',
      normalizeMemberDepartments: (_role: string, departments: string[]) => departments,
      isWorkspaceSessionCurrent: () => true,
      stable: JSON.stringify,
      retainedMemberMutationWithId: () => false,
      commandId: () => 'original-command',
      persistRetryableMemberMutation: vi.fn(),
      bindSessionRequest: (invoke: () => Promise<unknown>) => invoke,
      withSyncTimeout: (promise: Promise<unknown>) => promise,
      supabase: { rpc: vi.fn().mockResolvedValue({
        data: { ok: true, replayed: true, commandId: 'original-command', workspaceVersion: 6, member: { version: 2 } },
        error: null,
      }) },
      isAuthError: () => false,
      refreshSecureSession: vi.fn(),
      SyncRequestTimeoutError: Error,
      commandErrorCode: () => 'RETRY_REQUIRED',
      clearPersistedRetryableMemberMutation,
      getLegacyDepartmentMirror: () => 'Designer',
      entityKey: () => 'member:member-1',
      memberData: () => ({}),
      SECURE_WORKSPACE_ID: 'workspace-1',
      baseline,
      retryableMemberDepartments: null,
      retryableMemberPermissions: null,
      retryableMemberRole: null,
    } as unknown as SecureMemberMutationRuntime;
    const mutations = createSecureMemberMutations(runtime);
    const member = { id: 'member-1', name: 'Staff', role: 'Staff' as const, departments: ['Designer' as const], version: 1 };
    const response = kind === 'departments'
      ? await mutations.saveSecureMemberDepartments(member, ['Designer'])
      : kind === 'permissions'
        ? await mutations.saveSecureMemberPermissions(member, null)
        : await mutations.saveSecureMemberRole(member, { role: 'HOD', departments: ['Designer'] });

    expect(response).toMatchObject({ ok: true, replayed: true, commandId: 'original-command' });
    expect(baseline.get('member:member-1')).toBe(current);
    expect(current.version).toBe(3);
    expect(clearPersistedRetryableMemberMutation).toHaveBeenCalledOnce();
    expect(runtime.retryableMemberDepartments).toBeNull();
    expect(runtime.retryableMemberPermissions).toBeNull();
    expect(runtime.retryableMemberRole).toBeNull();
  });
});
