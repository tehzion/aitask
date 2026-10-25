import { completeSecurePasswordSetup, loadSecureBackendCapabilities, loadSecureWorkspace, overlayRetainedWorkspaceEntities, restoreSecureMemberMutation, restoreSecureWorkspaceCommand } from '../../../infrastructure/api/secureWorkspace';
import { isWorkspaceMutationLocked, pendingMutationMessage } from '../../../infrastructure/commands/mutationGuard';
import { getBackendStatus } from '../../../infrastructure/config/backend';
import {
  resolveAuthEmail,
  shouldUseSecureSupabase,
  supabase
} from '../../../infrastructure/database/supabaseClient';
import { workspaceMutationRuntime } from '../../../infrastructure/persistence/workspaceMutationRuntime';
import { captureWorkspaceSession, invalidateWorkspaceSession, isWorkspaceSessionCurrent } from '../../../infrastructure/persistence/workspaceSession';
import { makeWorkspacePatch } from '../../../infrastructure/persistence/workspaceSnapshot';
import { safeAvatarSource } from '../../../infrastructure/serialization/security';
import {
  type LoginResult,
  type User
} from '../../../shared/types/index';
import { type StoreState, type WorkspaceGet, type WorkspaceSet } from '../../../shared/types/workspaceStore';
import { userFacingText } from '../../../shared/utils/userFacingMessage';
import { cleanAccountEmail, getFunctionErrorMessage, profileEmailPattern } from '../../../shared/validation/workspaceInput';
import { normalizeUserAccount, stripPassword } from '../../users/application/memberNormalization';
import { canLoginWithSeedAccount, classifyLoginFailure, isValidRecoveryEmail, loginFailure, shouldShowDemoLogin } from '../domain/auth';
import {
  clearPasswordSetupMode,
  getPasswordSetupMode,
  passwordSetupRedirectUrl,
} from '../domain/authRecovery';
import { setLocalUserPassword, verifyLocalUserPassword } from '../domain/localCredentials';
export const createAuthenticationActions = (set: WorkspaceSet, get: WorkspaceGet, { clearWorkspaceSession, startBackendAutoSync }: { clearWorkspaceSession: () => void; startBackendAutoSync: () => void }): Pick<StoreState, "login" | "requestPasswordRecovery" | "completePasswordSetup" | "updateCurrentUserProfile" | "updateCurrentUserEmail" | "updateCurrentUserPassword"> => ({
  login: async (name, password): Promise<LoginResult> => {
    if (shouldUseSecureSupabase() && get().currentUser) clearWorkspaceSession();
    invalidateWorkspaceSession();
    const sessionToken = captureWorkspaceSession();
    if (shouldUseSecureSupabase()) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: resolveAuthEmail(name),
        password: password || '',
      });
      if (!isWorkspaceSessionCurrent(sessionToken)) return loginFailure('workspace_load_failed');
      if (error || !data.user) {
        return loginFailure(classifyLoginFailure(error?.message || ''));
      }
      // A normal sign-in always discards any password-setup link mode left
      // over from an abandoned invite/recovery link in this tab.
      clearPasswordSetupMode();

      try {
        const retainedBeforeLogin = restoreSecureWorkspaceCommand(data.user.id);
        const retainedMemberBeforeLogin = restoreSecureMemberMutation(data.user.id);
        const [secure, compatibility] = await Promise.all([
          loadSecureWorkspace(data.user, { preserveRetainedCommand: true }),
          loadSecureBackendCapabilities(),
        ]);
        if (!isWorkspaceSessionCurrent(sessionToken)) return loginFailure('workspace_load_failed');
        const restoredWorkspace = retainedBeforeLogin
          ? overlayRetainedWorkspaceEntities(secure.state, secure.state, retainedBeforeLogin.operations)
          : secure.state;
        const restoredCurrentUser = restoredWorkspace.users.find(member => member.id === secure.currentUser.id)
          || secure.currentUser;
        workspaceMutationRuntime.isApplyingRemoteSnapshot = true;
        const hasRetainedChange = retainedBeforeLogin !== null || retainedMemberBeforeLogin !== null;
        set((state) => ({
          ...makeWorkspacePatch(state, {
            state: restoredWorkspace,
            source: 'supabase',
            version: 1,
            message: 'Secure workspace loaded.',
          }),
          currentUser: restoredCurrentUser,
          backend: {
            ...state.backend,
            status: compatibility.compatible
              ? (hasRetainedChange ? 'retry_required' : 'live')
              : compatibility.retryable ? 'retry_required' : 'upgrade_required',
            isLoading: false,
            workspaceVersion: secure.revision.version,
            remoteVersion: secure.revision.version,
            remoteUpdatedAt: secure.revision.updatedAt,
            lastPulledAt: new Date().toISOString(),
            pendingMutations: hasRetainedChange ? 1 : 0,
            pendingCommandType: hasRetainedChange ? retainedBeforeLogin?.type : undefined,
            hasLocalChanges: hasRetainedChange,
            upgradeRequired: !compatibility.compatible && !compatibility.retryable,
            error: compatibility.compatible ? undefined : compatibility.error,
            message: compatibility.compatible
              ? hasRetainedChange
                ? "You're signed in. Review and retry your unsaved change."
                : "You're securely connected."
              : compatibility.error,
          },
        }));
        workspaceMutationRuntime.isApplyingRemoteSnapshot = false;
        if (typeof window !== 'undefined') startBackendAutoSync();
        return { ok: true };
      } catch (loadError) {
        workspaceMutationRuntime.isApplyingRemoteSnapshot = false;
        if (!isWorkspaceSessionCurrent(sessionToken)) return loginFailure('workspace_load_failed');
        await supabase.auth.signOut({ scope: 'local' });
        const message = loadError instanceof Error ? loadError.message : String(loadError || '');
        return loginFailure(classifyLoginFailure(message, 'workspace'));
      }
    }

    // Match by name (case-insensitive) — never expose user IDs to the login UI
    const user = get().users.find(u => u.name.toLowerCase() === name.trim().toLowerCase());
    if (!user) return loginFailure('invalid_credentials');
    if (!canLoginWithSeedAccount(user.id)) return loginFailure('invalid_credentials');

    const normalizedUser = normalizeUserAccount(user);
    let isValid = false;
    try {
      isValid = await verifyLocalUserPassword(normalizedUser.id, password || '', {
        allowDefaultPassword: shouldShowDemoLogin() && !getBackendStatus().isHostedRuntime,
      });
    } catch {
      return loginFailure('workspace_load_failed');
    }
    if (!isWorkspaceSessionCurrent(sessionToken)) return loginFailure('workspace_load_failed');
    if (!isValid) {
      return loginFailure('invalid_credentials');
    }

    const nextUser = {
      ...normalizedUser,
      mustResetPassword: Boolean(normalizedUser.mustResetPassword),
    };

    // Strip sensitive fields before placing in currentUser session state
    set((state) => ({
      currentUser: stripPassword(nextUser) as User,
      users: state.users.map(account => (
        account.id === user.id ? nextUser : account
      )),
    }));
    if (typeof window !== 'undefined') startBackendAutoSync();
    return { ok: true };
  },
  requestPasswordRecovery: async (email) => {
    if (!shouldUseSecureSupabase()) {
      const normalized = email.trim().toLowerCase();
      const localAccount = get().users.find(user => user.email?.trim().toLowerCase() === normalized);
      if (localAccount?.isSuperAdmin) {
        return {
          ok: false,
          error: 'Local demo accounts sign in with the default password until a custom one is set. If a custom password was forgotten, clear the browser\'s AiTask data (site data for this app) and sign in with the default password again.',
        };
      }
      return { ok: false, error: 'Password recovery is available for secure hosted accounts only.' };
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return { ok: false, error: 'You are offline. Reconnect before requesting a password email.' };
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!isValidRecoveryEmail(normalizedEmail)) return { ok: true };

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: passwordSetupRedirectUrl(),
      });
      if (error) {
        if (/fetch|network|offline/i.test(error.message)) {
          return { ok: false, error: 'The recovery service could not be reached. Please try again.' };
        }
        // Rate limits, SMTP and configuration failures must not be reported
        // as a sent email; Supabase already keeps unknown emails silent.
        return { ok: false, error: userFacingText(error, 'The recovery service could not be reached. Please try again.') };
      }
      return { ok: true };
    } catch {
      return { ok: false, error: 'The recovery service could not be reached. Please try again.' };
    }
  },
  completePasswordSetup: async (data) => {
    const sessionToken = captureWorkspaceSession();
    const apply: typeof set = (patch) => { if (isWorkspaceSessionCurrent(sessionToken)) set(patch); };

    if (!shouldUseSecureSupabase()) {
      return { ok: false, error: 'This password link is only valid for secure hosted accounts.' };
    }
    if (!getPasswordSetupMode()) {
      return { ok: false, error: 'This password link is invalid or has already been used.' };
    }

    const newPassword = data.newPassword.trim();
    if (newPassword.length < 12) {
      return { ok: false, error: 'Use a password with at least 12 characters.' };
    }
    if (newPassword !== data.confirmPassword.trim()) {
      return { ok: false, error: 'Passwords do not match.' };
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return { ok: false, error: 'You are offline. Reconnect before setting your password.' };
    }

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      return { ok: false, error: 'This password link has expired. Request a new email from Login.' };
    }

    const { error: passwordError } = await supabase.auth.updateUser({ password: newPassword });
    if (passwordError) return { ok: false, error: passwordError.message };

    const currentUser = get().currentUser;
    if (currentUser?.mustResetPassword) {
      const persisted = await completeSecurePasswordSetup();
      if (persisted.ok === false) {
        return {
          ok: false,
          error: persisted.error || 'The password changed, but account setup could not be finalized. Sign in with your new password and retry.',
        };
      }
      const now = new Date().toISOString();
      apply((state) => ({
        currentUser: state.currentUser
          ? { ...state.currentUser, mustResetPassword: false, updatedAt: now }
          : null,
        users: state.users.map(member => member.id === currentUser.id
          ? { ...member, mustResetPassword: false, updatedAt: now }
          : member),
        backend: {
          ...state.backend,
          workspaceVersion: persisted.workspaceVersion,
          remoteVersion: persisted.workspaceVersion,
          lastSavedAt: now,
          lastSyncedAt: now,
        },
      }));
      if (!get().backend.hasLocalChanges && get().backend.pendingMutations === 0) {
        await get().pullBackendNow({ force: true, silent: true });
      }
    }

    clearPasswordSetupMode();
    return { ok: true };
  },
  updateCurrentUserProfile: (data) => {
    const currentUser = get().currentUser;
    if (!currentUser) return { ok: false, error: 'You must be logged in to update your profile.' };
    if (isWorkspaceMutationLocked(get())) return { ok: false, error: pendingMutationMessage };

    const name = data.name.trim();
    const email = cleanAccountEmail(data.email);
    const avatar = data.avatar?.trim() ? safeAvatarSource(data.avatar) : undefined;

    if (!name) return { ok: false, error: 'Name is required.' };
    if (email && !profileEmailPattern.test(email)) {
      return { ok: false, error: 'Enter a valid email address.' };
    }

    const duplicate = get().users.some(user => (
      user.id !== currentUser.id &&
      (
        user.name.toLowerCase() === name.toLowerCase() ||
        (email && user.email?.trim().toLowerCase() === email)
      )
    ));
    if (duplicate) return { ok: false, error: 'Another user already uses that name or email.' };

    if (data.avatar?.trim() && !avatar) {
      return { ok: false, error: 'Avatar must be an uploaded photo, app image, generated avatar, or image link.' };
    }
    if (shouldUseSecureSupabase() && email !== cleanAccountEmail(currentUser.email)) {
      return { ok: false, error: 'Confirm the login email change with your current password first.' };
    }

    const now = new Date().toISOString();
    const nextCurrentUser: User = {
      ...currentUser,
      name,
      email,
      avatar,
      updatedAt: now,
    };

    set((state) => ({
      currentUser: nextCurrentUser,
      users: state.users.map(user => (
        user.id === currentUser.id
          ? { ...user, name, email, avatar, updatedAt: now }
          : user
      )),
    }));

    return { ok: true };
  },
  updateCurrentUserEmail: async (nextEmail, currentPassword) => {
    const currentUser = get().currentUser;
    if (!currentUser) return { ok: false, error: 'You must be logged in to update your email.' };
    if (isWorkspaceMutationLocked(get())) return { ok: false, error: pendingMutationMessage };

    const email = cleanAccountEmail(nextEmail);
    if (!email || !profileEmailPattern.test(email)) return { ok: false, error: 'Enter a valid email address.' };
    if (!currentPassword) return { ok: false, error: 'Enter your current password to change the login email.' };
    if (email === cleanAccountEmail(currentUser.email)) return { ok: true };
    if (get().users.some(user => user.id !== currentUser.id && cleanAccountEmail(user.email) === email)) {
      return { ok: false, error: 'Another user already uses that email.' };
    }

    if (!shouldUseSecureSupabase()) {
      let isValid = false;
      try {
        isValid = await verifyLocalUserPassword(currentUser.id, currentPassword, {
          allowDefaultPassword: shouldShowDemoLogin() && !getBackendStatus().isHostedRuntime,
        });
      } catch {
        isValid = false;
      }
      if (!isValid) return { ok: false, error: 'The current password is incorrect.' };
      const result = get().updateCurrentUserProfile({
        name: currentUser.name,
        email,
        avatar: currentUser.avatar,
      });
      return result;
    }

    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session?.access_token) {
      return { ok: false, error: 'Your secure session has expired. Sign out, then sign in again.' };
    }

    const { data, error } = await supabase.functions.invoke('invite-aitask-member', {
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: { action: 'update_self_email', email, currentPassword },
    });
    if (error) return { ok: false, error: await getFunctionErrorMessage(error, 'Unable to update the login email.') };

    const { error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) {
      return { ok: false, error: 'Email updated, but your session could not be refreshed. Sign out, then sign in again.' };
    }
    if (!get().backend.hasLocalChanges && get().backend.pendingMutations === 0) {
      await get().pullBackendNow({ force: true, silent: true });
    }
    return {
      ok: true,
      emailConfirmationRequired: data?.emailConfirmationRequired === true,
      pendingEmail: typeof data?.pendingEmail === 'string' ? data.pendingEmail : undefined,
    };
  },
  updateCurrentUserPassword: async (data) => {
    const sessionToken = captureWorkspaceSession();
    const apply: typeof set = (patch) => { if (isWorkspaceSessionCurrent(sessionToken)) set(patch); };

    const currentUser = get().currentUser;
    if (!currentUser) return { ok: false, error: 'You must be logged in to update your password.' };
    if (isWorkspaceMutationLocked(get())) return { ok: false, error: pendingMutationMessage };

    if (shouldUseSecureSupabase()) {
      const currentPassword = data.currentPassword || '';
      const newPassword = data.newPassword.trim();
      if (newPassword.length < 12) return { ok: false, error: 'New password must be at least 12 characters.' };
      if (newPassword !== data.confirmPassword.trim()) {
        return { ok: false, error: 'New password and confirmation do not match.' };
      }
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user?.email) return { ok: false, error: 'Your secure session has expired.' };
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (reauthError) return { ok: false, error: 'Current password is incorrect.' };
      const { error: passwordError } = await supabase.auth.updateUser({ password: newPassword });
      if (passwordError) return { ok: false, error: passwordError.message };
      const persisted = await completeSecurePasswordSetup();
      if (persisted.ok === false) {
        return {
          ok: false,
          error: persisted.error || 'The password changed, but account setup could not be finalized. Sign in with your new password and retry.',
        };
      }
      const now = new Date().toISOString();
      apply((state) => ({
        currentUser: state.currentUser ? { ...state.currentUser, mustResetPassword: false, updatedAt: now } : null,
        users: state.users.map(member => member.id === currentUser.id
          ? { ...member, mustResetPassword: false, updatedAt: now }
          : member),
        backend: {
          ...state.backend,
          workspaceVersion: persisted.workspaceVersion,
          remoteVersion: persisted.workspaceVersion,
          lastSavedAt: now,
          lastSyncedAt: now,
        },
      }));
      if (!get().backend.hasLocalChanges && get().backend.pendingMutations === 0) {
        await get().pullBackendNow({ force: true, silent: true });
      }
      return { ok: true };
    }

    const account = get().users.find(user => user.id === currentUser.id);
    if (!account) return { ok: false, error: 'User account was not found.' };

    const currentPassword = data.currentPassword || '';
    const newPassword = data.newPassword.trim();
    const confirmPassword = data.confirmPassword.trim();
    const normalizedAccount = normalizeUserAccount(account);

    let isCurrentValid = false;
    try {
      isCurrentValid = await verifyLocalUserPassword(normalizedAccount.id, currentPassword, {
        allowDefaultPassword: shouldShowDemoLogin() && !getBackendStatus().isHostedRuntime,
      });
    } catch {
      return { ok: false, error: 'This browser could not verify the current password.' };
    }
    if (!isCurrentValid) {
      return { ok: false, error: 'Current password is incorrect.' };
    }
    if (newPassword.length < 12) {
      return { ok: false, error: 'New password must be at least 12 characters.' };
    }
    if (newPassword !== confirmPassword) {
      return { ok: false, error: 'New password and confirmation do not match.' };
    }
    const isNewSameAsCurrent = await verifyLocalUserPassword(normalizedAccount.id, newPassword, {
      allowDefaultPassword: shouldShowDemoLogin() && !getBackendStatus().isHostedRuntime,
    });
    if (isNewSameAsCurrent) {
      return { ok: false, error: 'New password must be different from the current password.' };
    }

    const now = new Date().toISOString();
    try {
      await setLocalUserPassword(currentUser.id, newPassword);
    } catch {
      return { ok: false, error: 'This browser could not save the new password.' };
    }
    apply((state) => ({
      currentUser: {
        ...currentUser,
        mustResetPassword: false,
        updatedAt: now,
      },
      users: state.users.map(user => (
        user.id === currentUser.id
          ? { ...stripPassword(user as User & { password?: string }) as User, mustResetPassword: false, updatedAt: now }
          : user
      )),
    }));

    return { ok: true };
  }
});
