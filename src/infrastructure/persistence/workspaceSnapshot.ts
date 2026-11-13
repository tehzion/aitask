import { normalizeClientKey } from '../../modules/clients/application/clientScope';
import {
  applyPricingSnapshot,
  SHORT_VIDEO_WORKFLOW_TEMPLATE
} from '../../modules/services/domain/serviceManagement';
import { ensureBuiltinRoleTemplate, normalizeUserAccount, normalizeWorkspaceUserForBackend, sanitizePersistedUsers, seedUserIdentity, stripPassword } from '../../modules/users/application/memberNormalization';
import {
  canManageServiceCatalog,
  canManageTaskTemplates,
  canViewServicePrices
} from '../../shared/authorization/access';
import {
  type ClientProfile,
  type CustomRole,
  type User
} from '../../shared/types/index';
import { type BackendRuntimeState, type StoreState } from '../../shared/types/workspaceStore';
import { getBackendStatus, shouldUseSupabase } from '../config/backend';
import {
  shouldUseSecureSupabase
} from '../database/supabaseClient';
import { parseWorkspaceSnapshot } from '../serialization/security';
import type { PersistedWorkspaceState, SnapshotResult } from './supabaseSnapshot';
export const sensitiveSnapshotKeyPattern = /(password|secret|token|api[_-]?key|service[_-]?role)/i;

export const safePasswordMetadataKeys = new Set(['mustResetPassword', 'must_reset_password']);

export const stripSensitiveWorkspaceFields = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stripSensitiveWorkspaceFields);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => safePasswordMetadataKeys.has(key) || !sensitiveSnapshotKeyPattern.test(key))
      .map(([key, item]) => [key, stripSensitiveWorkspaceFields(item)])
  );
};

export const sanitizeWorkspaceStateForSnapshot = (
  state: Pick<StoreState, 'users' | 'clients' | 'projects' | 'tasks' | 'notifications' | 'registrations' | 'rolePermissions' | 'taskStatuses' | 'deletedUserIds' | 'deletedRoleIds' | 'deletedTaskStatuses' | 'deletedClientIds' | 'servicePackages' | 'clientPlans' | 'serviceCycles' | 'serviceCyclePayments' | 'deliverables' | 'cycleComments' | 'addons' | 'serviceWorkflowTemplates' | 'servicePricingSnapshots'>
): PersistedWorkspaceState => stripSensitiveWorkspaceFields({
  users: state.users.map(user => stripPassword(user as User & { password?: string })),
  clients: state.clients || [],
  projects: state.projects,
  tasks: state.tasks,
  notifications: state.notifications || [],
  registrations: (state.registrations || []).map(registration => stripPassword(registration)),
  rolePermissions: state.rolePermissions || [],
  taskStatuses: state.taskStatuses || [],
  deletedUserIds: state.deletedUserIds || [],
  deletedRoleIds: state.deletedRoleIds || [],
  deletedTaskStatuses: state.deletedTaskStatuses || [],
  deletedClientIds: state.deletedClientIds || [],
  servicePackages: state.servicePackages || [],
  clientPlans: state.clientPlans || [],
  serviceCycles: state.serviceCycles || [],
  serviceCyclePayments: state.serviceCyclePayments || [],
  deliverables: state.deliverables || [],
  cycleComments: state.cycleComments || [],
  addons: state.addons || [],
  serviceWorkflowTemplates: state.serviceWorkflowTemplates || [],
  servicePricingSnapshots: state.servicePricingSnapshots || [],
}) as PersistedWorkspaceState;

export const selectPersistedWorkspaceState = sanitizeWorkspaceStateForSnapshot;

export const makeBackendRuntimeState = (): BackendRuntimeState => {
  const status = getBackendStatus();
  return {
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
  };
};

