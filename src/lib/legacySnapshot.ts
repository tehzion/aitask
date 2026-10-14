import type { AppNotification, ClientProfile, Project, Registration, Task, TaskApprovalEvent, TaskComment, User } from '../types';
import type { PersistedWorkspaceState } from './supabaseSnapshot';
import type { LegacySnapshotRuntime } from '../store';
export { loadSupabaseSnapshot, saveSupabaseSnapshot } from './supabaseSnapshot';

// Legacy snapshot recovery stays available without inflating secure workspace startup.
export const createLegacySnapshotMerge = (runtime: LegacySnapshotRuntime) => {
  const { normalizeWorkspaceState, ensureBuiltinRoleTemplate, defaultTaskStatuses, legacyDemoTaskIdSet, retiredDemoUserIdSet, seededProjectIds, seededUserIds } = runtime;
  const getTime = (value?: string) => value ? new Date(value).getTime() || 0 : 0;

  const mergeEntityCollections = <T extends { id: string; updatedAt?: string }>(local: T[] = [], remote: T[] = []) => {
    const byId = new Map<string, T>();
    [...local, ...remote].forEach(item => {
      const existing = byId.get(item.id);
      if (!existing || getTime(item.updatedAt) >= getTime(existing.updatedAt)) byId.set(item.id, item);
    });
    return Array.from(byId.values());
  };

  const isLocalItemWorthRecovering = <T extends { id: string; updatedAt?: string }>(
    item: T,
    remoteItems: Map<string, T>,
    seededIds?: Set<string>
  ) => {
    const remoteItem = remoteItems.get(item.id);
    if (!remoteItem) return !seededIds?.has(item.id);
    return getTime(item.updatedAt) > getTime(remoteItem.updatedAt);
  };

  const hasRecoverableLocalWorkspaceContent = (
    localRaw: PersistedWorkspaceState,
    remoteRaw: PersistedWorkspaceState
  ) => {
    const local = normalizeWorkspaceState(localRaw);
    const remote = normalizeWorkspaceState(remoteRaw);
    const remoteTasks = new Map(remote.tasks.map(item => [item.id, item]));
    const remoteClients = new Map((remote.clients || []).map(item => [item.id, item]));
    const remoteProjects = new Map(remote.projects.map(item => [item.id, item]));
    const remoteUsers = new Map(remote.users.map(item => [item.id, item]));
    const remoteRoles = new Map(remote.rolePermissions.map(item => [item.id, item]));
    const remoteRegistrations = new Set(remote.registrations.map(item => item.id));
    const remoteNotifications = new Set(remote.notifications.map(item => item.id));
    const remoteStatuses = new Set(remote.taskStatuses.map(status => status.toLowerCase()));
    const defaultStatuses = new Set(defaultTaskStatuses.map(status => status.toLowerCase()));
    const remoteDeletedClientIds = new Set(remote.deletedClientIds || []);

    return (
      local.tasks.some(task => (
        !legacyDemoTaskIdSet.has(task.id) &&
        !retiredDemoUserIdSet.has(task.assignedTo) &&
        !retiredDemoUserIdSet.has(task.createdBy) &&
        isLocalItemWorthRecovering(task, remoteTasks)
      )) ||
      (local.clients || []).some(client => !remoteDeletedClientIds.has(client.id) && isLocalItemWorthRecovering(client, remoteClients)) ||
      local.projects.some(project => isLocalItemWorthRecovering(project, remoteProjects, seededProjectIds)) ||
      local.users.some(user => !retiredDemoUserIdSet.has(user.id) && isLocalItemWorthRecovering(user, remoteUsers, seededUserIds)) ||
      local.rolePermissions.some(role => isLocalItemWorthRecovering(role, remoteRoles)) ||
      local.registrations.some(registration => !remoteRegistrations.has(registration.id)) ||
      local.notifications.some(notification => (
        (!notification.targetUserId || !retiredDemoUserIdSet.has(notification.targetUserId)) &&
        !remoteNotifications.has(notification.id)
      )) ||
      local.taskStatuses.some(status => !defaultStatuses.has(status.toLowerCase()) && !remoteStatuses.has(status.toLowerCase()))
      || (local.servicePackages || []).some(item => isLocalItemWorthRecovering(item, new Map((remote.servicePackages || []).map(remoteItem => [remoteItem.id, remoteItem]))))
      || (local.clientPlans || []).some(item => isLocalItemWorthRecovering(item, new Map((remote.clientPlans || []).map(remoteItem => [remoteItem.id, remoteItem]))))
      || (local.serviceCycles || []).some(item => isLocalItemWorthRecovering(item, new Map((remote.serviceCycles || []).map(remoteItem => [remoteItem.id, remoteItem]))))
      || (local.serviceWorkflowTemplates || []).some(item => isLocalItemWorthRecovering(item, new Map((remote.serviceWorkflowTemplates || []).map(remoteItem => [remoteItem.id, remoteItem]))))
    );
  };

  const mergeWorkspaceStates = (
    localRaw: PersistedWorkspaceState,
    remoteRaw: PersistedWorkspaceState,
    lastSyncedAt: string
  ): PersistedWorkspaceState => {
    const local = normalizeWorkspaceState(localRaw);
    const remote = normalizeWorkspaceState(remoteRaw);
    const lastSyncedTime = new Date(lastSyncedAt || 0).getTime();

    // 0. Merge Tombstones
    const mergedDeletedUserIds = Array.from(new Set([
      ...(local.deletedUserIds || []),
      ...(remote.deletedUserIds || [])
    ]));
    const mergedDeletedRoleIds = Array.from(new Set([
      ...(local.deletedRoleIds || []),
      ...(remote.deletedRoleIds || [])
    ]));
    const mergedDeletedTaskStatuses = Array.from(new Set([
      ...(local.deletedTaskStatuses || []),
      ...(remote.deletedTaskStatuses || [])
    ]));
    const mergedDeletedClientIds = Array.from(new Set([
      ...(local.deletedClientIds || []),
      ...(remote.deletedClientIds || [])
    ]));

    // 1. Merge Tasks
    const localTasksMap = new Map(local.tasks.map(t => [t.id, t]));
    const remoteTasksMap = new Map(remote.tasks.map(t => [t.id, t]));
    const allTaskIds = new Set([...localTasksMap.keys(), ...remoteTasksMap.keys()]);
  
    const mergedTasks: Task[] = Array.from(allTaskIds).map(id => {
      const localTask = localTasksMap.get(id);
      const remoteTask = remoteTasksMap.get(id);

      if (!localTask) return remoteTask!;
      if (!remoteTask) return localTask;

      const localUpdated = localTask.updatedAt ? new Date(localTask.updatedAt).getTime() : 0;
      const remoteUpdated = remoteTask.updatedAt ? new Date(remoteTask.updatedAt).getTime() : 0;

      const wasLocalModified = localUpdated > lastSyncedTime;
      const wasRemoteModified = remoteUpdated > lastSyncedTime;

      if (wasLocalModified && !wasRemoteModified) {
        return localTask;
      }
      if (wasRemoteModified && !wasLocalModified) {
        return remoteTask;
      }

      // Overlapping changes or neither modified - merge comments/approval history, LWW on fields
      const mergedCommentsMap = new Map<string, TaskComment>();
      [...(localTask.comments || []), ...(remoteTask.comments || [])].forEach(c => {
        mergedCommentsMap.set(c.id, c);
      });
      const mergedComments = Array.from(mergedCommentsMap.values()).sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );

      const mergedApprovalMap = new Map<string, TaskApprovalEvent>();
      [...(localTask.approvalHistory || []), ...(remoteTask.approvalHistory || [])].forEach(h => {
        mergedApprovalMap.set(h.id, h);
      });
      const mergedApprovalHistory = Array.from(mergedApprovalMap.values()).sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );

      const baseTask = localUpdated >= remoteUpdated ? localTask : remoteTask;
    
      return {
        ...baseTask,
        comments: mergedComments,
        approvalHistory: mergedApprovalHistory,
        updatedAt: new Date(Math.max(localUpdated, remoteUpdated)).toISOString(),
      };
    });

    // 2. Merge Client Profiles
    const localClientsMap = new Map((local.clients || []).map(client => [client.id, client]));
    const remoteClientsMap = new Map((remote.clients || []).map(client => [client.id, client]));
    const allClientIds = new Set([...localClientsMap.keys(), ...remoteClientsMap.keys()]);
    const mergedClients: ClientProfile[] = Array.from(allClientIds)
      .filter(id => !mergedDeletedClientIds.includes(id))
      .map(id => {
        const localClient = localClientsMap.get(id);
        const remoteClient = remoteClientsMap.get(id);

        if (!localClient) return remoteClient!;
        if (!remoteClient) return localClient;

        const localUpdated = localClient.updatedAt ? new Date(localClient.updatedAt).getTime() : 0;
        const remoteUpdated = remoteClient.updatedAt ? new Date(remoteClient.updatedAt).getTime() : 0;

        const wasLocalModified = localUpdated > lastSyncedTime;
        const wasRemoteModified = remoteUpdated > lastSyncedTime;

        if (wasLocalModified && !wasRemoteModified) return localClient;
        if (wasRemoteModified && !wasLocalModified) return remoteClient;
        return localUpdated >= remoteUpdated ? localClient : remoteClient;
      });

    // 3. Merge Projects
    const localProjMap = new Map(local.projects.map(p => [p.id, p]));
    const remoteProjMap = new Map(remote.projects.map(p => [p.id, p]));
    const allProjIds = new Set([...localProjMap.keys(), ...remoteProjMap.keys()]);

    const mergedProjects: Project[] = Array.from(allProjIds).map(id => {
      const localProj = localProjMap.get(id);
      const remoteProj = remoteProjMap.get(id);

      if (!localProj) return remoteProj!;
      if (!remoteProj) return localProj;

      const localUpdated = localProj.updatedAt ? new Date(localProj.updatedAt).getTime() : 0;
      const remoteUpdated = remoteProj.updatedAt ? new Date(remoteProj.updatedAt).getTime() : 0;

      const wasLocalModified = localUpdated > lastSyncedTime;
      const wasRemoteModified = remoteUpdated > lastSyncedTime;

      if (wasLocalModified && !wasRemoteModified) {
        return localProj;
      }
      if (wasRemoteModified && !wasLocalModified) {
        return remoteProj;
      }

      return localUpdated >= remoteUpdated ? localProj : remoteProj;
    });

    // 4. Merge Users
    const localUsersMap = new Map(local.users.map(u => [u.id, u]));
    const remoteUsersMap = new Map(remote.users.map(u => [u.id, u]));
    const allUserIds = new Set([...localUsersMap.keys(), ...remoteUsersMap.keys()]);
    const mergedUsers: User[] = Array.from(allUserIds)
      .filter(id => !mergedDeletedUserIds.includes(id))
      .map(id => {
        const localUser = localUsersMap.get(id);
        const remoteUser = remoteUsersMap.get(id);

        if (!localUser) return remoteUser!;
        if (!remoteUser) return localUser;

        const localUpdated = localUser.updatedAt ? new Date(localUser.updatedAt).getTime() : 0;
        const remoteUpdated = remoteUser.updatedAt ? new Date(remoteUser.updatedAt).getTime() : 0;

        const wasLocalModified = localUpdated > lastSyncedTime;
        const wasRemoteModified = remoteUpdated > lastSyncedTime;

        if (wasLocalModified && !wasRemoteModified) {
          return localUser;
        }
        if (wasRemoteModified && !wasLocalModified) {
          return remoteUser;
        }

        return localUpdated >= remoteUpdated ? localUser : remoteUser;
      });

    // 5. Merge Registrations
    const localRegsMap = new Map(local.registrations.map(r => [r.id, r]));
    const remoteRegsMap = new Map(remote.registrations.map(r => [r.id, r]));
    const allRegIds = new Set([...localRegsMap.keys(), ...remoteRegsMap.keys()]);
    const mergedRegistrations: Registration[] = Array.from(allRegIds).map(id => {
      const localReg = localRegsMap.get(id);
      const remoteReg = remoteRegsMap.get(id);
      if (!localReg) return remoteReg!;
      if (!remoteReg) return localReg;
      if (remoteReg.status !== 'Pending') return remoteReg;
      return localReg;
    });

    // 6. Merge Notifications
    const localNotifsMap = new Map(local.notifications.map(n => [n.id, n]));
    const remoteNotifsMap = new Map(remote.notifications.map(n => [n.id, n]));
    const allNotifIds = new Set([...localNotifsMap.keys(), ...remoteNotifsMap.keys()]);
    const mergedNotifications: AppNotification[] = Array.from(allNotifIds).map(id => {
      const localNotif = localNotifsMap.get(id);
      const remoteNotif = remoteNotifsMap.get(id);
      if (!localNotif) return remoteNotif!;
      if (!remoteNotif) return localNotif;
      const unreadByUserIds = Array.from(new Set([
        ...(localNotif.unreadByUserIds || []),
        ...(remoteNotif.unreadByUserIds || [])
      ]));
      const readByUserIds = Array.from(new Set([
        ...(localNotif.readByUserIds || []),
        ...(remoteNotif.readByUserIds || [])
      ])).filter(userId => !unreadByUserIds.includes(userId));
      return {
        ...remoteNotif,
        isRead: (localNotif.isRead || remoteNotif.isRead) && unreadByUserIds.length === 0,
        readByUserIds,
        unreadByUserIds,
      };
    });

    // 7. Merge Task Statuses
    const mergedTaskStatuses = Array.from(new Set([
      ...(local.taskStatuses || []),
      ...(remote.taskStatuses || [])
    ])).filter(status => !mergedDeletedTaskStatuses.includes(status.toLowerCase()));

    // 8. Merge Custom Roles
    const localRolesMap = new Map((local.rolePermissions || []).map(r => [r.id, r]));
    const remoteRolesMap = new Map((remote.rolePermissions || []).map(r => [r.id, r]));
    const allRoleIds = new Set([...localRolesMap.keys(), ...remoteRolesMap.keys()]);
    const mergedRolePermissions = Array.from(allRoleIds)
      .filter(id => !mergedDeletedRoleIds.includes(id))
      .map(id => {
        const localRole = localRolesMap.get(id);
        const remoteRole = remoteRolesMap.get(id);

        if (!localRole) return remoteRole!;
        if (!remoteRole) return localRole;

        const localUpdated = localRole.updatedAt ? new Date(localRole.updatedAt).getTime() : 0;
        const remoteUpdated = remoteRole.updatedAt ? new Date(remoteRole.updatedAt).getTime() : 0;

        const wasLocalModified = localUpdated > lastSyncedTime;
        const wasRemoteModified = remoteUpdated > lastSyncedTime;

        if (wasLocalModified && !wasRemoteModified) {
          return localRole;
        }
        if (wasRemoteModified && !wasLocalModified) {
          return remoteRole;
        }

        return localUpdated >= remoteUpdated ? localRole : remoteRole;
      });

    return {
      users: mergedUsers,
      clients: mergedClients,
      projects: mergedProjects,
      tasks: mergedTasks,
      notifications: mergedNotifications,
      registrations: mergedRegistrations,
      rolePermissions: ensureBuiltinRoleTemplate(mergedRolePermissions),
      taskStatuses: mergedTaskStatuses,
      deletedUserIds: mergedDeletedUserIds,
      deletedRoleIds: mergedDeletedRoleIds,
      deletedTaskStatuses: mergedDeletedTaskStatuses,
      deletedClientIds: mergedDeletedClientIds,
      servicePackages: mergeEntityCollections(local.servicePackages, remote.servicePackages),
      clientPlans: mergeEntityCollections(local.clientPlans, remote.clientPlans),
      serviceCycles: mergeEntityCollections(local.serviceCycles, remote.serviceCycles),
      deliverables: mergeEntityCollections(local.deliverables, remote.deliverables),
      cycleComments: mergeEntityCollections(local.cycleComments, remote.cycleComments),
      addons: mergeEntityCollections(local.addons, remote.addons),
      serviceWorkflowTemplates: mergeEntityCollections(local.serviceWorkflowTemplates, remote.serviceWorkflowTemplates),
      servicePricingSnapshots: mergeEntityCollections(local.servicePricingSnapshots, remote.servicePricingSnapshots),
    };
  };

  return { hasRecoverableLocalWorkspaceContent, mergeWorkspaceStates };
};
