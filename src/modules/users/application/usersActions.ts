import { getRetainedSecureMemberMutation, saveSecureMemberDepartments, saveSecureMemberPermissions, saveSecureMemberRole } from '../../../infrastructure/api/secureWorkspace';
import { isTerminalMemberMutationError, isWorkspaceMutationLocked, pendingMutationMessage } from '../../../infrastructure/commands/mutationGuard';
import {
  shouldUseSecureSupabase,
  supabase
} from '../../../infrastructure/database/supabaseClient';
import { workspaceMutationRuntime } from '../../../infrastructure/persistence/workspaceMutationRuntime';
import { captureWorkspaceSession, isWorkspaceSessionCurrent } from '../../../infrastructure/persistence/workspaceSession';
import {
  canApproveRegistrations,
  canCreateUsers,
  canDeleteUser,
  isBossKoo,
  isDepartmentScopedUser,
  isHodRole,
  sanitizeRolePermissions
} from '../../../shared/authorization/access';
import {
  getLegacyDepartmentMirror,
  normalizeMemberDepartments
} from '../../../shared/authorization/departments';
import { useToastStore } from '../../../shared/feedback/useToastStore';
import {
  type CustomRole,
  type Department,
  type Registration,
  type User
} from '../../../shared/types/index';
import { type MutationActionResult, type StoreState, type WorkspaceGet, type WorkspaceSet } from '../../../shared/types/workspaceStore';
import { getFunctionErrorMessage, nowId, PHONE_PATTERN, profileEmailPattern } from '../../../shared/validation/workspaceInput';
import { DEFAULT_USER_PASSWORD } from '../../authentication/domain/auth';
import { clearLocalUserPassword, setLocalUserPassword } from '../../authentication/domain/localCredentials';
import { makeNotification } from '../../notifications/application/notificationRules';
export const createUsersActions = (set: WorkspaceSet, get: WorkspaceGet): Pick<StoreState, "registerUser" | "addUserBySuperAdmin" | "addCustomRole" | "updateCustomRole" | "deleteCustomRole" | "assignCustomRoleToUser" | "changeMemberRole" | "updateMemberDepartments" | "updateMemberPermissions" | "approveRegistration" | "rejectRegistration" | "requestMemberDeactivation" | "deleteUser"> => ({
  registerUser: async (data) => {
    const sessionToken = captureWorkspaceSession();
    const apply: typeof set = (patch) => { if (isWorkspaceSessionCurrent(sessionToken)) set(patch); };

    const name = data.name.trim().slice(0, 160);
    const email = data.email.trim().toLowerCase().slice(0, 320);
    const phone = data.phone.trim().slice(0, 80);
    const jobPosition = data.jobPosition.trim().slice(0, 160);

    if (!name || !email || !phone || !jobPosition || !profileEmailPattern.test(email)) {
      return { ok: false, error: 'Complete all fields with a valid email address.' };
    }
    if (!PHONE_PATTERN.test(phone)) {
      return { ok: false, error: 'Enter a valid phone number.' };
    }

    const state = get();
    const duplicatePending = (state.registrations || []).some(registration => (
      registration.status === 'Pending' && registration.email.toLowerCase() === email
    ));
    if (duplicatePending) {
      return { ok: false, error: 'This email already has a pending Staff registration.' };
    }
    const existingUser = state.users.some(user => (
      user.email?.toLowerCase() === email || user.name.toLowerCase() === name.toLowerCase()
    ));
    if (existingUser) {
      return { ok: false, error: 'An account with this name or email already exists.' };
    }

    if (shouldUseSecureSupabase()) {
      const password = data.password?.trim() || '';
      if (password.length < 12) {
        return { ok: false, error: 'Use a password with at least 12 characters.' };
      }
      const { data: signUpData, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            aitask_registration_source: 'staff_signup',
            name,
            phone,
            job_position: jobPosition,
          },
        },
      });
      if (error) return { ok: false, error: error.message };
      if (signUpData.session) await supabase.auth.signOut({ scope: 'local' });
      // When email confirmation is on, Supabase obfuscates an existing
      // email by returning a user with an empty identities array instead of
      // an error. Treat that as the duplicate it is.
      if (signUpData.user && (signUpData.user.identities?.length ?? 0) === 0) {
        return { ok: false, error: 'This email is already registered. Use the sign-in page instead.' };
      }
      if (!signUpData.user && !signUpData.session) {
        return { ok: false, error: 'This email is already registered. Use the sign-in page instead.' };
      }
      return { ok: true };
    }

    apply((current) => {
      const newReg: Registration = {
        name,
        email,
        phone,
        jobPosition,
        requestedRole: 'Staff',
        onboardingMode: 'self_signup',
        id: nowId('R'),
        status: 'Pending',
        createdAt: new Date().toISOString()
      };

      const superAdmins = current.users.filter(u => u.isSuperAdmin);
      const newNotifs = [...(current.notifications || [])];

      if (superAdmins.length > 0) {
        superAdmins.forEach(admin => {
          const notification = makeNotification({
            targetUserId: admin.id,
            title: 'New Registration',
            message: `${name} has registered and is waiting for your approval.`,
            route: { page: 'approvals' },
            iconType: 'status'
          });
          if (notification) newNotifs.unshift(notification);
        });
      }

      return {
        registrations: [...(current.registrations || []), newReg],
        notifications: newNotifs
      };
    });
    return { ok: true };
  },
  addUserBySuperAdmin: async (data) => {
    const sessionToken = captureWorkspaceSession();
    const apply: typeof set = (patch) => { if (isWorkspaceSessionCurrent(sessionToken)) set(patch); };

    const state = get();
    if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };
    const currentUser = state.currentUser;
    if (!currentUser || (!isBossKoo(currentUser) && currentUser.role !== 'Project Manager')) {
      return { ok: false, error: 'You do not have permission to add members.' };
    }
    const scopedPm = currentUser?.role === 'Project Manager' && !isBossKoo(currentUser);
    if (scopedPm && !['HOD', 'Staff'].includes(data.role)) return { ok: false, error: 'Project Managers can invite only HOD and Staff accounts.' };
    const projectIds = Array.from(new Set(data.projectIds || []));
    if (scopedPm) {
      if (!projectIds.length) return { ok: false, error: 'Choose at least one project for this member.' };
      if (projectIds.some(id => !state.projects.some(project => project.id === id && project.projectManagerIds?.includes(currentUser.id)))) {
        return { ok: false, error: 'You can assign members only to projects under your authority.' };
      }
    }

    const name = data.name.trim();
    const email = data.email?.trim();
    const initialPassword = data.password?.trim() || (shouldUseSecureSupabase() ? '' : DEFAULT_USER_PASSWORD);
    const sendInvitation = data.sendInvitation !== false;
    const companyName = data.role === 'Client' ? data.companyName?.trim() : undefined;
    const departments = normalizeMemberDepartments(data.role, data.departments, data.department);

    if (!name) return { ok: false, error: 'Member name is required.' };
    if (departments.length === 0 && data.role !== 'Project Manager') {
      return { ok: false, error: 'Choose at least one department.' };
    }
    if (initialPassword && initialPassword !== DEFAULT_USER_PASSWORD && initialPassword.length < 12) {
      return { ok: false, error: 'Custom initial passwords must be at least 12 characters.' };
    }
    if (data.role === 'Client' && !companyName) {
      return { ok: false, error: 'Client company is required for Client users.' };
    }

    const selectedCustomRole = data.customRoleId
      ? get().rolePermissions.find(role => role.id === data.customRoleId)
      : undefined;
    if (data.customRoleId && !selectedCustomRole) {
      return { ok: false, error: 'Custom role was not found.' };
    }
    if (selectedCustomRole && selectedCustomRole.baseRole !== data.role) {
      return { ok: false, error: `This role can only be assigned to ${selectedCustomRole.baseRole} members.` };
    }

    const { onboardingRequestKey, pendingOnboardingCommand, retainOnboardingCommand, clearOnboardingCommand } = await import('./onboardingCommand');
    const onboardingPayload = {
      name, email, role: data.role, departments, companyName, projectIds,
      customRoleId: data.customRoleId || null, workerType: ['Staff', 'HOD'].includes(data.role) ? data.workerType || 'employee' : 'employee',
      registrationId: data.registrationId || null, memberId: data.memberId || null, sendInvitation
    };
    const onboardingKey = shouldUseSecureSupabase() && currentUser.authUserId
      ? await onboardingRequestKey(currentUser.authUserId, onboardingPayload) : '';
    if (!isWorkspaceSessionCurrent(sessionToken)) return { ok: false, error: 'Your session changed. Sign in again.' };
    const duplicate = !scopedPm && !pendingOnboardingCommand(onboardingKey) && !data.memberId && !data.registrationId && get().users.some(user => (
      user.name.toLowerCase() === name.toLowerCase() ||
      (email && user.email?.toLowerCase() === email.toLowerCase())
    ));

    if (duplicate) {
      return { ok: false, error: 'A member with that name or email already exists.' };
    }

    const pendingRegistration = !data.registrationId && email
      ? get().registrations.find(registration => (
        registration.status === 'Pending' && registration.email.trim().toLowerCase() === email.toLowerCase()
      ))
      : undefined;
    if (pendingRegistration) {
      return {
        ok: false,
        error: 'This email already has a pending Staff signup. Approve it from Pending Registrations instead.',
      };
    }

    if (shouldUseSecureSupabase()) {
      if (!email || !profileEmailPattern.test(email)) {
        return { ok: false, error: 'A valid email is required for a secure invitation.' };
      }
      const registration = data.registrationId
        ? get().registrations.find(item => item.id === data.registrationId)
        : undefined;
      const needsTemporaryPassword = !sendInvitation && (
        !data.registrationId || registration?.onboardingMode === 'legacy_invite'
      );
      if (needsTemporaryPassword && initialPassword.length < 12) {
        return { ok: false, error: 'Temporary passwords must be at least 12 characters.' };
      }

      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) {
        return { ok: false, error: 'Your secure session has expired. Sign out, then sign in again.' };
      }
      if (!currentUser.authUserId || currentUser.authUserId !== authData.user.id) {
        await get().initializeBackend();
        return {
          ok: false,
          error: 'Your signed-in account changed. AiTask refreshed the session; please try again.',
        };
      }

      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session?.access_token) {
        return { ok: false, error: 'Your secure session has expired. Sign out, then sign in again.' };
      }
      const { error } = await supabase.functions.invoke('invite-aitask-member', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {
          commandId: retainOnboardingCommand(onboardingKey),
          name,
          email,
          role: data.role,
          departments,
          department: getLegacyDepartmentMirror(data.role, departments),
          companyName,
          workerType: ['Staff', 'HOD'].includes(data.role) ? data.workerType || 'employee' : undefined,
          customRoleId: data.customRoleId,
          registrationId: data.registrationId,
          memberId: data.memberId,
          sendInvitation,
          password: needsTemporaryPassword ? initialPassword : undefined,
          projectIds,
        },
      });
      if (!isWorkspaceSessionCurrent(sessionToken)) return { ok: false, error: 'Your session changed. Sign in again.' };
      if (error) return { ok: false, error: await getFunctionErrorMessage(error, 'Unable to send the invitation.') };
      clearOnboardingCommand(onboardingKey);
      if (!get().backend.hasLocalChanges && get().backend.pendingMutations === 0) {
        await get().pullBackendNow({ force: true });
      }
      return { ok: true };
    }

    const customRole = selectedCustomRole;

    const existingMember = scopedPm && email
      ? get().users.find(user => user.email?.toLowerCase() === email.toLowerCase())
      : undefined;
    if (existingMember) {
      apply(current => ({
        projects: current.projects.map(project => projectIds.includes(project.id) ? {
          ...project,
          ...(data.role === 'HOD'
            ? { hodMemberIds: Array.from(new Set([...(project.hodMemberIds || []), existingMember.id])) }
            : { staffMemberIds: Array.from(new Set([...(project.staffMemberIds || []), existingMember.id])) }),
          updatedAt: new Date().toISOString(),
        } : project)
      }));
      return { ok: true };
    }

    const userId = nowId('U');
    try {
      await setLocalUserPassword(userId, initialPassword);
    } catch {
      return { ok: false, error: 'This browser could not save the member credential.' };
    }

    const newUser: User = {
      id: userId,
      name,
      email,
      role: data.role,
      departments,
      department: getLegacyDepartmentMirror(data.role, departments),
      mustResetPassword: true,
      companyName,
      workerType: ['Staff', 'HOD'].includes(data.role) ? data.workerType || 'employee' : undefined,
      isSuperAdmin: false,
      customRoleId: customRole?.id,
      customRoleName: customRole?.name,
      permissions: undefined,
      avatar: `https://i.pravatar.cc/150?u=${encodeURIComponent(name.replace(/\s/g, ''))}`,
      updatedAt: new Date().toISOString()
    };

    apply((state) => {
      const notification = makeNotification({
        targetUserId: currentUser.id,
        title: 'Member Added',
        message: `${currentUser.name} added ${name} as ${data.role}.`,
        route: { page: 'approvals' },
        iconType: 'success'
      });

      return {
        users: [...state.users, newUser],
        projects: state.projects.map(project => projectIds.includes(project.id) ? {
          ...project,
          ...(data.role === 'HOD'
            ? { hodMemberIds: Array.from(new Set([...(project.hodMemberIds || []), newUser.id])) }
            : { staffMemberIds: Array.from(new Set([...(project.staffMemberIds || []), newUser.id])) }),
          updatedAt: new Date().toISOString(),
        } : project),
        notifications: [
          ...(notification ? [notification] : []),
          ...(state.notifications || [])
        ]
      };
    });

    return { ok: true };
  },
  addCustomRole: (data) => {
    const state = get();
    if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };
    const currentUser = state.currentUser;
    if (!canCreateUsers(currentUser, state.rolePermissions)) {
      return { ok: false, error: 'Only Boss Koo can create custom roles.' };
    }

    const name = data.name.trim();
    if (!name) return { ok: false, error: 'Role name is required.' };
    const permissions = sanitizeRolePermissions(data.permissions, data.baseRole, { departmentScoped: data.departmentScoped === true });
    const hasAnyPermission = permissions && Object.values(permissions).some(Boolean);
    if (!hasAnyPermission) return { ok: false, error: 'Choose at least one permission so members with this role keep workspace access.' };

    const duplicate = get().rolePermissions.some(role => role.name.toLowerCase() === name.toLowerCase());
    if (duplicate) return { ok: false, error: 'A role with this name already exists.' };

    const now = new Date().toISOString();
    const id = nowId('CR');
    const customRole: CustomRole = {
      ...data,
      permissions,
      id,
      name,
      description: data.description?.trim() || undefined,
      isProtected: false,
      isBuiltin: false,
      createdAt: now,
      updatedAt: now,
    };

    set((state) => ({
      rolePermissions: [...state.rolePermissions, customRole],
    }));

    return { ok: true, id };
  },
  updateCustomRole: (id, data) => {
    const state = get();
    if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };
    const currentUser = state.currentUser;
    if (!canCreateUsers(currentUser, state.rolePermissions)) {
      return { ok: false, error: 'Only Boss Koo can update custom roles.' };
    }

    const targetRole = get().rolePermissions.find(role => role.id === id);
    if (!targetRole) return { ok: false, error: 'Custom role was not found.' };
    const editingBuiltin = targetRole.isBuiltin;
    if (targetRole.isProtected && !editingBuiltin) return { ok: false, error: 'Protected roles cannot be changed.' };

    const nextName = editingBuiltin ? targetRole.name : data.name?.trim() || targetRole.name;
    const nextBaseRole = editingBuiltin ? targetRole.baseRole : data.baseRole || targetRole.baseRole;
    const nextDepartmentScoped = editingBuiltin ? nextBaseRole === 'HOD' : (data.departmentScoped ?? targetRole.departmentScoped);
    const duplicate = get().rolePermissions.some(role => role.id !== id && role.name.toLowerCase() === nextName.toLowerCase());
    if (duplicate) return { ok: false, error: 'A role with this name already exists.' };
    const nextPermissions = sanitizeRolePermissions(data.permissions ?? targetRole.permissions, nextBaseRole, { departmentScoped: nextDepartmentScoped === true });
    if (!Object.values(nextPermissions).some(Boolean)) {
      return { ok: false, error: 'Choose at least one permission so members with this role keep workspace access.' };
    }

    set((state) => {
      const nextRoles = state.rolePermissions.map(role => (
        role.id === id
          ? {
            ...role,
            ...data,
            permissions: nextPermissions,
            name: nextName,
            baseRole: nextBaseRole,
            departmentScoped: nextDepartmentScoped,
            isProtected: editingBuiltin ? false : role.isProtected,
            isBuiltin: editingBuiltin ? true : role.isBuiltin,
            description: data.description !== undefined ? (data.description.trim() || undefined) : role.description,
            updatedAt: new Date().toISOString(),
          }
          : role
      ));

      return {
        rolePermissions: nextRoles,
        users: state.users.map(user => (
          user.customRoleId === id
            ? { ...user, customRoleName: nextName }
            : user
        )),
      };
    });

    return { ok: true };
  },
  deleteCustomRole: (id) => {
    const state = get();
    if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };
    const currentUser = state.currentUser;
    if (!canCreateUsers(currentUser, state.rolePermissions)) {
      return { ok: false, error: 'Only Boss Koo can delete custom roles.' };
    }

    const targetRole = get().rolePermissions.find(role => role.id === id);
    if (!targetRole) return { ok: false, error: 'Custom role was not found.' };
    if (targetRole.isProtected || targetRole.isBuiltin || isHodRole(targetRole)) return { ok: false, error: 'Built-in roles cannot be deleted.' };

    set((state) => ({
      rolePermissions: state.rolePermissions.filter(role => role.id !== id),
      deletedRoleIds: Array.from(new Set([...(state.deletedRoleIds || []), id])),
      users: state.users.map(user => (
        user.customRoleId === id
          ? { ...user, customRoleId: undefined, customRoleName: undefined, permissions: undefined }
          : user
      )),
    }));

    return { ok: true };
  },
  assignCustomRoleToUser: (userId, customRoleId) => {
    const state = get();
    if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };
    const currentUser = state.currentUser;
    if (!canCreateUsers(currentUser, state.rolePermissions)) {
      return { ok: false, error: 'Only Boss Koo can assign custom roles.' };
    }

    const targetUser = get().users.find(user => user.id === userId);
    if (!targetUser) return { ok: false, error: 'User account was not found.' };
    if (isBossKoo(targetUser)) return { ok: false, error: 'Boss Koo keeps permanent super admin permissions.' };

    const customRole = customRoleId
      ? get().rolePermissions.find(role => role.id === customRoleId)
      : undefined;

    if (customRoleId && !customRole) return { ok: false, error: 'Custom role was not found.' };
    if (customRole?.isBuiltin) return { ok: false, error: 'Built-in roles are assigned through the member base role.' };
    if (customRole && customRole.baseRole !== targetUser.role) {
      return { ok: false, error: `This role can only be assigned to ${customRole.baseRole} members.` };
    }

    set((state) => ({
      users: state.users.map(user => (
        user.id === userId
          ? {
            ...user,
            customRoleId: customRole?.id,
            customRoleName: customRole?.name,
            permissions: undefined,
            updatedAt: new Date().toISOString(),
          }
          : user
      )),
    }));

    return { ok: true };
  },
  changeMemberRole: async (userId, role, options = {}) => {
    const sessionToken = captureWorkspaceSession();
    const apply: typeof set = (patch) => { if (isWorkspaceSessionCurrent(sessionToken)) set(patch); };

    const state = get();
    if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };
    if (!canCreateUsers(state.currentUser, state.rolePermissions)) {
      return { ok: false, error: 'Only Boss Koo can change member roles.' };
    }

    const targetUser = state.users.find(user => user.id === userId);
    if (!targetUser) return { ok: false, error: 'User account was not found.' };
    if (isBossKoo(targetUser)) return { ok: false, error: 'Boss Koo keeps permanent super admin permissions.' };

    let customRole: CustomRole | undefined;
    if (options.customRoleId) {
      customRole = state.rolePermissions.find(item => item.id === options.customRoleId);
      if (!customRole) return { ok: false, error: 'Custom role was not found.' };
      if (customRole.isBuiltin) return { ok: false, error: 'Built-in roles are assigned through the member base role.' };
      if (customRole.baseRole !== role) return { ok: false, error: `This role can only be assigned to ${customRole.baseRole} members.` };
    }
    if (role === 'Client' && !options.companyName?.trim()) {
      return { ok: false, error: 'Choose a company for this client account.' };
    }

    let departments: Department[];
    if (role === 'Client') departments = ['Client'];
    else if (role === 'Project Manager') departments = [];
    else if (options.departments?.length) departments = normalizeMemberDepartments(role, options.departments);
    else departments = normalizeMemberDepartments(role, targetUser.departments, targetUser.department);
    if (['Staff', 'HOD'].includes(role) && departments.length === 0) {
      return { ok: false, error: 'Choose at least one department for this member.' };
    }
    const companyName = role === 'Client' ? options.companyName!.trim() : undefined;
    const legacyDepartment = role === 'Client'
      ? 'Client'
      : role === 'Project Manager'
        ? 'Management'
        : getLegacyDepartmentMirror(role, departments);

    if (shouldUseSecureSupabase()) {
      const previousStatus = state.backend.status;
      apply(current => ({
        backend: {
          ...current.backend,
          status: 'saving',
          isSaving: true,
          error: undefined,
          message: 'Saving member role.',
        },
      }));
      const result = await saveSecureMemberRole(targetUser, {
        role,
        customRoleId: customRole?.id,
        companyName,
        departments,
      });
      if (result.ok === false) {
        const terminal = isTerminalMemberMutationError(result.code);
        const hasRetainedMutation = Boolean(getRetainedSecureMemberMutation());
        apply(current => ({
          backend: {
            ...current.backend,
            status: terminal
              ? previousStatus
              : result.code === 'CONFLICT'
                ? 'conflict'
                : result.code === 'OFFLINE'
                  ? 'offline'
                  : 'retry_required',
            isSaving: false,
            pendingMutations: hasRetainedMutation
              ? Math.max(1, current.backend.pendingMutations)
              : current.backend.pendingMutations,
            error: terminal ? undefined : result.error,
            conflict: result.conflict,
            message: terminal ? current.backend.message : result.error,
          },
        }));
        return { ok: false, code: result.code, error: result.error };
      }

      const updatedAt = result.data.member?.updated_at || new Date().toISOString();
      const version = Number(result.data.member?.version) || Math.max(1, Number(targetUser.version) || 1) + 1;
      workspaceMutationRuntime.isApplyingRemoteSnapshot = true;
      apply(current => ({
        users: current.users.map(user => user.id === userId
          ? {
            ...user,
            role,
            customRoleId: customRole?.id,
            customRoleName: customRole?.name,
            companyName,
            departments,
            department: legacyDepartment,
            permissions: undefined,
            version,
            updatedAt,
          }
          : user),
        backend: {
          ...current.backend,
          status: 'live',
          isSaving: false,
          hasRemoteUpdate: false,
          hasLocalChanges: false,
          pendingMutations: 0,
          pendingCommandType: undefined,
          workspaceVersion: result.workspaceVersion,
          remoteVersion: result.workspaceVersion,
          lastSavedAt: updatedAt,
          lastSyncedAt: updatedAt,
          error: undefined,
          conflict: undefined,
          message: 'Saved.',
        },
      }));
      workspaceMutationRuntime.isApplyingRemoteSnapshot = false;
      return { ok: true };
    }

    apply(current => ({
      users: current.users.map(user => user.id === userId
        ? {
          ...user,
          role,
          customRoleId: customRole?.id,
          customRoleName: customRole?.name,
          companyName,
          departments,
          department: legacyDepartment,
          permissions: undefined,
          updatedAt: new Date().toISOString(),
        }
        : user),
    }));
    return { ok: true };
  },
  updateMemberDepartments: async (userId, requestedDepartments) => {
    const sessionToken = captureWorkspaceSession();
    const apply: typeof set = (patch) => { if (isWorkspaceSessionCurrent(sessionToken)) set(patch); };

    const state = get();
    if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };
    if (!canCreateUsers(state.currentUser, state.rolePermissions)) {
      return { ok: false, error: 'Only Boss Koo can manage member departments.' };
    }

    const targetUser = state.users.find(user => user.id === userId);
    if (!targetUser) return { ok: false, error: 'User account was not found.' };
    if (targetUser.role === 'Client') {
      return { ok: false, error: 'Client accounts remain assigned only to Client.' };
    }

    const departments = normalizeMemberDepartments(targetUser.role, requestedDepartments);
    if (departments.length === 0 && targetUser.role !== 'Project Manager') {
      return { ok: false, error: 'Choose at least one department.' };
    }
    const currentDepartments = normalizeMemberDepartments(
      targetUser.role,
      targetUser.departments,
      targetUser.department,
    );
    if (
      departments.length === currentDepartments.length
      && departments.every((department, index) => department === currentDepartments[index])
    ) {
      return { ok: true };
    }

    if (shouldUseSecureSupabase()) {
      const previousStatus = state.backend.status;
      apply(current => ({
        backend: {
          ...current.backend,
          status: 'saving',
          isSaving: true,
          error: undefined,
          message: 'Saving member departments.',
        },
      }));
      const result = await saveSecureMemberDepartments(targetUser, departments);
      if (result.ok === false) {
        const terminal = isTerminalMemberMutationError(result.code);
        const hasRetainedMutation = Boolean(getRetainedSecureMemberMutation());
        apply(current => ({
          backend: {
            ...current.backend,
            status: terminal
              ? previousStatus
              : result.code === 'CONFLICT'
                ? 'conflict'
                : result.code === 'OFFLINE'
                  ? 'offline'
                  : 'retry_required',
            isSaving: false,
            pendingMutations: hasRetainedMutation
              ? Math.max(1, current.backend.pendingMutations)
              : current.backend.pendingMutations,
            error: terminal ? undefined : result.error,
            conflict: result.conflict,
            message: terminal ? current.backend.message : result.error,
          },
        }));
        return { ok: false, code: result.code, error: result.error };
      }

      const updatedAt = result.data.member?.updated_at || new Date().toISOString();
      const version = Number(result.data.member?.version) || Math.max(1, Number(targetUser.version) || 1) + 1;
      workspaceMutationRuntime.isApplyingRemoteSnapshot = true;
      apply(current => ({
        users: current.users.map(user => user.id === userId
          ? {
            ...user,
            departments,
            department: getLegacyDepartmentMirror(user.role, departments),
            version,
            updatedAt,
          }
          : user),
        backend: {
          ...current.backend,
          status: 'live',
          isSaving: false,
          hasRemoteUpdate: false,
          hasLocalChanges: false,
          pendingMutations: 0,
          pendingCommandType: undefined,
          workspaceVersion: result.workspaceVersion,
          remoteVersion: result.workspaceVersion,
          lastSavedAt: updatedAt,
          lastSyncedAt: updatedAt,
          error: undefined,
          conflict: undefined,
          message: 'Saved.',
        },
      }));
      workspaceMutationRuntime.isApplyingRemoteSnapshot = false;
      return { ok: true };
    }

    apply(current => ({
      users: current.users.map(user => user.id === userId
        ? {
          ...user,
          departments,
          department: getLegacyDepartmentMirror(user.role, departments),
          updatedAt: new Date().toISOString(),
        }
        : user),
    }));
    return { ok: true };
  },
  updateMemberPermissions: async (userId, requestedPermissions) => {
    const sessionToken = captureWorkspaceSession();
    const apply: typeof set = (patch) => { if (isWorkspaceSessionCurrent(sessionToken)) set(patch); };

    const state = get();
    if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };
    if (!canCreateUsers(state.currentUser, state.rolePermissions)) {
      return { ok: false, error: 'Only Boss Koo can manage Staff and HOD permissions.' };
    }

    const targetUser = state.users.find(user => user.id === userId);
    if (!targetUser) return { ok: false, error: 'User account was not found.' };
    if (!['Staff', 'HOD'].includes(targetUser.role) || isBossKoo(targetUser)) {
      return { ok: false, error: 'Only Staff and HOD permissions can be customized.' };
    }

    const permissions = requestedPermissions
      ? sanitizeRolePermissions(requestedPermissions, targetUser.role, { departmentScoped: isDepartmentScopedUser(targetUser, state.rolePermissions) })
      : undefined;
    if (permissions && !Object.values(permissions).some(Boolean)) {
      return { ok: false, error: 'Choose at least one permission or reset to role defaults.' };
    }

    if (shouldUseSecureSupabase()) {
      const previousStatus = state.backend.status;
      apply(current => ({
        backend: {
          ...current.backend,
          status: 'saving',
          isSaving: true,
          error: undefined,
          message: 'Saving member permissions.',
        },
      }));
      const result = await saveSecureMemberPermissions(targetUser, permissions || null);
      if (result.ok === false) {
        const terminal = isTerminalMemberMutationError(result.code);
        const hasRetainedMutation = Boolean(getRetainedSecureMemberMutation());
        apply(current => ({
          backend: {
            ...current.backend,
            status: terminal
              ? previousStatus
              : result.code === 'CONFLICT'
                ? 'conflict'
                : result.code === 'OFFLINE'
                  ? 'offline'
                  : 'retry_required',
            isSaving: false,
            pendingMutations: hasRetainedMutation
              ? Math.max(1, current.backend.pendingMutations)
              : current.backend.pendingMutations,
            error: terminal ? undefined : result.error,
            conflict: result.conflict,
            message: result.error,
          },
        }));
        return { ok: false, code: result.code, error: result.error };
      }

      const updatedAt = result.data.member?.updated_at || new Date().toISOString();
      const version = Number(result.data.member?.version) || Math.max(1, Number(targetUser.version) || 1) + 1;
      workspaceMutationRuntime.isApplyingRemoteSnapshot = true;
      apply(current => ({
        users: current.users.map(user => user.id === userId
          ? { ...user, permissions, version, updatedAt }
          : user),
        backend: {
          ...current.backend,
          status: 'live',
          isSaving: false,
          hasRemoteUpdate: false,
          hasLocalChanges: false,
          pendingMutations: 0,
          pendingCommandType: undefined,
          workspaceVersion: result.workspaceVersion,
          remoteVersion: result.workspaceVersion,
          lastSavedAt: updatedAt,
          lastSyncedAt: updatedAt,
          error: undefined,
          conflict: undefined,
          message: 'Saved.',
        },
      }));
      workspaceMutationRuntime.isApplyingRemoteSnapshot = false;
      return { ok: true };
    }

    apply(current => ({
      users: current.users.map(user => user.id === userId
        ? { ...user, permissions, updatedAt: new Date().toISOString() }
        : user),
    }));
    return { ok: true };
  },
  approveRegistration: (id, role, departmentsInput, companyName, customRoleId) => {
    const state = get();
    if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };
    if (!canApproveRegistrations(state.currentUser, state.rolePermissions)) return { ok: false, error: 'Only Boss Koo can approve registrations.' };

    const reg = state.registrations.find(r => r.id === id);
    if (!reg) return { ok: false, error: 'Registration not found.' };
    if (reg.status !== 'Pending') return { ok: false, error: 'This registration has already been reviewed.' };
    const selectedCustomRole = customRoleId
      ? state.rolePermissions.find(item => item.id === customRoleId)
      : undefined;
    if (customRoleId && !selectedCustomRole) return { ok: false, error: 'Custom role was not found.' };
    if (selectedCustomRole && selectedCustomRole.baseRole !== role) {
      return { ok: false, error: `This role can only be assigned to ${selectedCustomRole.baseRole} members.` };
    }
    if (shouldUseSecureSupabase()) {
      set(current => ({
        registrations: current.registrations.map(r => r.id === id ? { ...r, status: 'Approved' } : r),
      }));
      return { ok: true };
    }
    const customRole = selectedCustomRole;
    const departments = normalizeMemberDepartments(role, departmentsInput);
    if (departments.length === 0 && role !== 'Project Manager') return { ok: false, error: 'Choose at least one department before approving this member.' };

    const duplicate = state.users.some(user => (
      user.name.toLowerCase() === reg.name.toLowerCase() ||
      (reg.email && user.email?.toLowerCase() === reg.email.toLowerCase())
    ));
    if (duplicate) return { ok: false, error: 'A member with this name or email already exists. Review the registration before approving.' };

    const userId = nowId('U');
    const newUser: User = {
      id: userId,
      name: reg.name,
      email: reg.email,
      phone: reg.phone,
      jobPosition: reg.jobPosition,
      mustResetPassword: true,
      role,
      departments,
      department: getLegacyDepartmentMirror(role, departments),
      companyName,
      customRoleId: customRole?.id,
      customRoleName: customRole?.name,
      avatar: `https://i.pravatar.cc/150?u=${reg.name.replace(/\s/g, '')}`,
      updatedAt: new Date().toISOString()
    };

    void setLocalUserPassword(userId, DEFAULT_USER_PASSWORD).catch(() => undefined);

    set(current => ({
      registrations: current.registrations.map(r => r.id === id ? { ...r, status: 'Approved' } : r),
      users: [...current.users, newUser]
    }));
    return { ok: true };
  },
  rejectRegistration: (id) => {
    let result: MutationActionResult = { ok: false, error: 'Unable to reject this registration.' };
    set((state) => {
      if (isWorkspaceMutationLocked(state)) {
        useToastStore.getState().addToast(pendingMutationMessage, 'warning');
        result = { ok: false, error: pendingMutationMessage };
        return state;
      }
      if (!canApproveRegistrations(state.currentUser, state.rolePermissions)) {
        result = { ok: false, error: 'Only Boss Koo can reject registrations.' };
        return state;
      }
      const registration = state.registrations.find(item => item.id === id);
      if (!registration) {
        result = { ok: false, error: 'Registration not found.' };
        return state;
      }
      if (registration.status !== 'Pending') {
        result = { ok: false, error: 'This registration has already been reviewed.' };
        return state;
      }
      result = { ok: true };
      return {
        registrations: state.registrations.map(r => r.id === id ? { ...r, status: 'Rejected' } : r)
      };
    });
    return result;
  },
  requestMemberDeactivation: async (userId) => {
    const state = get();
    const actor = state.currentUser;
    const target = state.users.find(user => user.id === userId);
    if (!actor || actor.role !== 'Project Manager' || isBossKoo(actor)) return { ok: false, error: 'Project Manager access is required.' };
    if (!target || !['HOD', 'Staff'].includes(target.role) || target.isSuperAdmin) return { ok: false, error: 'This account is not eligible for a deactivation request.' };
    const actorProjects = state.projects.filter(project => project.projectManagerIds?.includes(actor.id));
    if (!actorProjects.some(project => project.hodMemberIds?.includes(userId) || project.staffMemberIds?.includes(userId))) {
      return { ok: false, error: 'This member is outside your assigned project scope.' };
    }
    if (shouldUseSecureSupabase()) {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session?.access_token) return { ok: false, error: 'Your secure session has expired. Sign out, then sign in again.' };
      const { error } = await supabase.functions.invoke('invite-aitask-member', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { action: 'request_member_deactivation', memberId: userId, commandId: crypto.randomUUID() },
      });
      if (error) return { ok: false, error: await getFunctionErrorMessage(error, 'Unable to request account deactivation.') };
      return { ok: true };
    }
    set(current => ({
      notifications: [...current.notifications, ...current.users.filter(isBossKoo).map(boss => makeNotification({
        targetUserId: boss.id,
        title: 'Account Deactivation Requested',
        message: `${actor.name} requested deactivation of ${target.name}. Review all project memberships before acting.`,
        route: { page: 'approvals', entityId: target.id },
        iconType: 'alert',
      }))]
    }));
    return { ok: true };
  },
  deleteUser: async (userId) => {
    const sessionToken = captureWorkspaceSession();
    const apply: typeof set = (patch) => { if (isWorkspaceSessionCurrent(sessionToken)) set(patch); };

    const state = get();
    const targetUser = state.users.find(user => user.id === userId);

    if (!canDeleteUser(state.currentUser, targetUser, state.rolePermissions)) {
      const error = !targetUser
        ? 'User account was not found.'
        : targetUser.id === state.currentUser?.id
          ? 'You cannot delete your own account.'
          : isBossKoo(targetUser)
            ? 'Protected super admin accounts cannot be deleted.'
            : 'Only Boss Koo can delete members.';

      return { ok: false, error };
    }

    if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };

    if (shouldUseSecureSupabase()) {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session?.access_token) {
        return { ok: false, error: 'Your secure session has expired. Sign out, then sign in again.' };
      }
      const { error } = await supabase.functions.invoke('invite-aitask-member', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { action: 'delete_member', memberId: userId },
      });
      if (!isWorkspaceSessionCurrent(sessionToken)) return { ok: false, error: 'Your session changed. Sign in again.' };
      if (error) return { ok: false, error: await getFunctionErrorMessage(error, 'Unable to delete the member account.') };
      try {
        clearLocalUserPassword(userId);
      } catch {
        /* credential storage unavailable */
      }
      if (!get().backend.hasLocalChanges && get().backend.pendingMutations === 0) {
        await get().pullBackendNow({ force: true, silent: true });
      }
      return { ok: true };
    }

    apply((current) => {
      const notification = makeNotification({
        targetUserId: state.currentUser?.id,
        title: 'Member Removed',
        message: `${state.currentUser?.name || 'Super admin'} removed ${targetUser?.name}. ${state.tasks.some(task => task.assignedTo === userId) ? 'Their assigned tasks are now unassigned.' : ''}`,
        route: { page: 'approvals' },
        iconType: 'alert'
      });

      return {
        users: current.users.filter(user => user.id !== userId),
        deletedUserIds: Array.from(new Set([...(current.deletedUserIds || []), userId])),
        tasks: current.tasks.map(task => task.assignedTo === userId
          ? { ...task, assignedTo: '', updatedAt: new Date().toISOString() }
          : task
        ),
        notifications: [
          ...(notification ? [notification] : []),
          ...(current.notifications || []).filter(notification => notification.targetUserId !== userId)
        ],
      };
    });
    try {
      clearLocalUserPassword(userId);
    } catch {
      /* credential storage unavailable */
    }

    return { ok: true };
  }
});