export const normalizeWorkspaceState = (state: PersistedWorkspaceState): PersistedWorkspaceState => {
  const parsed = parseWorkspaceSnapshot(state);
  const pricingByParent = new Map(parsed.servicePricingSnapshots.map(item => [item.parentId, item]));
  const clients = [...parsed.clients];
  const byKey = new Map(clients.map(client => [normalizeClientKey(client.clientName), client]));
  // A company discovered from a plan, project, task, or client account should
  // inherit that record's creator so the owning PM/Staff keeps seeing it under
  // portfolio scoping. Rows with no derivable owner stay ownerless (Boss Koo).
  const ownerByKey = new Map<string, string>();
  const rememberOwner = (name: string | undefined, ownerId: string | undefined) => {
    const key = normalizeClientKey(name || '');
    if (!key || !ownerId || ownerByKey.has(key)) return;
    ownerByKey.set(key, ownerId);
  };
  (parsed.clientPlans || []).forEach(plan => rememberOwner(plan.clientName, plan.createdBy));
  parsed.projects.forEach(project => rememberOwner(project.clientName, project.createdBy));
  parsed.tasks.forEach(task => rememberOwner(task.clientName, task.createdBy));
  parsed.users
    .filter(user => user.role === 'Client' && user.companyName)
    .forEach(user => rememberOwner(user.companyName, user.id));
  // Account metadata can retain a deleted company name. Only work records
  // should discover a missing company profile.
  const discoveredNames = [
    ...parsed.tasks.map(task => task.clientName),
    ...parsed.projects.map(project => project.clientName),
  ].map(name => name.trim()).filter(Boolean);

  discoveredNames.forEach(name => {
    const key = normalizeClientKey(name);
    if (byKey.has(key)) return;
    const now = new Date(0).toISOString();
    const slug = key.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'client';
    const client: ClientProfile = { id: `CL-${slug}`, clientName: name, createdBy: ownerByKey.get(key), discovered: true, createdAt: now, updatedAt: now };
    byKey.set(key, client);
    clients.push(client);
  });

  const clientIds = new Set(clients.map(client => client.id));
  const clientIdsByKey = new Map<string, Set<string>>();
  clients.forEach(client => {
    const key = normalizeClientKey(client.clientName);
    if (!key) return;
    const ids = clientIdsByKey.get(key) || new Set<string>();
    ids.add(client.id);
    clientIdsByKey.set(key, ids);
  });
  // Reattach legacy rows only when their stored client ID no longer resolves
  // and the normalized company name points to one unambiguous profile. Keep
  // valid IDs authoritative because names can become stale after a rename.
  const resolveClientId = (clientId: string | undefined, clientName: string | undefined) => {
    if (clientId && clientIds.has(clientId)) return clientId;
    const matches = clientIdsByKey.get(normalizeClientKey(clientName || ''));
    return matches?.size === 1 ? matches.values().next().value : clientId;
  };

  return {
    ...parsed,
    clients,
    tasks: parsed.tasks.map(task => ({ ...task, clientId: resolveClientId(task.clientId, task.clientName) })),
    projects: parsed.projects.map(project => ({ ...project, clientId: resolveClientId(project.clientId, project.clientName) })),
    clientPlans: parsed.clientPlans.map(item => applyPricingSnapshot({ ...item, clientId: resolveClientId(item.clientId, item.clientName) }, pricingByParent.get(item.id))),
    serviceCycles: parsed.serviceCycles.map(item => applyPricingSnapshot({ ...item, clientId: resolveClientId(item.clientId, item.clientName) }, pricingByParent.get(item.id))),
    deliverables: parsed.deliverables.map(item => ({ ...item, clientId: resolveClientId(item.clientId, item.clientName) })),
    cycleComments: parsed.cycleComments.map(item => ({ ...item, clientId: resolveClientId(item.clientId, item.clientName) })),
    addons: parsed.addons.map(item => applyPricingSnapshot({ ...item, clientId: resolveClientId(item.clientId, item.clientName) }, pricingByParent.get(item.id))),
    serviceWorkflowTemplates: parsed.serviceWorkflowTemplates.length ? parsed.serviceWorkflowTemplates : [{ ...SHORT_VIDEO_WORKFLOW_TEMPLATE, steps: SHORT_VIDEO_WORKFLOW_TEMPLATE.steps.map(step => ({ ...step })) }],
  };
};

