import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { BACKEND_UPGRADE_REQUIRED_MESSAGE, SECURE_WORKSPACE_ID } from '../../infrastructure/api/workspaceContracts';
import { discardRetainedSecureMemberMutation, discardSecureWorkspaceCommand, getRetainedSecureCommand, getRetainedSecureMemberMutation, isWorkspaceConflict, loadSecureBackendCapabilities, loadSecureWorkspace, loadSecureWorkspaceRevision, overlayRetainedWorkspaceEntities, rebaseRetryableCommand, restoreSecureMemberMutation, restoreSecureWorkspaceCommand, retryRetainedSecureMemberMutation, retrySecureWorkspaceCommand, saveSecureWorkspace } from '../../infrastructure/api/secureWorkspace';
import { hasRetainedSecureMutation, isPullBlockedByPendingChange, isSyncBusy, isTerminalMemberMutationError, isTerminalMutationError, pendingMutationMessage } from '../../infrastructure/commands/mutationGuard';
import { getBackendStatus, shouldUseSupabase } from '../../infrastructure/config/backend';
import {
  shouldUseSecureSupabase,
  subscribeToCurrentMemberAccessChanges,
  subscribeToWorkspaceRevisionChanges,
  subscribeToWorkspaceTaskChanges,
  supabase
} from '../../infrastructure/database/supabaseClient';
import { configureBackendWarnings } from '../../infrastructure/observability/backendWarnings';
import { recordDiagnostic } from '../../infrastructure/observability/diagnostics';
import { workspaceMutationRuntime } from '../../infrastructure/persistence/workspaceMutationRuntime';
import { captureWorkspaceSession, invalidateWorkspaceSession, isWorkspaceSessionCurrent } from '../../infrastructure/persistence/workspaceSession';
import { excludedServiceMetadataEntityTypes, makeBackendRuntimeState, makeWorkspacePatch, mergePersistedWorkspace, selectPersistedWorkspaceState, workspaceMutationFields, workspaceStatesEqual } from '../../infrastructure/persistence/workspaceSnapshot';
import { createDemoActions } from '../../mock/demoActions';
import { mockProjects, mockTasks, mockUsers } from '../../mock/index';
import { createAuthenticationActions } from '../../modules/authentication/application/authenticationActions';
import {
  clearPasswordSetupMode
} from '../../modules/authentication/domain/authRecovery';
import { createClientsActions } from '../../modules/clients/application/clientsActions';
import { createNotificationsActions } from '../../modules/notifications/application/notificationsActions';
import { createProjectsActions } from '../../modules/projects/application/projectsActions';
import { createServicesActions } from '../../modules/services/application/servicesActions';
import { migrateLegacyPlanSchedules } from '../../modules/services/domain/monthlyRecords';
import {
  SHORT_VIDEO_WORKFLOW_TEMPLATE
} from '../../modules/services/domain/serviceManagement';
import { createTasksActions } from '../../modules/tasks/application/tasksActions';
import { BUILTIN_BASE_ROLES, makeBuiltinRole, normalizeUserAccount, stripPassword } from '../../modules/users/application/memberNormalization';
import { createUsersActions } from '../../modules/users/application/usersActions';
import {
  getBuiltinRoleId
} from '../../shared/authorization/access';
import {
  getLegacyDepartmentMirror
} from '../../shared/authorization/departments';
import { acknowledgeActionFeedback, clearActionFeedback } from '../../shared/feedback/actionFeedback';
import { useToastStore } from '../../shared/feedback/useToastStore';
import { clearRecoveredDrafts } from '../../shared/forms/draftRecovery';
import { msg } from '../../shared/i18n/messages';
import { isWorkflowTask } from '../../shared/rules/workflowReview';
import {
  type User
} from '../../shared/types/index';
import { type StoreState } from '../../shared/types/workspaceStore';
import { userFacingText } from '../../shared/utils/userFacingMessage';
import { createAccessRefreshCoordinator } from '../lifecycle/accessRefresh';

// HODs manage execution inside an authorized project/department. These fields
// remain owned by the PM/project boundary even when a HOD can see the task and
// edit its brief, dates, priority, or assignee.

configureBackendWarnings(warning => useToastStore.getState().addToast(msg(warning === 'pending-command-storage-full' ? 'errors.storageFullPending' : 'errors.storageFullMember'), 'warning'));

const waitForSyncIdle = async (timeoutMs = 5000) => {
  if (!isSyncBusy(useStore.getState())) return true;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 50));
    if (!isSyncBusy(useStore.getState())) return true;
  }
  return !isSyncBusy(useStore.getState());
};

// Monotonic counter of local workspace mutations. A pull captures it before its
// network work and refuses to overwrite edits that landed while it was in flight.

// Capabilities authorize an operation; PM ownership authorizes its target.
// Recheck current scope at the mutation boundary, including after an owner transfer.

// Check the destination before the new task relationship can grant access.
// Unchanged legacy company links remain editable during routine task updates.

// Task update notices go to the people accountable for the task instead of a
// role-wide Project Manager fan-out: Boss Koo (super admin, oversight) plus
// eligible PM contacts and the PMs explicitly assigned to the linked project.
// Each PM is checked against the same project scope used for task visibility.
// Include the displayed
// task contact (the person who assigned or created the work) whenever they can
// still view the task, so a department-scoped lead who delegated work is not
// left dark. Reviewers get their own transactional handoff and are filtered by
// the caller on submission to avoid duplicate notices.

// Hosted review handoffs are generated atomically by the database. Mirror them
// only in local workspaces, so cached clients and the full editor behave alike.

// Service package/workflow/pricing rows are only readable with the matching
// manage/view permission. Without this, a member who cannot read them still
// carries the locally seeded default template and every save tries to insert a
// row they are not allowed to create (HOD and Staff hit this).

const PERSIST_KEY = 'market-task-storage';

let browserPersistFailed = false;
const safeStorageAdapter: StateStorage = {
  getItem: (name) => {
    try { return window.localStorage.getItem(name); } catch { return null; }
  },
  setItem: (name, value) => {
    try { window.localStorage.setItem(name, value); browserPersistFailed = false; }
    catch {
      browserPersistFailed = true;
      useToastStore.getState().addToast(msg('errors.storageFull'), 'error');
    }
  },
  removeItem: (name) => {
    try { window.localStorage.removeItem(name); } catch { /* storage unavailable */ }
  },
};

const retryLocalPersistence = async () => {
  if (typeof window === 'undefined' || !browserPersistFailed) return;
  const options = useStore.persist.getOptions();
  await options.storage?.setItem(options.name, { state: options.partialize ? options.partialize(useStore.getState()) : useStore.getState(), version: options.version });
};

