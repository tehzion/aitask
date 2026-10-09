import type { Department, RolePermissions, WorkspaceMember } from '../types';
import type { MemberDepartmentsResponse, MemberPermissionsResponse, MemberRoleAssignment, MemberRoleResponse, MutationResult, SecureMemberMutationRuntime } from './secureWorkspace';

export const createSecureMemberMutations = (runtime: SecureMemberMutationRuntime) => {
  const { captureWorkspaceSession, normalizeMemberDepartments, isWorkspaceSessionCurrent, stable, retainedMemberMutationWithId, commandId, persistRetryableMemberMutation, bindSessionRequest, withSyncTimeout, supabase, isAuthError, refreshSecureSession, SyncRequestTimeoutError, commandErrorCode, clearPersistedRetryableMemberMutation, getLegacyDepartmentMirror, entityKey, memberData, SECURE_WORKSPACE_ID } = runtime;

  const saveSecureMemberDepartments = async (
    member: WorkspaceMember,
    requestedDepartments: Department[],
  ): Promise<MutationResult<MemberDepartmentsResponse>> => {
    const sessionToken = captureWorkspaceSession();
    const departments = normalizeMemberDepartments(member.role, requestedDepartments);
    if (member.role === 'Client' || (member.role !== 'Project Manager' && departments.length === 0)) {
      return { ok: false, code: 'VALIDATION', error: 'Choose at least one valid internal department.' };
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return { ok: false, code: 'OFFLINE', error: 'You are offline. Reconnect before saving departments.' };
    }

    const expectedVersion = Math.max(1, Number(member.version) || 1);
    const matchesRetry = runtime.retryableMemberDepartments
      && runtime.retryableMemberDepartments.memberId === member.id
      && runtime.retryableMemberDepartments.expectedVersion === expectedVersion
      && stable(runtime.retryableMemberDepartments.departments) === stable(departments);
    if (retainedMemberMutationWithId() && !matchesRetry) {
      return {
        ok: false,
        code: 'RETRY_REQUIRED',
        error: 'Retry or discard the previous member change before submitting a different one.',
      };
    }
    const pending = matchesRetry
      ? runtime.retryableMemberDepartments
      : { kind: 'departments' as const, id: commandId(), memberId: member.id, departments, expectedVersion };
    runtime.retryableMemberDepartments = pending;
    persistRetryableMemberMutation();

    const invoke = bindSessionRequest(() => withSyncTimeout(supabase.rpc('aitask_update_member_departments', {
      p_workspace_id: SECURE_WORKSPACE_ID,
      p_command_id: pending.id,
      p_member_id: pending.memberId,
      p_departments: pending.departments,
      p_expected_version: pending.expectedVersion,
    })));

    let rpcResult: Awaited<ReturnType<typeof invoke>>;
    try {
      rpcResult = await invoke();
      if (isAuthError(rpcResult.error) && await refreshSecureSession()) rpcResult = await invoke();
    } catch (error) {
      return {
        ok: false,
        code: typeof navigator !== 'undefined' && navigator.onLine === false ? 'OFFLINE' : 'RETRY_REQUIRED',
        error: error instanceof SyncRequestTimeoutError
          ? 'Save confirmation timed out. Submit again to retry the same department change safely.'
          : 'Supabase could not confirm the department change. Submit again to retry.',
      };
    }

    if (!isWorkspaceSessionCurrent(sessionToken)) return { ok: false, code: 'FORBIDDEN', error: 'Your session changed. Sign in again.' };
    if (rpcResult.error) {
      const code = isAuthError(rpcResult.error) ? 'FORBIDDEN' : commandErrorCode(rpcResult.error);
      if (code !== 'RETRY_REQUIRED' && code !== 'CONFLICT' && code !== 'OFFLINE') {
        runtime.retryableMemberDepartments = null;
        clearPersistedRetryableMemberMutation();
      }
      return {
        ok: false,
        code,
        error: rpcResult.error.message || 'Unable to update departments.',
      };
    }

    const response = rpcResult.data as MemberDepartmentsResponse;
    if (!response?.ok) {
      const code = response.code || 'RETRY_REQUIRED';
      if (code !== 'RETRY_REQUIRED' && code !== 'CONFLICT' && code !== 'OFFLINE') {
        runtime.retryableMemberDepartments = null;
        clearPersistedRetryableMemberMutation();
      }
      return {
        ok: false,
        code,
        error: response.error || 'The department change was rejected.',
        conflict: response.conflict,
      };
    }

    runtime.retryableMemberDepartments = null;
    clearPersistedRetryableMemberMutation();
    const legacyDepartment = getLegacyDepartmentMirror(member.role, departments);
    const key = entityKey('member', member.id);
    const previous = runtime.baseline.get(key);
    // A receipt can predate the canonical snapshot loaded before this retry.
    if (previous && previous.version > (Number(response.member?.version) || expectedVersion + 1)) {
      return {
        ok: true,
        data: response,
        commandId: response.commandId || pending.id,
        workspaceVersion: Number(response.workspaceVersion) || 1,
        replayed: response.replayed,
      };
    }
    const nextData = {
      ...(previous?.data || memberData(member)),
      departments,
      department: legacyDepartment,
    };
    runtime.baseline.set(key, {
      kind: 'member',
      entityType: 'member',
      entityId: member.id,
      version: Number(response.member?.version) || expectedVersion + 1,
      data: nextData,
      serialized: stable({ parentId: null, data: nextData }),
    });

    return {
      ok: true,
      data: response,
      commandId: response.commandId || pending.id,
      workspaceVersion: Number(response.workspaceVersion) || 1,
      replayed: response.replayed,
    };
  };

  const saveSecureMemberPermissions = async (
    member: WorkspaceMember,
    permissions: RolePermissions | null,
  ): Promise<MutationResult<MemberPermissionsResponse>> => {
    const sessionToken = captureWorkspaceSession();
    if (!['Staff', 'HOD'].includes(member.role) || member.isSuperAdmin) {
      return { ok: false, code: 'VALIDATION', error: 'Only Staff and HOD permissions can be customized.' };
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return { ok: false, code: 'OFFLINE', error: 'You are offline. Reconnect before saving permissions.' };
    }

    const expectedVersion = Math.max(1, Number(member.version) || 1);
    const matchesRetry = runtime.retryableMemberPermissions
      && runtime.retryableMemberPermissions.memberId === member.id
      && runtime.retryableMemberPermissions.expectedVersion === expectedVersion
      && stable(runtime.retryableMemberPermissions.permissions) === stable(permissions);
    if (retainedMemberMutationWithId() && !matchesRetry) {
      return {
        ok: false,
        code: 'RETRY_REQUIRED',
        error: 'Retry or discard the previous member change before submitting a different one.',
      };
    }
    const pending = matchesRetry
      ? runtime.retryableMemberPermissions
      : { kind: 'permissions' as const, id: commandId(), memberId: member.id, permissions, expectedVersion };
    runtime.retryableMemberPermissions = pending;
    persistRetryableMemberMutation();

    const invoke = bindSessionRequest(() => withSyncTimeout(supabase.rpc('aitask_update_member_permissions', {
      p_workspace_id: SECURE_WORKSPACE_ID,
      p_command_id: pending.id,
      p_member_id: pending.memberId,
      p_permissions: pending.permissions,
      p_expected_version: pending.expectedVersion,
    })));

    let rpcResult: Awaited<ReturnType<typeof invoke>>;
    try {
      rpcResult = await invoke();
      if (isAuthError(rpcResult.error) && await refreshSecureSession()) rpcResult = await invoke();
    } catch (error) {
      return {
        ok: false,
        code: typeof navigator !== 'undefined' && navigator.onLine === false ? 'OFFLINE' : 'RETRY_REQUIRED',
        error: error instanceof SyncRequestTimeoutError
          ? 'Save confirmation timed out. Submit again to retry the same permission change safely.'
          : 'Supabase could not confirm the permission change. Submit again to retry.',
      };
    }

    if (!isWorkspaceSessionCurrent(sessionToken)) return { ok: false, code: 'FORBIDDEN', error: 'Your session changed. Sign in again.' };
    if (rpcResult.error) {
      const code = isAuthError(rpcResult.error) ? 'FORBIDDEN' : commandErrorCode(rpcResult.error);
      if (code !== 'RETRY_REQUIRED' && code !== 'CONFLICT' && code !== 'OFFLINE') {
        runtime.retryableMemberPermissions = null;
        clearPersistedRetryableMemberMutation();
      }
      return {
        ok: false,
        code,
        error: rpcResult.error.message || 'Unable to update permissions.',
      };
    }

    const response = rpcResult.data as MemberPermissionsResponse;
    if (!response?.ok) {
      const code = response.code || 'RETRY_REQUIRED';
      if (code !== 'RETRY_REQUIRED' && code !== 'CONFLICT' && code !== 'OFFLINE') {
        runtime.retryableMemberPermissions = null;
        clearPersistedRetryableMemberMutation();
      }
      return {
        ok: false,
        code,
        error: response.error || 'The permission change was rejected.',
        conflict: response.conflict,
      };
    }

    runtime.retryableMemberPermissions = null;
    clearPersistedRetryableMemberMutation();
    const nextPermissions = permissions || undefined;
    const key = entityKey('member', member.id);
    const previous = runtime.baseline.get(key);
    // A receipt can predate the canonical snapshot loaded before this retry.
    if (previous && previous.version > (Number(response.member?.version) || expectedVersion + 1)) {
      return {
        ok: true,
        data: response,
        commandId: response.commandId || pending.id,
        workspaceVersion: Number(response.workspaceVersion) || 1,
        replayed: response.replayed,
      };
    }
    const nextData = {
      ...(previous?.data || memberData(member)),
      permissions: nextPermissions,
    };
    runtime.baseline.set(key, {
      kind: 'member',
      entityType: 'member',
      entityId: member.id,
      version: Number(response.member?.version) || expectedVersion + 1,
      data: nextData,
      serialized: stable({ parentId: null, data: nextData }),
    });

    return {
      ok: true,
      data: response,
      commandId: response.commandId || pending.id,
      workspaceVersion: Number(response.workspaceVersion) || 1,
      replayed: response.replayed,
    };
  };

  const saveSecureMemberRole = async (
    member: WorkspaceMember,
    assignment: MemberRoleAssignment,
  ): Promise<MutationResult<MemberRoleResponse>> => {
    const sessionToken = captureWorkspaceSession();
    if (member.isSuperAdmin) {
      return { ok: false, code: 'VALIDATION', error: 'Boss Koo keeps permanent super admin permissions.' };
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return { ok: false, code: 'OFFLINE', error: 'You are offline. Reconnect before changing the role.' };
    }

    const expectedVersion = Math.max(1, Number(member.version) || 1);
    const nextAssignment = {
      role: assignment.role,
      customRoleId: assignment.customRoleId || null,
      companyName: assignment.companyName || null,
      departments: assignment.departments,
    };
    const matchesRetry = runtime.retryableMemberRole
      && runtime.retryableMemberRole.memberId === member.id
      && runtime.retryableMemberRole.expectedVersion === expectedVersion
      && stable({
        role: runtime.retryableMemberRole.role,
        customRoleId: runtime.retryableMemberRole.customRoleId,
        companyName: runtime.retryableMemberRole.companyName,
        departments: runtime.retryableMemberRole.departments,
      }) === stable(nextAssignment);
    if (retainedMemberMutationWithId() && !matchesRetry) {
      return {
        ok: false,
        code: 'RETRY_REQUIRED',
        error: 'Retry or discard the previous member change before submitting a different one.',
      };
    }
    const pending = matchesRetry
      ? runtime.retryableMemberRole
      : { kind: 'role' as const, id: commandId(), memberId: member.id, ...nextAssignment, expectedVersion };
    runtime.retryableMemberRole = pending;
    persistRetryableMemberMutation();

    const invoke = bindSessionRequest(() => withSyncTimeout(supabase.rpc('aitask_update_member_role', {
      p_workspace_id: SECURE_WORKSPACE_ID,
      p_command_id: pending.id,
      p_member_id: pending.memberId,
      p_role: pending.role,
      p_custom_role_id: pending.customRoleId,
      p_client_name: pending.companyName,
      p_departments: pending.departments,
      p_expected_version: pending.expectedVersion,
    })));

    let rpcResult: Awaited<ReturnType<typeof invoke>>;
    try {
      rpcResult = await invoke();
      if (isAuthError(rpcResult.error) && await refreshSecureSession()) rpcResult = await invoke();
    } catch (error) {
      return {
        ok: false,
        code: typeof navigator !== 'undefined' && navigator.onLine === false ? 'OFFLINE' : 'RETRY_REQUIRED',
        error: error instanceof SyncRequestTimeoutError
          ? 'Save confirmation timed out. Submit again to retry the role change safely.'
          : 'Supabase could not confirm the role change. Submit again to retry.',
      };
    }

    if (!isWorkspaceSessionCurrent(sessionToken)) return { ok: false, code: 'FORBIDDEN', error: 'Your session changed. Sign in again.' };
    if (rpcResult.error) {
      const code = isAuthError(rpcResult.error) ? 'FORBIDDEN' : commandErrorCode(rpcResult.error);
      if (code !== 'RETRY_REQUIRED' && code !== 'CONFLICT' && code !== 'OFFLINE') {
        runtime.retryableMemberRole = null;
        clearPersistedRetryableMemberMutation();
      }
      return {
        ok: false,
        code,
        error: rpcResult.error.message || 'Unable to change the role.',
      };
    }

    const response = rpcResult.data as MemberRoleResponse;
    if (!response?.ok) {
      const code = response.code || 'RETRY_REQUIRED';
      if (code !== 'RETRY_REQUIRED' && code !== 'CONFLICT' && code !== 'OFFLINE') {
        runtime.retryableMemberRole = null;
        clearPersistedRetryableMemberMutation();
      }
      return {
        ok: false,
        code,
        error: response.error || 'The role change was rejected.',
        conflict: response.conflict,
      };
    }

    runtime.retryableMemberRole = null;
    clearPersistedRetryableMemberMutation();
    const key = entityKey('member', member.id);
    const previous = runtime.baseline.get(key);
    // A receipt can predate the canonical snapshot loaded before this retry.
    if (previous && previous.version > (Number(response.member?.version) || expectedVersion + 1)) {
      return {
        ok: true,
        data: response,
        commandId: response.commandId || pending.id,
        workspaceVersion: Number(response.workspaceVersion) || 1,
        replayed: response.replayed,
      };
    }
    const nextData = {
      ...(previous?.data || memberData(member)),
      role: response.member?.role ?? assignment.role,
      custom_role_id: response.member?.customRoleId ?? null,
      custom_role_name: response.member?.customRoleName ?? null,
      client_name: response.member?.clientName ?? null,
      departments: response.member?.departments ?? assignment.departments,
      department: response.member?.department ?? getLegacyDepartmentMirror(assignment.role, assignment.departments),
      permissions: {},
    };
    runtime.baseline.set(key, {
      kind: 'member',
      entityType: 'member',
      entityId: member.id,
      version: Number(response.member?.version) || expectedVersion + 1,
      data: nextData,
      serialized: stable({ parentId: null, data: nextData }),
    });

    return {
      ok: true,
      data: response,
      commandId: response.commandId,
      workspaceVersion: Number(response.workspaceVersion) || 1,
      replayed: response.replayed,
    };
  };

  return { saveSecureMemberDepartments, saveSecureMemberPermissions, saveSecureMemberRole };
};