export const workspaceStatesEqual = (left: PersistedWorkspaceState, right: PersistedWorkspaceState) => (
  JSON.stringify(normalizeWorkspaceState(left)) === JSON.stringify(normalizeWorkspaceState(right))
);

export const getCurrentUserFromSnapshot = (currentUser: User | null, users: User[]) => {
  if (!currentUser) return null;
  const nextUser = users.find(user => user.id === currentUser.id);
  return nextUser ? stripPassword(normalizeUserAccount(nextUser)) as User : null;
};

export const excludedServiceMetadataEntityTypes = (user: User | null | undefined, rolePermissions: CustomRole[]) => {
  const excluded = new Set<string>();
  if (!canManageTaskTemplates(user, rolePermissions)) excluded.add('service_workflow_template');
  if (!canManageServiceCatalog(user, rolePermissions)) excluded.add('service_package');
  if (!canViewServicePrices(user, rolePermissions)) excluded.add('service_pricing_snapshot');
  return excluded;
};

export const makeWorkspacePatch = (current: StoreState, snapshot: SnapshotResult) => {
  const workspace = normalizeWorkspaceState(snapshot.state);
  const secureAuth = shouldUseSecureSupabase();
  const users = workspace.users.map(user => normalizeWorkspaceUserForBackend(user, secureAuth));
  return {
    ...workspace,
    users,
    rolePermissions: ensureBuiltinRoleTemplate(workspace.rolePermissions || []),
    taskStatuses: workspace.taskStatuses && workspace.taskStatuses.length > 0
      ? workspace.taskStatuses
      : ['Pending', 'In Progress', 'Waiting Approval', 'Completed', 'Cancelled'],
    currentUser: getCurrentUserFromSnapshot(current.currentUser, users),
  };
};

export const mergePersistedWorkspace = (persistedState: unknown, currentState: StoreState): StoreState => {
  if (shouldUseSupabase() || !persistedState || typeof persistedState !== 'object') return currentState;
  const persisted = persistedState as Record<string, unknown>;
  const normalized = normalizeWorkspaceState(persisted as unknown as PersistedWorkspaceState);
  const persistedCurrentUser = persisted.currentUser as User | null | undefined;
  const persistedUserId = typeof persistedCurrentUser?.id === 'string' ? persistedCurrentUser.id : '';
  const users = sanitizePersistedUsers(normalized.users);
  const rehydratedUser = persistedUserId ? users.find(user => user.id === persistedUserId) ?? null : null;
  let currentUser: User | null = null;
  if (rehydratedUser) {
    currentUser = stripPassword({ ...rehydratedUser, mustResetPassword: persistedCurrentUser?.mustResetPassword === true }) as User;
  } else if (persistedCurrentUser) {
    const seed = seedUserIdentity.get(persistedCurrentUser.id);
    currentUser = stripPassword({
      ...persistedCurrentUser,
      isSuperAdmin: seed?.isSuperAdmin === true,
      password: undefined,
    }) as User;
  }
  return {
    ...currentState,
    ...normalized,
    users,
    currentUser,
  };
};

export const workspaceMutationFields: Array<keyof StoreState> = [
  'users', 'clients', 'projects', 'tasks', 'notifications', 'registrations', 'rolePermissions', 'taskStatuses',
  'deletedUserIds', 'deletedRoleIds', 'deletedTaskStatuses', 'deletedClientIds',
  'servicePackages', 'clientPlans', 'serviceCycles', 'serviceCyclePayments', 'deliverables', 'cycleComments', 'addons',
  'serviceWorkflowTemplates', 'servicePricingSnapshots',
];