export const useStore = create<StoreState>()(
  persist(
    (rawSet, get) => {
      // Mutation bookkeeping must survive a stopped realtime/auto-sync listener.
      const set: typeof rawSet = (patch) => rawSet(state => {
        const next = typeof patch === 'function' ? patch(state) : patch;
        const changed = workspaceMutationFields.some(key => key in next && next[key] !== state[key]);
        if (!changed || !state.currentUser || workspaceMutationRuntime.isApplyingRemoteSnapshot || workspaceMutationRuntime.isApplyingNotificationRead || !shouldUseSupabase() || (next.backend && next.backend.hasLocalChanges === false)) return next;
        workspaceMutationRuntime.localMutationEpoch += 1;
        return { ...next, backend: { ...(next.backend || state.backend), hasLocalChanges: true, pendingMutations: Math.max(1, (next.backend || state.backend).pendingMutations), status: 'saving' as const } };
      });
      return ({
        ...createAuthenticationActions(set, get, { clearWorkspaceSession: () => clearWorkspaceSession(), startBackendAutoSync: () => startBackendAutoSync() }),
        ...createNotificationsActions(set),
        ...createTasksActions(set, get),
        ...createProjectsActions(set, get),
        ...createClientsActions(set, get),
        ...createServicesActions(set, get),
        ...createUsersActions(set, get),
        ...createDemoActions(set, get),

        currentUser: null,
        users: mockUsers.map(user => normalizeUserAccount(user)),
        clients: [],
        projects: mockProjects,
        tasks: mockTasks,
        taskStatuses: ['Pending', 'In Progress', 'Waiting Approval', 'Completed', 'Cancelled'],
        deletedUserIds: [],
        deletedRoleIds: [],
        deletedTaskStatuses: [],
        deletedClientIds: [],
        servicePackages: [],
        clientPlans: [],
        serviceCycles: [],
        serviceCyclePayments: [],
        deliverables: [],
        cycleComments: [],
        addons: [],
        serviceWorkflowTemplates: [{ ...SHORT_VIDEO_WORKFLOW_TEMPLATE, steps: SHORT_VIDEO_WORKFLOW_TEMPLATE.steps.map(step => ({ ...step })) }],
        servicePricingSnapshots: [],
        isCreateTaskModalOpen: false,

        createTaskInitialDate: undefined,
        createTaskInitialAssignee: undefined,
        createTaskInitialClientId: undefined,
        createTaskInitialClientName: undefined,
        createTaskInitialServiceType: undefined,
        createTaskInitialCycleId: undefined,
        createTaskInitialDeliverableId: undefined,

        notifications: [],
        notificationUnreadCount: 0,
        registrations: [],
        rolePermissions: BUILTIN_BASE_ROLES.map(makeBuiltinRole),
        backend: makeBackendRuntimeState(),

        initializeBackend: async () => {
          const sessionToken = captureWorkspaceSession();
          const apply: typeof set = (patch) => { if (isWorkspaceSessionCurrent(sessionToken)) set(patch); };

          const status = getBackendStatus();
          apply({
            backend: {
              mode: status.mode,
              status: status.mode === 'local' ? 'local' : 'loading',
              isConfigured: status.configured,
              isLoading: status.mode === 'supabase' && status.configured,
              isSaving: false,
              isPulling: false,
              hasRemoteUpdate: false,
              hasLocalChanges: false,
              pendingMutations: 0,
              upgradeRequired: false,
              message: status.message,
              error: status.ready ? undefined : status.message,
            }
          });

          if (!shouldUseSupabase()) return;

          try {
            if (shouldUseSecureSupabase()) {
              const { data: { session }, error: sessionError } = await supabase.auth.getSession();
              if (!isWorkspaceSessionCurrent(sessionToken)) return;
              if (sessionError) throw sessionError;
              if (!session?.user) {
                apply((state) => ({
                  currentUser: null,
                  backend: {
                    ...state.backend,
                    status: 'live',
                    isLoading: false,
                    message: 'Sign in to load your secure workspace.',
                  },
                }));
                return;
              }

              const { data: { user: verifiedUser }, error: userError } = await supabase.auth.getUser();
              if (!isWorkspaceSessionCurrent(sessionToken)) return;
              if (userError) throw userError;
              if (!verifiedUser) throw new Error('Your session has expired. Sign in again.');

              const retained = restoreSecureWorkspaceCommand(verifiedUser.id);
              const retainedMemberMutation = restoreSecureMemberMutation(verifiedUser.id);
              const hasRetainedChange = Boolean(retained || retainedMemberMutation);
              const [secure, compatibility] = await Promise.all([
                loadSecureWorkspace(verifiedUser, { preserveRetainedCommand: true }),
                loadSecureBackendCapabilities(),
              ]);
              if (!isWorkspaceSessionCurrent(sessionToken)) return;
              const restoredWorkspace = retained
                ? overlayRetainedWorkspaceEntities(secure.state, secure.state, retained.operations)
                : secure.state;
              const restoredCurrentUser = restoredWorkspace.users.find(member => member.id === secure.currentUser.id)
                || secure.currentUser;
              const loadedAt = new Date().toISOString();
              workspaceMutationRuntime.isApplyingRemoteSnapshot = true;
              apply((state) => ({
                ...makeWorkspacePatch(state, {
                  state: restoredWorkspace,
                  source: 'supabase',
                  version: 1,
                  message: 'Secure workspace loaded.',
                  updatedAt: loadedAt,
                }),
                currentUser: restoredCurrentUser,
                notificationUnreadCount: secure.notificationFeed.unreadCount,
                backend: {
                  ...state.backend,
                  status: compatibility.compatible
                    ? (hasRetainedChange ? 'retry_required' : 'live')
                    : compatibility.retryable ? 'retry_required' : 'upgrade_required',
                  isLoading: false,
                  lastSyncedAt: loadedAt,
                  lastPulledAt: loadedAt,
                  workspaceVersion: secure.revision.version,
                  remoteVersion: secure.revision.version,
                  remoteUpdatedAt: secure.revision.updatedAt,
                  hasLocalChanges: hasRetainedChange,
                  pendingMutations: hasRetainedChange ? 1 : 0,
                  pendingCommandType: retained ? retained.type : undefined,
                  upgradeRequired: !compatibility.compatible && !compatibility.retryable,
                  error: compatibility.compatible ? undefined : compatibility.error,
                  message: compatibility.compatible
                    ? hasRetainedChange
                      ? 'Your unsaved change was restored here. Review and retry it when ready.'
                      : "You're securely connected."
                    : compatibility.error,
                },
              }));
              workspaceMutationRuntime.isApplyingRemoteSnapshot = false;
              return;
            }
          } catch (error) {
            workspaceMutationRuntime.isApplyingRemoteSnapshot = false;
            const retainedCommand = getRetainedSecureCommand();
            const retainedMemberMutation = getRetainedSecureMemberMutation();
            const hasRetainedChange = Boolean(retainedCommand || retainedMemberMutation);
            apply({
              backend: {
                mode: 'supabase',
                status: typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'retry_required',
                isConfigured: true,
                isLoading: false,
                isSaving: false,
                isPulling: false,
                hasRemoteUpdate: false,
                hasLocalChanges: hasRetainedChange,
                pendingMutations: hasRetainedChange ? 1 : 0,
                pendingCommandType: retainedCommand?.type,
                message: hasRetainedChange
                  ? "We couldn't reach the server. Your unsaved change is kept here — please retry it."
                  : "We couldn't reach the server. You can keep working; changes will sync when you're back online.",
                error: userFacingText(error, "We couldn't load your workspace. Please try again."),
              }
            });
          }
        },

        syncBackendNow: async (commandType) => {
          const sessionToken = captureWorkspaceSession();
          const apply: typeof set = (patch) => { if (isWorkspaceSessionCurrent(sessionToken)) set(patch); };

          if (!shouldUseSupabase()) return;

          const current = get();
          const pendingCommandType = commandType || current.backend.pendingCommandType;
          if (
            current.backend.upgradeRequired === true
            || current.backend.isRestoring
            || current.backend.isLoading
            || current.backend.isPulling
            || current.backend.isSaving
            || !current.backend.hasLocalChanges
          ) {
            return;
          }
          if (current.backend.hasRemoteUpdate && !shouldUseSecureSupabase()) {
            await get().pullBackendNow();
            return;
          }

          apply((state) => ({
            backend: {
              ...state.backend,
              status: 'saving',
              isSaving: true,
              pendingMutations: Math.max(1, state.backend.pendingMutations),
              pendingCommandType,
              error: undefined,
              errorCode: undefined,
            }
          }));

          try {
            const stateToSave = get();
            if (shouldUseSecureSupabase()) {
              const hadRemoteUpdate = stateToSave.backend.hasRemoteUpdate;
              const savedWorkspace = selectPersistedWorkspaceState(stateToSave);
              const result = await saveSecureWorkspace(
                savedWorkspace,
                pendingCommandType,
                stateToSave.backend.workspaceVersion,
                {
                  excludeSuperAdminEntities: !stateToSave.currentUser?.isSuperAdmin,
                  actorMemberId: stateToSave.currentUser?.id,
                  excludedEntityTypes: excludedServiceMetadataEntityTypes(stateToSave.currentUser, stateToSave.rolePermissions),
                },
              );
              if (!isWorkspaceSessionCurrent(sessionToken)) return;
              if (result.ok === false) {
                const upgradeRequired = result.error === BACKEND_UPGRADE_REQUIRED_MESSAGE;
                apply((state) => ({
                  backend: {
                    ...state.backend,
                    status: upgradeRequired
                      ? 'upgrade_required'
                      : result.code === 'CONFLICT'
                        ? 'conflict'
                        : result.code === 'OFFLINE'
                          ? 'offline'
                          : isTerminalMutationError(result.code)
                            ? 'refresh_required'
                            : 'retry_required',
                    upgradeRequired,
                    isSaving: false,
                    pendingMutations: 1,
                    conflict: result.conflict,
                    hasRemoteUpdate: result.code === 'CONFLICT' || state.backend.hasRemoteUpdate,
                    hasLocalChanges: true,
                    message: result.error,
                    error: result.error,
                    errorCode: result.code,
                  },
                }));
                return;
              }
              const syncedAt = new Date().toISOString();
              const hasChangesAfterSave = !workspaceStatesEqual(savedWorkspace, selectPersistedWorkspaceState(get()));
              apply((state) => ({
                backend: {
                  ...state.backend,
                  status: hasChangesAfterSave ? 'saving' : 'live',
                  isSaving: false,
                  lastSyncedAt: syncedAt,
                  lastSavedAt: syncedAt,
                  lastPulledAt: syncedAt,
                  workspaceVersion: Math.max(state.backend.workspaceVersion || 0, result.workspaceVersion),
                  remoteVersion: Math.max(state.backend.remoteVersion || 0, result.workspaceVersion),
                  hasRemoteUpdate: false,
                  hasLocalChanges: hasChangesAfterSave,
                  pendingMutations: hasChangesAfterSave ? 1 : 0,
                  pendingCommandType: hasChangesAfterSave ? pendingCommandType : undefined,
                  conflict: undefined,
                  error: undefined,
                  errorCode: undefined,
                  message: hasChangesAfterSave ? 'Saving newer changes.' : 'Saved.',
                },
              }));
              acknowledgeActionFeedback(get(), { tasks: savedWorkspace.tasks, clients: savedWorkspace.clients || [] });
              if (hasChangesAfterSave) queueMicrotask(() => { if (isWorkspaceSessionCurrent(sessionToken)) void get().syncBackendNow(pendingCommandType); });
              else {

                if (hadRemoteUpdate || (savedWorkspace.tasks.some(isWorkflowTask)
                  && ['task.update', 'approval.review', 'approval.revision', 'deliverable.workflow.generate'].includes(pendingCommandType || ''))) {
                  await get().pullBackendNow({ force: true, silent: true });
                }
              }
              return;
            }
          } catch (error) {
            apply((state) => ({
              backend: {
                ...state.backend,
                status: typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'retry_required',
                isSaving: false,
                pendingMutations: state.backend.hasLocalChanges ? 1 : 0,
                message: "We couldn't confirm your save yet. Your change is kept safe — please retry.",
                error: userFacingText(error, "We couldn't confirm your save. Please try again."),
                errorCode: 'RETRY_REQUIRED',
              }
            }));
          }
        },

        pullBackendNow: async (options = {}) => {
          const sessionToken = captureWorkspaceSession();
          const apply: typeof set = (patch) => { if (isWorkspaceSessionCurrent(sessionToken)) set(patch); };

          if (!shouldUseSupabase()) return;
          if (get().backend.isPulling) return;
          if (get().backend.isSaving && !options.force) return;
          if (!options.force && isPullBlockedByPendingChange(get())) return;

          apply((state) => ({
            backend: {
              ...state.backend,
              status: 'loading',
              isPulling: true,
              error: undefined,
              message: options.silent ? state.backend.message : 'Checking for the latest workspace data.',
            }
          }));
          const epochBeforeLoad = workspaceMutationRuntime.localMutationEpoch;

          try {
            if (shouldUseSecureSupabase()) {
              const { data: { user: capabilityUser }, error: capabilityUserError } = await supabase.auth.getUser();
              if (!isWorkspaceSessionCurrent(sessionToken)) return;
              if (capabilityUserError) throw capabilityUserError;
              if (!capabilityUser) throw new Error('Your session has expired. Sign in again.');
              restoreSecureWorkspaceCommand(capabilityUser.id);
              restoreSecureMemberMutation(capabilityUser.id);
              const compatibility = await loadSecureBackendCapabilities();
              if (!isWorkspaceSessionCurrent(sessionToken)) return;
              if (!compatibility.compatible) {
                apply((state) => ({
                  backend: {
                    ...state.backend,
                    status: compatibility.retryable ? 'retry_required' : 'upgrade_required',
                    isPulling: false,
                    upgradeRequired: !compatibility.retryable,
                    error: compatibility.error,
                    message: compatibility.error,
                  },
                }));
                return;
              }
              const revision = await loadSecureWorkspaceRevision();
              if (!isWorkspaceSessionCurrent(sessionToken)) return;
              const pulledAt = new Date().toISOString();
              const current = get();
              const currentVersion = current.backend.workspaceVersion || 0;
              const remoteIsNewer = revision.version > currentVersion;

              if (!options.force && (current.backend.hasLocalChanges || current.backend.pendingMutations > 0 || current.backend.status === 'conflict')) {
                apply((state) => ({
                  backend: {
                    ...state.backend,
                    status: state.backend.status === 'conflict'
                      ? 'conflict'
                      : state.backend.hasLocalChanges
                        ? 'saving'
                        : 'live',
                    isPulling: false,
                    upgradeRequired: false,
                    lastPulledAt: pulledAt,
                    remoteVersion: revision.version,
                    remoteUpdatedAt: revision.updatedAt,
                    hasRemoteUpdate: remoteIsNewer || state.backend.hasRemoteUpdate,
                    message: remoteIsNewer
                      ? 'A newer workspace update is available. Resolve the pending change first.'
                      : state.backend.message,
                  },
                }));
                return;
              }

              if (!options.force && !remoteIsNewer && currentVersion > 0) {
                apply((state) => ({
                  backend: {
                    ...state.backend,
                    status: 'live',
                    isPulling: false,
                    upgradeRequired: false,
                    lastPulledAt: pulledAt,
                    remoteVersion: revision.version,
                    remoteUpdatedAt: revision.updatedAt,
                    hasRemoteUpdate: false,
                    error: undefined,
                    errorCode: undefined,
                    message: options.silent ? state.backend.message : 'Workspace is current.',
                  },
                }));
                return;
              }

              const secure = await loadSecureWorkspace(capabilityUser, {
                preserveRetainedCommand: true,
                shouldApplySnapshot: () => workspaceMutationRuntime.localMutationEpoch === epochBeforeLoad,
              });
              if (!isWorkspaceSessionCurrent(sessionToken)) return;
              const latest = get();
              if (workspaceMutationRuntime.localMutationEpoch !== epochBeforeLoad) {
                // A local edit landed while the refresh was in flight. Never
                // overwrite it (a forced pull included); keep it and let the
                // auto-sync persist it.
                apply((state) => ({
                  backend: {
                    ...state.backend,
                    isPulling: false,
                    lastPulledAt: pulledAt,
                    remoteVersion: secure.revision.version,
                    remoteUpdatedAt: secure.revision.updatedAt,
                  },
                }));
                if (get().backend.hasLocalChanges || get().backend.pendingMutations > 0) {
                  queueMicrotask(() => { if (isWorkspaceSessionCurrent(sessionToken)) void get().syncBackendNow(); });
                }
                return;
              }
              if (!options.force && (latest.backend.hasLocalChanges || latest.backend.pendingMutations > 0)) {
                apply((state) => ({
                  backend: {
                    ...state.backend,
                    status: 'conflict',
                    isPulling: false,
                    lastPulledAt: pulledAt,
                    remoteVersion: secure.revision.version,
                    remoteUpdatedAt: secure.revision.updatedAt,
                    hasRemoteUpdate: true,
                    message: 'You made changes during the refresh. Review and retry your pending change.',
                  },
                }));
                return;
              }
              workspaceMutationRuntime.isApplyingRemoteSnapshot = true;
              apply((state) => ({
                ...makeWorkspacePatch(state, {
                  state: secure.state,
                  source: 'supabase',
                  version: 1,
                  message: 'Secure workspace refreshed.',
                  updatedAt: pulledAt,
                }),
                currentUser: secure.currentUser,
                notificationUnreadCount: secure.notificationFeed.unreadCount,
                backend: {
                  ...state.backend,
                  status: 'live',
                  isPulling: false,
                  upgradeRequired: false,
                  lastPulledAt: pulledAt,
                  lastSyncedAt: pulledAt,
                  workspaceVersion: secure.revision.version,
                  remoteVersion: secure.revision.version,
                  remoteUpdatedAt: secure.revision.updatedAt,
                  hasRemoteUpdate: false,
                  hasLocalChanges: false,
                  pendingMutations: 0,
                  pendingCommandType: undefined,
                  conflict: undefined,
                  error: undefined,
                  errorCode: undefined,
                  message: 'Secure workspace is current.',
                },
              }));
              workspaceMutationRuntime.isApplyingRemoteSnapshot = false;
              return;
            }
          } catch (error) {
            workspaceMutationRuntime.isApplyingRemoteSnapshot = false;
            apply((state) => ({
              backend: {
                ...state.backend,
                status: typeof navigator !== 'undefined' && navigator.onLine === false
                  ? 'offline'
                  : state.backend.hasLocalChanges || state.backend.pendingMutations > 0 || hasRetainedSecureMutation()
                    ? state.backend.conflict ? 'conflict' : 'retry_required'
                    : 'refresh_required',
                isPulling: false,
                message: 'Unable to check for the latest updates.',
                error: userFacingText(error, "We couldn't load your workspace. Please try again."),
              }
            }));
          } finally {
            workspaceMutationRuntime.isApplyingRemoteSnapshot = false;
          }
        },

        reapplyMutationOnLatestWorkspace: async () => {
          const sessionToken = captureWorkspaceSession();
          const apply: typeof set = (patch) => { if (isWorkspaceSessionCurrent(sessionToken)) set(patch); };

          const current = get();
          const retained = getRetainedSecureCommand();
          if (!retained || !isWorkspaceConflict(current.backend.conflict)) {
            return { ok: false, error: 'There is no workspace conflict to reapply.' };
          }
          // Refresh only the workspace envelope. Loading and overlaying whole rows
          // would replace the original row versions and silently bypass conflicts.
          let revision: Awaited<ReturnType<typeof loadSecureWorkspaceRevision>>;
          try { revision = await loadSecureWorkspaceRevision(); }
          catch (error) {
            if (!isWorkspaceSessionCurrent(sessionToken)) return { ok: false, error: 'Your session changed. Sign in again.' };
            const message = userFacingText(error, 'Unable to load the latest workspace right now. Try again shortly.');
            apply(state => ({ backend: { ...state.backend, isSaving: false, error: message, message } }));
            return { ok: false, error: message };
          }
          if (!isWorkspaceSessionCurrent(sessionToken)) return { ok: false, error: 'Your session changed. Sign in again.' };
          apply((state) => ({
            backend: {
              ...state.backend,
              status: 'retry_required',
              isSaving: false,
              workspaceVersion: revision.version,
              remoteVersion: revision.version,
              hasLocalChanges: true,
              pendingMutations: 1,
              conflict: undefined,
              error: undefined,
              message: 'Reapplying your change on the latest workspace.',
            },
          }));
          const result = await get().retryMutation({ reapplyWorkspaceConflict: false });
          if (!isWorkspaceSessionCurrent(sessionToken)) return { ok: false, error: 'Your session changed. Sign in again.' };

          return result;
        },

        retryMutation: async (options = {}) => {
          const sessionToken = captureWorkspaceSession();
          const apply: typeof set = (patch) => { if (isWorkspaceSessionCurrent(sessionToken)) set(patch); };

          if (isSyncBusy(get())) {
            const idle = await waitForSyncIdle();
            if (!isWorkspaceSessionCurrent(sessionToken)) return { ok: false, error: 'Your session changed. Sign in again.' };
            if (!idle) return { ok: false, error: 'Another synchronization request is still running.' };
          }
          const current = get();
          const retainedMemberMutation = getRetainedSecureMemberMutation();
          if (!getRetainedSecureCommand() && !retainedMemberMutation) {
            return get().retryPendingSave(current.backend.pendingCommandType);
          }
          if (retainedMemberMutation) {
            const targetUser = current.users.find(user => user.id === retainedMemberMutation.memberId);
            if (!targetUser) {
              apply((state) => ({
                backend: {
                  ...state.backend,
                  status: 'retry_required',
                  isSaving: false,
                  error: 'The member change is waiting, but that member is no longer available. Refresh before retrying.',
                  message: 'The member change is waiting, but that member is no longer available. Refresh before retrying.',
                },
              }));
              return { ok: false, error: 'The member change is waiting, but that member is no longer available. Refresh before retrying.' };
            }

            apply((state) => ({
              backend: {
                ...state.backend,
                status: 'saving',
                isSaving: true,
                error: undefined,
                message: 'Retrying member change.',
              },
            }));
            const result = await retryRetainedSecureMemberMutation(targetUser);
            if (!isWorkspaceSessionCurrent(sessionToken)) return { ok: false, error: 'Your session changed. Sign in again.' };
            if (result.ok === false) {
              const terminal = isTerminalMemberMutationError(result.code);
              apply((state) => ({
                backend: {
                  ...state.backend,
                  status: terminal
                    ? 'refresh_required'
                    : result.code === 'CONFLICT'
                      ? 'conflict'
                      : result.code === 'OFFLINE'
                        ? 'offline'
                        : 'retry_required',
                  isSaving: false,
                  hasLocalChanges: terminal ? true : state.backend.hasLocalChanges,
                  pendingMutations: terminal ? 1 : Math.max(1, state.backend.pendingMutations),
                  pendingCommandType: state.backend.pendingCommandType,
                  conflict: result.conflict,
                  errorCode: result.code,
                  error: result.error,
                  message: result.error,
                },
              }));
              return { ok: false, code: result.code, error: result.error };
            }

            const updatedAt = result.data.member?.updated_at || new Date().toISOString();
            const version = Number(result.data.member?.version) || Math.max(1, Number(targetUser.version) || 1) + 1;
            const roleMember = retainedMemberMutation.kind === 'role'
              && result.data.member
              && 'role' in result.data.member
              ? result.data.member
              : undefined;
            apply((state) => ({
              users: state.users.map(user => user.id === targetUser.id
                ? retainedMemberMutation.kind === 'departments'
                  ? {
                    ...user,
                    departments: retainedMemberMutation.departments,
                    department: getLegacyDepartmentMirror(user.role, retainedMemberMutation.departments),
                    version,
                    updatedAt,
                  }
                  : retainedMemberMutation.kind === 'permissions'
                    ? { ...user, permissions: retainedMemberMutation.permissions || undefined, version, updatedAt }
                    : {
                      ...user,
                      role: roleMember?.role ?? retainedMemberMutation.role,
                      customRoleId: roleMember?.customRoleId ?? retainedMemberMutation.customRoleId ?? undefined,
                      customRoleName: roleMember?.customRoleName ?? user.customRoleName,
                      companyName: roleMember?.clientName ?? retainedMemberMutation.companyName ?? undefined,
                      departments: roleMember?.departments ?? retainedMemberMutation.departments,
                      department: roleMember?.department ?? getLegacyDepartmentMirror(retainedMemberMutation.role, retainedMemberMutation.departments),
                      permissions: undefined,
                      version,
                      updatedAt,
                    }
                : user),
              backend: {
                ...state.backend,
                status: 'live',
                isSaving: false,
                hasRemoteUpdate: false,
                hasLocalChanges: false,
                pendingMutations: 0,
                pendingCommandType: undefined,
                workspaceVersion: Math.max(state.backend.workspaceVersion || 0, result.workspaceVersion),
                remoteVersion: Math.max(state.backend.remoteVersion || 0, result.workspaceVersion),
                lastSavedAt: updatedAt,
                lastSyncedAt: updatedAt,
                conflict: undefined,
                error: undefined,
                errorCode: undefined,
                message: 'Saved.',
              },
            }));

            return { ok: true };
          }
          if (shouldUseSecureSupabase()) {
            const compatibility = await loadSecureBackendCapabilities();
            if (!isWorkspaceSessionCurrent(sessionToken)) return { ok: false, error: 'Your session changed. Sign in again.' };
            if (!compatibility.compatible) {
              apply((state) => ({
                backend: {
                  ...state.backend,
                  status: compatibility.retryable ? 'retry_required' : 'upgrade_required',
                  isSaving: false,
                  upgradeRequired: !compatibility.retryable,
                  error: compatibility.error,
                  message: compatibility.error,
                },
              }));
              return { ok: false, error: compatibility.error };
            }
          }
          const conflict = current.backend.conflict;
          if (options.reapplyWorkspaceConflict !== false && conflict && isWorkspaceConflict(conflict) && getRetainedSecureCommand()) {
            return get().reapplyMutationOnLatestWorkspace();
          }
          if (conflict) rebaseRetryableCommand(conflict);

          apply((state) => ({
            backend: {
              ...state.backend,
              status: 'saving',
              isSaving: true,
              pendingMutations: 1,
              pendingCommandType: getRetainedSecureCommand()?.type || state.backend.pendingCommandType,
              error: undefined,
              message: 'Retrying pending change.',
            },
          }));

          const workspaceBeforeRetry = selectPersistedWorkspaceState(get());
          const result = await retrySecureWorkspaceCommand(get().backend.workspaceVersion || undefined, {
            excludeSuperAdminEntities: !get().currentUser?.isSuperAdmin,
            actorMemberId: get().currentUser?.id,
            excludedEntityTypes: excludedServiceMetadataEntityTypes(get().currentUser, get().rolePermissions),
          });
          if (!isWorkspaceSessionCurrent(sessionToken)) return { ok: false, error: 'Your session changed. Sign in again.' };
          if (result.ok === false) {
            const upgradeRequired = result.error === BACKEND_UPGRADE_REQUIRED_MESSAGE;
            apply((state) => ({
              backend: {
                ...state.backend,
                status: upgradeRequired
                  ? 'upgrade_required'
                  : result.code === 'CONFLICT'
                    ? 'conflict'
                    : result.code === 'OFFLINE'
                      ? 'offline'
                      : isTerminalMutationError(result.code)
                        ? 'refresh_required'
                        : 'retry_required',
                upgradeRequired,
                isSaving: false,
                conflict: result.conflict,
                errorCode: result.code,
                error: result.error,
                message: result.error,
              },
            }));
            if (options.reapplyWorkspaceConflict !== false && result.code === 'CONFLICT' && isWorkspaceConflict(result.conflict)) {
              const reapplied = await get().reapplyMutationOnLatestWorkspace();
              if (reapplied.ok) return reapplied;
            }
            return { ok: false, code: result.code, error: result.error };
          }

          const savedAt = new Date().toISOString();
          const hasNewerChanges = !workspaceStatesEqual(workspaceBeforeRetry, selectPersistedWorkspaceState(get()));
          apply((state) => ({
            backend: {
              ...state.backend,
              status: hasNewerChanges ? 'saving' : 'live',
              isSaving: false,
              upgradeRequired: false,
              workspaceVersion: Math.max(state.backend.workspaceVersion || 0, result.workspaceVersion),
              remoteVersion: Math.max(state.backend.remoteVersion || 0, result.workspaceVersion),
              lastSavedAt: savedAt,
              lastSyncedAt: savedAt,
              conflict: undefined,
              error: undefined,
              errorCode: undefined,
              hasRemoteUpdate: false,
              hasLocalChanges: hasNewerChanges,
              pendingMutations: hasNewerChanges ? 1 : 0,
              pendingCommandType: hasNewerChanges ? state.backend.pendingCommandType : undefined,
              message: hasNewerChanges ? 'Saving newer changes.' : 'Saved.',
            },
          }));

          acknowledgeActionFeedback(get(), { tasks: workspaceBeforeRetry.tasks, clients: workspaceBeforeRetry.clients || [] });
          if (hasNewerChanges) queueMicrotask(() => { if (isWorkspaceSessionCurrent(sessionToken)) void get().syncBackendNow(); });
          else await get().pullBackendNow({ force: true, silent: true });
          if (!isWorkspaceSessionCurrent(sessionToken)) return { ok: false, error: 'Your session changed. Sign in again.' };
          return { ok: true };
        },

        discardMutation: async (options = {}) => {
          const sessionToken = captureWorkspaceSession();
          const apply: typeof set = (patch) => { if (isWorkspaceSessionCurrent(sessionToken)) set(patch); };
          if (isSyncBusy(get())) {
            const idle = await waitForSyncIdle();
            if (!isWorkspaceSessionCurrent(sessionToken)) return;
            if (!idle) throw new Error('Another synchronization request is still running.');
          }
          apply(state => ({ backend: { ...state.backend, isRestoring: true } }));
          const discardedCommandId = getRetainedSecureCommand()?.id;
          try {
            // Keep the overlay, retry identity and mutation lock until the canonical
            // reload succeeds. A failed restore must never turn abandoned edits into
            // apparently clean data that can leak into an unrelated later save.
            if (shouldUseSecureSupabase()) {
              await get().pullBackendNow({ force: true, silent: false });
              if (!isWorkspaceSessionCurrent(sessionToken)) return;
              if (get().backend.status !== 'live' || get().backend.hasLocalChanges) {
                apply(state => ({
                  backend: {
                    ...state.backend,
                    status: state.backend.upgradeRequired ? 'upgrade_required' : state.backend.status === 'offline' ? 'offline' : state.backend.conflict ? 'conflict' : 'retry_required',
                    error: state.backend.error || 'Unable to reload saved data. Try again.',
                  }
                }));
                return;
              }
            }
            clearActionFeedback();
            discardSecureWorkspaceCommand({ preserveSession: true });
            discardRetainedSecureMemberMutation();
            const actorId = get().currentUser?.id;
            apply((state) => ({
              backend: {
                ...state.backend,
                status: shouldUseSecureSupabase() ? 'live' : state.backend.mode === 'local' ? 'local' : 'loading',
                conflict: undefined,
                error: undefined,
                hasRemoteUpdate: false,
                hasLocalChanges: false,
                pendingMutations: 0,
                pendingCommandType: undefined,
                errorCode: undefined,
                message: options.reload === false ? 'Pending change discarded.' : 'Loading the latest saved workspace.',
              },
            }));
            if (!shouldUseSecureSupabase() && options.reload !== false) {
              await get().pullBackendNow({ force: true, silent: false });
            }
            if (!isWorkspaceSessionCurrent(sessionToken) || !actorId) return;
            if (shouldUseSecureSupabase() && get().backend.status !== 'live') return;
            const { cleanupPendingServiceFiles, reconcilePendingServiceFiles } = await import('../../modules/services/data/serviceFiles');
            if (!isWorkspaceSessionCurrent(sessionToken)) return;
            reconcilePendingServiceFiles(actorId, selectPersistedWorkspaceState(get()));
            const cleanup = await cleanupPendingServiceFiles(actorId, { abandonSubmitted: true, commandIds: discardedCommandId ? [discardedCommandId] : [], includeUnsubmitted: false });
            if (!cleanup.ok) apply(state => ({ backend: { ...state.backend, error: cleanup.error, message: cleanup.error } }));
          } finally { apply(state => ({ backend: { ...state.backend, isRestoring: false } })); }
        },

        retryPendingSave: async (commandType) => {
          const sessionToken = captureWorkspaceSession();
          if (!shouldUseSupabase()) {
            await retryLocalPersistence();
            if (!isWorkspaceSessionCurrent(sessionToken)) return { ok: false, error: 'Your session changed. Sign in again.' };
            if (typeof window !== 'undefined' && browserPersistFailed) return { ok: false, error: 'This change could not be saved on this device. Keep this page open and try again.' };
            acknowledgeActionFeedback(get()); return { ok: true };
          }
          if (isSyncBusy(get())) {
            const idle = await waitForSyncIdle();
            if (!isWorkspaceSessionCurrent(sessionToken)) return { ok: false, error: 'Your session changed. Sign in again.' };
            if (!idle) {
              return { ok: false, code: 'RETRY_REQUIRED', error: 'Another synchronization request is still running.' };
            }
          }
          const before = get().backend;
          if (before.status === 'refresh_required'
            && (before.hasLocalChanges || before.pendingMutations > 0)
            && isTerminalMutationError(before.errorCode)) {
            return { ok: false, code: before.errorCode, error: before.error || pendingMutationMessage };
          }
          if (getRetainedSecureCommand() || getRetainedSecureMemberMutation()) {
            return get().retryMutation();
          }
          if (!before.hasLocalChanges) {
            if (before.status === 'live') return { ok: true };
            // A failed read has no command to replay. Recover by refreshing;
            // resending a non-existent save leaves older tabs stuck forever.
            await get().pullBackendNow({ force: true, silent: false });
            if (!isWorkspaceSessionCurrent(sessionToken)) return { ok: false, error: 'Your session changed. Sign in again.' };
            const refreshed = get().backend;
            return refreshed.status === 'live' && !refreshed.hasLocalChanges && !refreshed.error
              ? { ok: true }
              : { ok: false, code: refreshed.errorCode, error: refreshed.error || refreshed.message || 'Unable to reload saved data. Try again.' };
          }
          await get().syncBackendNow(commandType || before.pendingCommandType);
          if (!isWorkspaceSessionCurrent(sessionToken)) return { ok: false, error: 'Your session changed. Sign in again.' };
          const after = get().backend;
          return !after.hasLocalChanges && after.pendingMutations === 0 && ['live', 'refresh_required'].includes(after.status)
            ? { ok: true }
            : { ok: false, code: after.errorCode, error: after.error || before.error || after.message || 'The change has not been saved yet.' };
        },

        commitPendingMutation: async (commandType) => {
          const sessionToken = captureWorkspaceSession();
          if (!shouldUseSupabase()) {
            await retryLocalPersistence();
            if (!isWorkspaceSessionCurrent(sessionToken)) return { ok: false, error: 'Your session changed. Sign in again.' };
            if (typeof window !== 'undefined' && browserPersistFailed) return { ok: false, error: 'This change could not be saved on this device. Keep this page open and try again.' };
            acknowledgeActionFeedback(get()); return { ok: true };
          }
          // A form stages its local edit before requesting confirmation. A
          // background pull (or an earlier save) must finish before we send it;
          // syncBackendNow intentionally returns immediately while either is busy.
          if (isSyncBusy(get())) {
            if (commandType && get().backend.hasLocalChanges && !hasRetainedSecureMutation()) {
              set(state => ({ backend: { ...state.backend, pendingCommandType: state.backend.pendingCommandType || commandType } }));
            }
            const idle = await waitForSyncIdle();
            if (!isWorkspaceSessionCurrent(sessionToken)) return { ok: false, error: 'Your session changed. Sign in again.' };
            if (!idle) return { ok: false, code: 'RETRY_REQUIRED', error: 'Another synchronization request is still running.' };
          }
          const before = get().backend;
          if (before.status === 'upgrade_required') {
            return { ok: false, error: BACKEND_UPGRADE_REQUIRED_MESSAGE };
          }
          if (hasRetainedSecureMutation()) {
            return { ok: false, error: pendingMutationMessage };
          }
          if (
            before.hasLocalChanges &&
            (before.status === 'conflict' || before.status === 'retry_required' || before.status === 'offline'
              || (before.status === 'refresh_required' && isTerminalMutationError(before.errorCode)))
          ) {
            return {
              ok: false,
              error: pendingMutationMessage,
            };
          }
          await get().syncBackendNow(commandType);
          // An acknowledged write may have queued newer local edits. Wait for
          // that write too instead of reporting a generic false save failure.
          if (isSyncBusy(get())) {
            const idle = await waitForSyncIdle();
            if (!isWorkspaceSessionCurrent(sessionToken)) return { ok: false, error: 'Your session changed. Sign in again.' };
            if (!idle) return { ok: false, code: 'RETRY_REQUIRED', error: 'Another synchronization request is still running.' };
          }
          if (!isWorkspaceSessionCurrent(sessionToken)) return { ok: false, error: 'Your session changed. Sign in again.' };
          const backend = get().backend;
          if (!backend.hasLocalChanges && backend.pendingMutations === 0 && ['live', 'refresh_required'].includes(backend.status)) { acknowledgeActionFeedback(get()); return { ok: true }; }
          return {
            ok: false,
            code: backend.errorCode,
            error: backend.error || 'The change has not been saved yet.',
          };
        },

      });
    },
    {
      name: PERSIST_KEY,
      version: 5,
      storage: createJSONStorage(() => safeStorageAdapter),
      merge: mergePersistedWorkspace,
      migrate: (persistedState, version) => {
        if (shouldUseSupabase()) return {};
        const saved = persistedState as StoreState;
        return version < 5 ? { ...saved, clientPlans: migrateLegacyPlanSchedules(saved.clientPlans || []) } : saved;
      },
      onRehydrateStorage: () => (_state, error) => {
        if (error) {
          safeStorageAdapter.removeItem(PERSIST_KEY);
          useToastStore.getState().addToast(msg('errors.workspaceReset'), 'error');
        }
      },
      partialize: (state) => {
        if (shouldUseSupabase()) return {};

        return {
          // Local-only development keeps its browser workspace; Supabase mode persists nothing here.
          currentUser: state.currentUser
            ? stripPassword(state.currentUser as User & { password?: string })
            : null,
          tasks: state.tasks,
          projects: state.projects,
          clients: state.clients,
          users: state.users.map(user => stripPassword(user as User & { password?: string })),
          registrations: state.registrations.map(r => stripPassword(r)),
          notifications: state.notifications,
          rolePermissions: state.rolePermissions,
          taskStatuses: state.taskStatuses,
          deletedUserIds: state.deletedUserIds || [],
          deletedRoleIds: state.deletedRoleIds || [],
          deletedTaskStatuses: state.deletedTaskStatuses || [],
          deletedClientIds: state.deletedClientIds || [],
          servicePackages: state.servicePackages,
          clientPlans: state.clientPlans,
          serviceCycles: state.serviceCycles,
          serviceCyclePayments: state.serviceCyclePayments,
          deliverables: state.deliverables,
          cycleComments: state.cycleComments,
          addons: state.addons,
          serviceWorkflowTemplates: state.serviceWorkflowTemplates,
          servicePricingSnapshots: state.servicePricingSnapshots,
        };
      },
    }
  )
);

