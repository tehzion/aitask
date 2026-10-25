import {
  shouldUseSecureSupabase
} from '../infrastructure/database/supabaseClient';
import { getCurrentUserFromSnapshot } from '../infrastructure/persistence/workspaceSnapshot';
import { shouldShowDemoLogin } from '../modules/authentication/domain/auth';
import { normalizeUserAccount } from '../modules/users/application/memberNormalization';
import { type StoreState, type WorkspaceGet, type WorkspaceSet } from '../shared/types/workspaceStore';
import { getLocalServiceDemoVersion, hasLocalServiceData, legacyDemoTaskIdSet, replaceLocalServiceDemoRecords, retiredDemoUserIdSet, setLocalServiceDemoVersion } from './demoRuntime';
import { mockProjects, mockTasks, mockUsers } from './index';
import {
  createLocalServiceDemoFixture,
  isLocalServiceDemoEnabled,
  LOCAL_SERVICE_DEMO_VERSION
} from './localServiceDemo';
export const createDemoActions = (set: WorkspaceSet, get: WorkspaceGet): Pick<StoreState, "_forceSyncMockData" | "resetLocalServiceDemo"> => ({
  _forceSyncMockData: () => {
    if (!(import.meta.env.DEV || import.meta.env.VITE_AITASK_BACKEND === 'local')) return;
    if (!shouldShowDemoLogin() || get().backend.mode === 'supabase' || shouldUseSecureSupabase()) return;

    set((state) => {
      // Keep local development seeds compatible without touching hosted workspaces.
      const usersWithProtectedOwner = state.users
        .filter(user => !retiredDemoUserIdSet.has(user.id))
        .map(user => {
          const isBoss = user.id === 'u-boss' || user.name === 'Boss Koo';
          const normalizedUser = normalizeUserAccount(user);

          return {
            ...normalizedUser,
            ...(isBoss ? { isSuperAdmin: true } : {}),
          };
        });

      const newUsers = mockUsers
        .filter(mu => !usersWithProtectedOwner.some(su => su.id === mu.id))
        .map(user => normalizeUserAccount(user));
      const newProjects = mockProjects.filter(mp => !state.projects.some(sp => sp.id === mp.id));
      const retiredTaskIds = new Set(state.tasks
        .filter(task => retiredDemoUserIdSet.has(task.assignedTo) || retiredDemoUserIdSet.has(task.createdBy))
        .map(task => task.id));
      const tasksWithoutLegacyDemo = state.tasks.filter(task => (
        !legacyDemoTaskIdSet.has(task.id) && !retiredTaskIds.has(task.id)
      ));
      const notificationsWithoutRetiredDemo = state.notifications.filter(notification => (
        !notification.targetUserId || !retiredDemoUserIdSet.has(notification.targetUserId)
      ) && (
          !notification.route.entityId || !retiredTaskIds.has(notification.route.entityId)
        ));
      const newTasks = mockTasks.filter(mt => !tasksWithoutLegacyDemo.some(st => st.id === mt.id));
      const nextUsers = [...usersWithProtectedOwner, ...newUsers];
      const normalizedUsersChanged = usersWithProtectedOwner.some(user => {
        const previous = state.users.find(item => item.id === user.id);
        if (!previous) return true;
        return Boolean(previous.password) ||
          previous.mustResetPassword !== user.mustResetPassword ||
          previous.isSuperAdmin !== user.isSuperAdmin;
      });

      if (
        !normalizedUsersChanged &&
        newUsers.length === 0 &&
        newProjects.length === 0 &&
        newTasks.length === 0 &&
        usersWithProtectedOwner.length === state.users.length &&
        tasksWithoutLegacyDemo.length === state.tasks.length &&
        notificationsWithoutRetiredDemo.length === state.notifications.length
      ) {
        return state;
      }

      return {
        users: nextUsers,
        currentUser: getCurrentUserFromSnapshot(state.currentUser, nextUsers),
        projects: [...state.projects, ...newProjects],
        tasks: [...tasksWithoutLegacyDemo, ...newTasks],
        notifications: notificationsWithoutRetiredDemo,
      };
    });

    // The service walkthrough is intentionally limited to an explicitly local browser
    // workspace. It never creates a pending mutation or reaches a Supabase command.
    if (!(import.meta.env.DEV || import.meta.env.VITE_AITASK_BACKEND === 'local')
      || !isLocalServiceDemoEnabled() || hasLocalServiceData(get()) || getLocalServiceDemoVersion() === LOCAL_SERVICE_DEMO_VERSION) return;

    const fixture = createLocalServiceDemoFixture();
    const demoUserIds = new Set(fixture.users.map(user => user.id));
    set((state) => {
      const users = [
        ...state.users.filter(user => !demoUserIds.has(user.id)),
        ...fixture.users.map(user => normalizeUserAccount(user)),
      ];
      return {
        users,
        currentUser: getCurrentUserFromSnapshot(state.currentUser, users),
        clients: [...state.clients, ...fixture.clients],
        tasks: [...state.tasks, ...fixture.tasks],
        servicePackages: [...state.servicePackages, ...fixture.servicePackages],
        clientPlans: [...state.clientPlans, ...fixture.clientPlans],
        serviceCycles: [...state.serviceCycles, ...fixture.serviceCycles],
        deliverables: [...state.deliverables, ...fixture.deliverables],
        cycleComments: [...state.cycleComments, ...fixture.cycleComments],
        addons: [...state.addons, ...fixture.addons],
        serviceWorkflowTemplates: [
          ...state.serviceWorkflowTemplates,
          ...fixture.serviceWorkflowTemplates.filter(template => !state.serviceWorkflowTemplates.some(item => item.id === template.id)),
        ],
        servicePricingSnapshots: [...state.servicePricingSnapshots, ...fixture.servicePricingSnapshots],
      };
    });
    setLocalServiceDemoVersion();
  },
  resetLocalServiceDemo: () => {
    if (!(import.meta.env.DEV || import.meta.env.VITE_AITASK_BACKEND === 'local')) return { ok: false, error: 'The sample workspace is available only in an explicit local browser session.' };
    const state = get();
    if (!isLocalServiceDemoEnabled() || state.backend.mode !== 'local' || shouldUseSecureSupabase()) {
      return { ok: false, error: 'The sample workspace is available only in an explicit local browser session.' };
    }
    if (!state.currentUser || state.currentUser.role !== 'Project Manager') {
      return { ok: false, error: 'Only a Project Manager or Boss Koo can reset the sample workspace.' };
    }

    const fixture = createLocalServiceDemoFixture();
    const demoUserIds = new Set(fixture.users.map(user => user.id));
    set((current) => {
      const users = [
        ...current.users.filter(user => !demoUserIds.has(user.id)),
        ...fixture.users.map(user => normalizeUserAccount(user)),
      ];
      return {
        users,
        currentUser: getCurrentUserFromSnapshot(current.currentUser, users),
        clients: replaceLocalServiceDemoRecords(current.clients, fixture.clients),
        tasks: replaceLocalServiceDemoRecords(current.tasks, fixture.tasks),
        servicePackages: replaceLocalServiceDemoRecords(current.servicePackages, fixture.servicePackages),
        clientPlans: replaceLocalServiceDemoRecords(current.clientPlans, fixture.clientPlans),
        serviceCycles: replaceLocalServiceDemoRecords(current.serviceCycles, fixture.serviceCycles),
        deliverables: replaceLocalServiceDemoRecords(current.deliverables, fixture.deliverables),
        cycleComments: replaceLocalServiceDemoRecords(current.cycleComments, fixture.cycleComments),
        addons: replaceLocalServiceDemoRecords(current.addons, fixture.addons),
        serviceWorkflowTemplates: [
          ...current.serviceWorkflowTemplates,
          ...fixture.serviceWorkflowTemplates.filter(template => !current.serviceWorkflowTemplates.some(item => item.id === template.id)),
        ],
        servicePricingSnapshots: replaceLocalServiceDemoRecords(current.servicePricingSnapshots, fixture.servicePricingSnapshots),
      };
    });
    setLocalServiceDemoVersion();
    return { ok: true };
  }
});