let backendAutoSyncStarted = false;
let backendAutoSyncCleanup: (() => void) | null = null;
export const startBackendAutoSync = () => {
  if (backendAutoSyncStarted || !useStore.getState().currentUser || typeof window === 'undefined') return;
  backendAutoSyncStarted = true;
  let accessRealtimeCleanup: (() => void) | null = null;
  let accessRealtimeKey: string | null = null;
  let workspaceRealtimeCleanup: (() => void) | null = null;
  let workspaceRealtimeKey: string | null = null;
  let taskRealtimeCleanup: (() => void) | null = null;
  let taskRealtimeKey: string | null = null;
  let localStorageSyncCleanup: (() => void) | null = null;
  let realtimeRetryTimer: number | null = null;
  let realtimeRetryAttempt = 0;
  let lastRealtimeFailureToastAt = 0;
  const accessRefresh = createAccessRefreshCoordinator(
    () => {
      const state = useStore.getState();
      return {
        hasCurrentUser: Boolean(state.currentUser),
        isPulling: state.backend.isPulling,
        isSaving: state.backend.isSaving,
        hasPendingChange: isPullBlockedByPendingChange(state),
      };
    },
    () => useStore.getState().pullBackendNow({ force: true, silent: true }),
  );
  const reportRealtimeFailure = () => {
    const now = Date.now();
    if (now - lastRealtimeFailureToastAt > 30_000) {
      lastRealtimeFailureToastAt = now;
      useToastStore.getState().addToast(msg('errors.realtimeUnavailable'), 'warning');
    }
    // Realtime is an invalidation accelerator, not the source of truth. Pull
    // immediately after a channel failure so a missed event does not wait for
    // the fifteen-second safety poll.
    accessRefresh.request();
    if (realtimeRetryTimer === null) {
      const delay = Math.min(30_000, 1_000 * (2 ** realtimeRetryAttempt));
      realtimeRetryAttempt = Math.min(realtimeRetryAttempt + 1, 5);
      realtimeRetryTimer = window.setTimeout(() => {
        realtimeRetryTimer = null;
        if (!useStore.getState().currentUser || !shouldUseSecureSupabase()) return;
        accessRealtimeKey = null;
        workspaceRealtimeKey = null;
        taskRealtimeKey = null;
        syncAccessRealtime();
        syncWorkspaceRealtime();
        syncTaskRealtime();
        accessRefresh.request();
      }, delay);
    }
  };

  const syncAccessRealtime = () => {
    const currentUser = useStore.getState().currentUser;
    const authUserId = currentUser?.authUserId;
    const builtinRoleId = currentUser ? getBuiltinRoleId(currentUser.role) : undefined;
    const key = authUserId ? `${authUserId}:${currentUser?.customRoleId || ''}:${builtinRoleId || ''}` : null;
    if (key === accessRealtimeKey) return;
    accessRefresh.reset();
    accessRealtimeCleanup?.();
    accessRealtimeCleanup = null;
    accessRealtimeKey = key;
    if (!shouldUseSecureSupabase() || !authUserId) return;
    accessRealtimeCleanup = subscribeToCurrentMemberAccessChanges(
      authUserId,
      currentUser?.customRoleId,
      builtinRoleId,
      accessRefresh.request,
      reportRealtimeFailure,
    );
  };

  const syncWorkspaceRealtime = () => {
    const currentUser = useStore.getState().currentUser;
    const key = shouldUseSecureSupabase() && currentUser ? SECURE_WORKSPACE_ID : null;
    if (key === workspaceRealtimeKey) return;
    workspaceRealtimeCleanup?.();
    workspaceRealtimeCleanup = null;
    workspaceRealtimeKey = key;
    if (!key) return;
    workspaceRealtimeCleanup = subscribeToWorkspaceRevisionChanges(key, accessRefresh.request, reportRealtimeFailure);
  };

  const syncTaskRealtime = () => {
    const currentUser = useStore.getState().currentUser;
    const key = shouldUseSecureSupabase() && currentUser ? SECURE_WORKSPACE_ID : null;
    if (key === taskRealtimeKey) return;
    taskRealtimeCleanup?.();
    taskRealtimeCleanup = null;
    taskRealtimeKey = key;
    if (!key) return;
    taskRealtimeCleanup = subscribeToWorkspaceTaskChanges(key, accessRefresh.request, reportRealtimeFailure);
  };

  // Local mode is intentionally browser-only, but two open tabs should still
  // see a saved task without requiring a manual reload. The storage event is
  // emitted by the browser in every other tab after Zustand persists the
  // workspace; secure Supabase mode does not persist workspace rows here.
  if (!shouldUseSupabase()) {
    const handleLocalStorage = (event: StorageEvent) => {
      if (event.key !== PERSIST_KEY || !event.newValue || (event.storageArea && event.storageArea !== window.localStorage)) return;
      const state = useStore.getState();
      if (!state.currentUser || isSyncBusy(state)) return;
      void useStore.persist.rehydrate();
    };
    window.addEventListener('storage', handleLocalStorage);
    localStorageSyncCleanup = () => window.removeEventListener('storage', handleLocalStorage);
  }

  // A role, permission, department, or custom-role change can invalidate a
  // pending command that was built under the previous access level. When that
  // happens, discard the stale pending work and reload the canonical workspace
  // so the member can retry cleanly instead of hitting a permanent
  // "You do not have permission to make this change." denial.
  const accessSignature = (user: User | null | undefined) => (
    user
      ? JSON.stringify({
        role: user.role,
        super: Boolean(user.isSuperAdmin),
        customRoleId: user.customRoleId || '',
        departments: user.departments || [],
        permissions: user.permissions || {},
      })
      : null
  );

  const discardPendingForAccessChange = () => {
    const state = useStore.getState();
    const hasPending = state.backend.hasLocalChanges
      || (state.backend.pendingMutations || 0) > 0
      || Boolean(getRetainedSecureCommand())
      || Boolean(getRetainedSecureMemberMutation());
    if (!hasPending) return;
    void state.discardMutation({ confirm: false });
    useToastStore.getState().addToast(
      msg('errors.accessChanged'),
      'warning',
    );
  };

  syncAccessRealtime();
  syncWorkspaceRealtime();
  syncTaskRealtime();
  const unsubscribeAccessRealtime = useStore.subscribe((state, previousState) => {
    if (
      state.currentUser?.authUserId !== previousState.currentUser?.authUserId
      || state.currentUser?.customRoleId !== previousState.currentUser?.customRoleId
      || state.currentUser?.role !== previousState.currentUser?.role
    ) syncAccessRealtime();

    if (state.currentUser?.authUserId !== previousState.currentUser?.authUserId) {
      syncWorkspaceRealtime();
      syncTaskRealtime();
    }

    const previousSignature = accessSignature(previousState.currentUser);
    const nextSignature = accessSignature(state.currentUser);
    if (previousSignature && nextSignature && previousSignature !== nextSignature) {
      discardPendingForAccessChange();
    }
  });

  const unsubscribeBackendState = useStore.subscribe((state, previousState) => {
    accessRefresh.onStateChange();

    if (!shouldUseSupabase() || state.backend.isLoading || state.backend.isPulling || workspaceMutationRuntime.isApplyingRemoteSnapshot || workspaceMutationRuntime.isApplyingNotificationRead) return;

    const workspaceChanged =
      state.users !== previousState.users ||
      state.clients !== previousState.clients ||
      state.projects !== previousState.projects ||
      state.tasks !== previousState.tasks ||
      state.notifications !== previousState.notifications ||
      state.registrations !== previousState.registrations ||
      state.rolePermissions !== previousState.rolePermissions ||
      state.taskStatuses !== previousState.taskStatuses ||
      state.deletedUserIds !== previousState.deletedUserIds ||
      state.deletedRoleIds !== previousState.deletedRoleIds ||
      state.deletedTaskStatuses !== previousState.deletedTaskStatuses ||
      state.deletedClientIds !== previousState.deletedClientIds;

    const serviceWorkspaceChanged =
      state.servicePackages !== previousState.servicePackages ||
      state.clientPlans !== previousState.clientPlans ||
      state.serviceCycles !== previousState.serviceCycles ||
      state.serviceCyclePayments !== previousState.serviceCyclePayments ||
      state.deliverables !== previousState.deliverables ||
      state.cycleComments !== previousState.cycleComments ||
      state.addons !== previousState.addons;

    const serviceMetadataChanged =
      state.serviceWorkflowTemplates !== previousState.serviceWorkflowTemplates ||
      state.servicePricingSnapshots !== previousState.servicePricingSnapshots;

    if (!workspaceChanged && !serviceWorkspaceChanged && !serviceMetadataChanged) return;

    if (state.backend.upgradeRequired === true) {
      workspaceMutationRuntime.isApplyingRemoteSnapshot = true;
      useStore.setState({
        users: previousState.users,
        clients: previousState.clients,
        projects: previousState.projects,
        tasks: previousState.tasks,
        notifications: previousState.notifications,
        registrations: previousState.registrations,
        rolePermissions: previousState.rolePermissions,
        taskStatuses: previousState.taskStatuses,
        deletedUserIds: previousState.deletedUserIds,
        deletedRoleIds: previousState.deletedRoleIds,
        deletedTaskStatuses: previousState.deletedTaskStatuses,
        deletedClientIds: previousState.deletedClientIds,
        servicePackages: previousState.servicePackages,
        clientPlans: previousState.clientPlans,
        serviceCycles: previousState.serviceCycles,
        serviceCyclePayments: previousState.serviceCyclePayments,
        deliverables: previousState.deliverables,
        cycleComments: previousState.cycleComments,
        addons: previousState.addons,
        serviceWorkflowTemplates: previousState.serviceWorkflowTemplates,
        servicePricingSnapshots: previousState.servicePricingSnapshots,
        backend: {
          ...state.backend,
          hasLocalChanges: state.backend.hasLocalChanges,
          pendingMutations: state.backend.pendingMutations,
          error: BACKEND_UPGRADE_REQUIRED_MESSAGE,
          message: BACKEND_UPGRADE_REQUIRED_MESSAGE,
        },
      });
      workspaceMutationRuntime.isApplyingRemoteSnapshot = false;
      useToastStore.getState().addToast(BACKEND_UPGRADE_REQUIRED_MESSAGE, 'warning');
      return;
    }

    if (!state.backend.hasLocalChanges) {
      useStore.setState((current) => ({
        backend: {
          ...current.backend,
          status: typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'saving',
          hasLocalChanges: true,
          pendingMutations: 1,
          message: current.backend.hasRemoteUpdate
            ? current.backend.message
            : typeof navigator !== 'undefined' && navigator.onLine === false
              ? 'Offline. This change has not been saved.'
              : 'Saving change.',
        }
      }));
    }

    if (shouldUseSecureSupabase()) return;
    if (state.backend.hasRemoteUpdate || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
    queueMicrotask(() => void useStore.getState().syncBackendNow());
  });

  const pullLatest = () => {
    if (!shouldUseSupabase() || document.visibilityState !== 'visible') return;
    const state = useStore.getState();
    if (shouldUseSecureSupabase() && !state.currentUser) return;
    if (isSyncBusy(state) || isPullBlockedByPendingChange(state)) return;
    void state.pullBackendNow({ silent: true });
  };

  const handleOffline = () => {
    useStore.setState((state) => {
      if (state.backend.upgradeRequired === true) return state;
      return {
        backend: {
          ...state.backend,
          status: 'offline',
          message: state.backend.hasLocalChanges
            ? 'Offline. A local change is waiting for your retry.'
            : 'Offline. Live sync will resume when you reconnect.',
        },
      };
    });
  };
  const handleOnline = () => {
    useStore.setState((state) => {
      if (state.backend.upgradeRequired === true) return state;
      return {
        backend: {
          ...state.backend,
          status: state.backend.hasLocalChanges ? 'retry_required' : 'loading',
          message: state.backend.hasLocalChanges
            ? 'Back online. Review and retry the pending change.'
            : 'Back online. Checking the latest workspace.',
        },
      };
    });
    if (shouldUseSecureSupabase()) {
      if (realtimeRetryTimer !== null) {
        window.clearTimeout(realtimeRetryTimer);
        realtimeRetryTimer = null;
      }
      realtimeRetryAttempt = 0;
      accessRealtimeKey = null;
      workspaceRealtimeKey = null;
      taskRealtimeKey = null;
      syncAccessRealtime();
      syncWorkspaceRealtime();
      syncTaskRealtime();
    }
    const state = useStore.getState();
    if (!shouldUseSecureSupabase() || state.currentUser) {
      void state.pullBackendNow({ silent: true });
    }
  };

  const pullInterval = window.setInterval(pullLatest, 15000);
  window.addEventListener('focus', pullLatest);
  document.addEventListener('visibilitychange', pullLatest);
  window.addEventListener('offline', handleOffline);
  window.addEventListener('online', handleOnline);

  backendAutoSyncCleanup = () => {
    unsubscribeAccessRealtime();
    unsubscribeBackendState();
    accessRealtimeCleanup?.();
    accessRealtimeCleanup = null;
    accessRealtimeKey = null;
    workspaceRealtimeCleanup?.();
    workspaceRealtimeCleanup = null;
    workspaceRealtimeKey = null;
    taskRealtimeCleanup?.();
    taskRealtimeCleanup = null;
    taskRealtimeKey = null;
    accessRefresh.reset();
    localStorageSyncCleanup?.();
    localStorageSyncCleanup = null;
    if (realtimeRetryTimer !== null) {
      window.clearTimeout(realtimeRetryTimer);
      realtimeRetryTimer = null;
    }
    realtimeRetryAttempt = 0;
    window.clearInterval(pullInterval);
    window.removeEventListener('focus', pullLatest);
    document.removeEventListener('visibilitychange', pullLatest);
    window.removeEventListener('offline', handleOffline);
    window.removeEventListener('online', handleOnline);
    backendAutoSyncStarted = false;
  };
};

export const stopBackendAutoSync = () => {
  backendAutoSyncCleanup?.();
};

useStore.subscribe((state, previous) => {
  if (previous.currentUser && (state.currentUser?.id !== previous.currentUser.id || state.currentUser?.authUserId !== previous.currentUser.authUserId)) {
    clearRecoveredDrafts(previous.currentUser.authUserId || previous.currentUser.id);
    invalidateWorkspaceSession();
  }
});

export const clearWorkspaceSession = (options: { discardPending?: boolean } = {}) => {
  // Signing out must not leave a password-setup link mode active for the tab.
  clearPasswordSetupMode();
  const actor = useStore.getState().currentUser;
  if (actor) clearRecoveredDrafts(actor.authUserId || actor.id);
  if (options.discardPending) { discardSecureWorkspaceCommand(); discardRetainedSecureMemberMutation(); }
  invalidateWorkspaceSession();
  stopBackendAutoSync();
  useStore.setState(state => ({
    currentUser: null,
    ...(shouldUseSupabase() ? {
      taskStatuses: [], users: [], clients: [], projects: [], tasks: [], notifications: [], registrations: [], rolePermissions: [],
      clientPlans: [], serviceCycles: [], serviceCyclePayments: [], deliverables: [], cycleComments: [], addons: [], servicePackages: [],
      serviceWorkflowTemplates: [], servicePricingSnapshots: [], notificationUnreadCount: 0,
      deletedUserIds: [], deletedRoleIds: [], deletedTaskStatuses: [], deletedClientIds: [],
    } : {}),
    isCreateTaskModalOpen: false,
    backend: { ...state.backend, isLoading: false, isSaving: false, isPulling: false, isRestoring: false, hasLocalChanges: false, hasRemoteUpdate: false, pendingMutations: 0, pendingCommandType: undefined, conflict: undefined, status: shouldUseSupabase() ? 'live' : 'local' },
  }));
};

// A bounded, local report contains timings/outcomes only, never workspace data.
let diagnosticSaveStart: number | null = null;
useStore.subscribe((state, previous) => {
  if (state.backend.isSaving && !previous.backend.isSaving) diagnosticSaveStart = performance.now();
  if (!state.backend.isSaving && previous.backend.isSaving && diagnosticSaveStart !== null) {
    recordDiagnostic('save', performance.now() - diagnosticSaveStart, state.backend.hasLocalChanges ? 'failed' : 'ok'); diagnosticSaveStart = null;
  }
  if (state.backend.status === 'conflict' && previous.backend.status !== 'conflict') recordDiagnostic('conflict', 0, 'failed');
});

