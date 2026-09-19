import { AppNotification, ClientProfile, CustomRole, Project, Role, RolePermissionKey, RolePermissions, Task, User } from '../types';
import { getMemberDepartments, isMemberInDepartment } from './departments';

export type DashboardPersona = 'boss' | 'projectManager' | 'operation' | 'account' | 'production' | 'client';

/**
 * Optional ownership context for scoped-role visibility. When supplied, a
 * Project Managers also see tasks and projects that belong to the
 * companies they created. Boss Koo is never scoped.
 */
export type VisibilityScope = {
  clients?: ClientProfile[];
  projects?: Project[];
};

export type TaskAccess = {
  canView: boolean;
  canEdit: boolean;
  canComment: boolean;
  canDelete: boolean;
  canAssign: boolean;
};

const ownedClientKeys = (user: User, scope: VisibilityScope) => new Set(
  (scope.clients || [])
    .filter(client => client.createdBy === user.id)
    .map(client => client.clientName.trim().toLowerCase())
);

const ownedProjectIds = (user: User, scope: VisibilityScope) => new Set(
  (scope.projects || [])
    .filter(project => project.createdBy === user.id)
    .map(project => project.id)
);

export type AppPath = '/' | '/tasks' | '/calendar' | '/clients' | '/projects' | '/reports' | '/approvals' | '/settings';

export const appNavigation: { label: string; path: AppPath }[] = [
  { label: 'Dashboard', path: '/' },
  { label: 'Calendar', path: '/calendar' },
  { label: 'Delivery tracker', path: '/clients' },
  { label: 'Companies', path: '/projects' },
  { label: 'Reports', path: '/reports' },
  { label: 'Approvals', path: '/approvals' },
];

export const permissionLabels: Record<RolePermissionKey, string> = {
  viewDashboard: 'Dashboard access',
  viewTasks: 'Tasks access',
  viewCalendar: 'Calendar access',
  viewProjects: 'Companies access',
  viewDeliveryTracker: 'Task tracker access',
  viewAllTasks: 'View all tasks',
  viewAllClients: 'View all clients',
  manageAssignedClients: 'Manage assigned clients',
  viewReports: 'Reports access',
  viewApprovals: 'Approvals access',
  viewSettings: 'Settings access',
  createTasks: 'Create tasks',
  editTasks: 'Edit every task (Boss Koo only)',
  manageCreatedTasks: 'Manage tasks I create',
  createProjects: 'Create companies',
  createClients: 'Add companies',
  deleteClients: 'Delete companies',
  manageUsers: 'Manage users',
  approveRegistrations: 'Approve registrations',
  deleteUsers: 'Delete users',
  clientReview: 'Client review actions',
  manageServiceCatalog: 'Manage service packages',
  manageTaskTemplates: 'Manage task workflow templates',
  manageClientPlans: 'Manage client service plans',
  manageServiceCycles: 'Manage service cycles and deliverables',
  viewAllServiceClients: 'View all service clients',
  viewAssignedServiceClients: 'View assigned service clients',
  viewServicePrices: 'View internal service prices',
  viewProductionReports: 'View production reports',
};

export const permissionGroups: { title: string; keys: RolePermissionKey[] }[] = [
  { title: 'Page Access', keys: ['viewDashboard', 'viewTasks', 'viewCalendar', 'viewProjects', 'viewDeliveryTracker', 'viewReports', 'viewApprovals', 'viewSettings'] },
  { title: 'Task Access', keys: ['viewAllTasks', 'createTasks', 'manageCreatedTasks'] },
  { title: 'Client Access', keys: ['viewAllClients', 'manageAssignedClients', 'createClients', 'deleteClients', 'viewAllServiceClients', 'viewAssignedServiceClients', 'viewServicePrices'] },
  { title: 'Service Management', keys: ['manageServiceCatalog', 'manageTaskTemplates', 'manageClientPlans', 'manageServiceCycles'] },
  { title: 'Workflow Actions', keys: ['createProjects', 'clientReview'] },
];

const makePermissions = (enabled: RolePermissionKey[]): RolePermissions => {
  const keys = Object.keys(permissionLabels) as RolePermissionKey[];
  return keys.reduce((permissions, key) => ({
    ...permissions,
    [key]: enabled.includes(key),
  }), {} as RolePermissions);
};

export const allPermissions: RolePermissions = makePermissions(Object.keys(permissionLabels) as RolePermissionKey[]);
export const nonSuperAdminOnlyPermissionKeys: RolePermissionKey[] = [
  'editTasks',
  'manageUsers',
  'approveRegistrations',
  'deleteUsers',
  'viewProductionReports',
  'viewApprovals',
];

// HOD is editable, but its department scope and operational boundary are
// invariants. These permissions must never turn an HOD into a workspace-wide
// or service-administration role.
export const hodRestrictedPermissionKeys: RolePermissionKey[] = [
  'viewAllTasks',
  'viewAllClients',
  'viewApprovals',
  'manageServiceCatalog',
  'manageTaskTemplates',
  'manageClientPlans',
  'manageServiceCycles',
  'viewAllServiceClients',
  'viewServicePrices',
];

export const sanitizeNonSuperAdminPermissions = (permissions: RolePermissions): RolePermissions => {
  const sanitized = { ...permissions };
  nonSuperAdminOnlyPermissionKeys.forEach(key => {
    sanitized[key] = false;
  });
  return sanitized;
};

export const sanitizeRolePermissions = (permissions: RolePermissions, baseRole: Role): RolePermissions => {
  const sanitized = sanitizeNonSuperAdminPermissions(permissions);
  if (baseRole === 'HOD') {
    hodRestrictedPermissionKeys.forEach(key => {
      sanitized[key] = false;
    });
  }
  return sanitized;
};

// Per-role defaults. Project Managers are scoped to the
// companies/projects/clients they own, so their defaults intentionally omit
// viewAllTasks/viewAllClients and any per-member override of those keys is
// ignored by the scoped visibility functions; Boss Koo always sees everything.
export const defaultRolePermissions: Record<Role, RolePermissions> = {
  'Project Manager': makePermissions([
    'viewDashboard',
    'viewTasks',
    'viewCalendar',
    'viewProjects',
    'viewDeliveryTracker',
    'viewReports',
    'viewSettings',
    'createTasks',
    'manageCreatedTasks',
    'createProjects',
    'createClients',
    'deleteClients',
    'manageServiceCatalog',
    'manageTaskTemplates',
    'manageClientPlans',
    'manageServiceCycles',
    'viewAllServiceClients',
    'viewServicePrices',
  ]),
  HOD: makePermissions([
    'viewDashboard',
    'viewTasks',
    'viewCalendar',
    'viewProjects',
    'viewDeliveryTracker',
    'viewReports',
    'viewSettings',
    'createTasks',
    'manageCreatedTasks',
    'createClients',
    'deleteClients',
    'viewAssignedServiceClients',
  ]),
  Staff: makePermissions([
    'viewDashboard',
    'viewTasks',
    'viewCalendar',
    'viewProjects',
    'viewDeliveryTracker',
    'viewReports',
    'viewSettings',
    'createTasks',
    'viewAssignedServiceClients',
  ]),
  Client: makePermissions([
    'viewDashboard',
    'viewTasks',
    'viewCalendar',
    'viewProjects',
    'viewDeliveryTracker',
    'viewReports',
    'viewSettings',
    'clientReview',
  ]),
};

const routePermission: Record<AppPath, RolePermissionKey> = {
  '/': 'viewDashboard',
  '/tasks': 'viewTasks',
  '/calendar': 'viewCalendar',
  '/clients': 'viewDeliveryTracker',
  '/projects': 'viewProjects',
  '/reports': 'viewReports',
  '/approvals': 'viewApprovals',
  '/settings': 'viewSettings',
};

export const isBossKoo = (user: User | null | undefined) => Boolean(user?.isSuperAdmin);
export const isProjectManager = (user: User | null | undefined) => user?.role === 'Project Manager';
export const BUILTIN_HOD_ROLE_ID = 'builtin-hod';

export const getDashboardPersona = (user: User | null | undefined): DashboardPersona => {
  if (isBossKoo(user)) return 'boss';
  if (user?.role === 'Project Manager') return 'projectManager';
  if (user?.role === 'Client') return 'client';
  const departments = getMemberDepartments(user);
  if (departments.includes('Operation')) return 'operation';
  if (departments.includes('Account & Finance')) return 'account';
  return 'production';
};

export const getEffectivePermissions = (
  user: User | null | undefined,
  customRoles: CustomRole[] = []
): RolePermissions => {
  if (!user) return makePermissions([]);
  if (isBossKoo(user)) return allPermissions;

  const customRole = user.customRoleId
    ? customRoles.find(role => role.id === user.customRoleId)
    : undefined;
  const builtinRole = customRoles.find(role => role.isBuiltin && role.baseRole === user.role);

  const directPermissions = user.permissions && Object.keys(user.permissions).length > 0
    ? user.permissions
    : undefined;
  // A per-member override layers on top of the member's custom role so a saved
  // override never silently revokes the role's own grants. Without a custom
  // role it remains the complete effective set, matching the server.
  const source = directPermissions
    ? (customRole ? { ...customRole.permissions, ...directPermissions } : { ...(builtinRole?.permissions || defaultRolePermissions[user.role]), ...directPermissions })
    : (customRole?.permissions || builtinRole?.permissions || defaultRolePermissions[user.role]);
  const permissions = makePermissions(
    (Object.keys(permissionLabels) as RolePermissionKey[]).filter(key => (
      source[key] === true
      || (key === 'viewDeliveryTracker' && source.viewDeliveryTracker === undefined && source.viewProjects === true)
    ))
  );
  return sanitizeRolePermissions(permissions, user.role);
};

export const isHodRole = (role: CustomRole | null | undefined) => Boolean(role?.isBuiltin && role.baseRole === 'HOD');
export const isHodUser = (user: User | null | undefined, customRoles: CustomRole[] = []) => (
  Boolean(user?.role === 'HOD' || (user?.customRoleId && customRoles.some(role => role.id === user.customRoleId && isHodRole(role))))
);
/**
 * True when an internal member's effective role is limited to their own
 * departments — either the built-in HOD role or a custom role that opted into
 * department scoping. Super admins and non-Staff roles are never scoped.
 */
export const isDepartmentScopedUser = (user: User | null | undefined, customRoles: CustomRole[] = []) => {
  if (!user || isBossKoo(user)) return false;
  if (user.role === 'HOD') return true;
  if (user.role !== 'Staff') return false;
  const customRole = user.customRoleId ? customRoles.find(role => role.id === user.customRoleId) : undefined;
  return isHodRole(customRole) || customRole?.departmentScoped === true;
};
export const getAssignableCustomRoles = (userRole: Role, customRoles: CustomRole[] = []) => (
  customRoles.filter(role => role.baseRole === userRole)
);

export const getRoleDisplayName = (role: Role | null | undefined) => {
  if (!role) return '';
  return role;
};

export const getEffectiveRoleName = (user: User | null | undefined, customRoles: CustomRole[] = []) => {
  if (!user) return 'Unknown';
  if (isBossKoo(user)) return 'Boss Koo';
  const customRole = user.customRoleId
    ? customRoles.find(role => role.id === user.customRoleId)
    : undefined;
  return user.customRoleName || customRole?.name || getRoleDisplayName(user.role);
};

export const hasPermission = (
  user: User | null | undefined,
  permission: RolePermissionKey,
  customRoles: CustomRole[] = []
) => getEffectivePermissions(user, customRoles)[permission];

export const canManageUsers = (user: User | null | undefined, customRoles: CustomRole[] = []) => hasPermission(user, 'manageUsers', customRoles);
export const canCreateUsers = (user: User | null | undefined, customRoles: CustomRole[] = []) => {
  void customRoles;
  return isBossKoo(user);
};
export const canApproveRegistrations = (user: User | null | undefined, customRoles: CustomRole[] = []) => {
  void customRoles;
  return isBossKoo(user);
};
export const canDeleteUser = (actor: User | null | undefined, target: User | null | undefined, customRoles: CustomRole[] = []) => {
  void customRoles;
  return Boolean(actor && target && isBossKoo(actor) && actor.id !== target.id && !isBossKoo(target));
};
export const canCreateTasks = (user: User | null | undefined, customRoles: CustomRole[] = []) => hasPermission(user, 'createTasks', customRoles);
export const canViewAllTasks = (user: User | null | undefined, customRoles: CustomRole[] = []) => (
  hasPermission(user, 'viewAllTasks', customRoles) || hasPermission(user, 'editTasks', customRoles)
);
export const canManageTasks = (user: User | null | undefined, customRoles: CustomRole[] = []) => (
  hasPermission(user, 'createTasks', customRoles)
  || hasPermission(user, 'manageCreatedTasks', customRoles)
  || hasPermission(user, 'editTasks', customRoles)
);
export const canManageProjects = (user: User | null | undefined, customRoles: CustomRole[] = []) => hasPermission(user, 'createProjects', customRoles);
export const canManageServiceCatalog = (user: User | null | undefined, customRoles: CustomRole[] = []) => hasPermission(user, 'manageServiceCatalog', customRoles);
export const canManageTaskTemplates = (user: User | null | undefined, customRoles: CustomRole[] = []) => hasPermission(user, 'manageTaskTemplates', customRoles);
export const canManageClientPlans = (user: User | null | undefined, customRoles: CustomRole[] = []) => hasPermission(user, 'manageClientPlans', customRoles);
export const canManageServiceCycles = (user: User | null | undefined, customRoles: CustomRole[] = []) => hasPermission(user, 'manageServiceCycles', customRoles);
export const canViewServicePrices = (user: User | null | undefined, customRoles: CustomRole[] = []) => hasPermission(user, 'viewServicePrices', customRoles);
export const canViewProductionReports = (user: User | null | undefined, customRoles: CustomRole[] = []) => hasPermission(user, 'viewProductionReports', customRoles);
export const canOpenServiceClient = (
  user: User | null | undefined,
  clientName: string,
  tasks: Task[] = [],
  customRoles: CustomRole[] = [],
  profiles: ClientProfile[] = [],
) => {
  if (!user) return false;
  const clientKey = getClientKey(clientName);
  if (user.role === 'Client') return getClientKey(user.companyName) === clientKey;
  if (isBossKoo(user)) return true;
  if (user.role === 'Project Manager') {
    if (!clientKey) return false;
    const ownsProfile = profiles.some(profile => profile.createdBy === user.id && getClientKey(profile.clientName) === clientKey);
    if (ownsProfile) return true;
    return tasks.some(task => (
      getClientKey(task.clientName) === clientKey
      && (task.createdBy === user.id || task.assignedTo === user.id)
    ));
  }
  if (hasPermission(user, 'viewAllServiceClients', customRoles)) return true;
  if (!['Staff', 'HOD'].includes(user.role) || !hasPermission(user, 'viewAssignedServiceClients', customRoles)) return false;
  return Boolean(clientKey) && tasks.some(task => task.assignedTo === user.id && getClientKey(task.clientName) === clientKey);
};
export const canManageClientProfiles = (
  user: User | null | undefined,
  clientName?: string,
  profiles: ClientProfile[] = []
) => {
  if (!user) return false;
  if (isBossKoo(user)) return true;
  if (user.role !== 'Project Manager') return false;
  if (!clientName) return true;
  const profile = profiles.find(item => getClientKey(item.clientName) === getClientKey(clientName));
  return profile?.createdBy === user.id;
};
export const canCreateClientProfiles = (user: User | null | undefined, customRoles: CustomRole[] = []) => (
  Boolean(user) && (isBossKoo(user) || user.role === 'Project Manager' || hasPermission(user, 'createClients', customRoles))
);
export const canDeleteClientProfiles = (user: User | null | undefined, customRoles: CustomRole[] = []) => (
  Boolean(user) && (isBossKoo(user) || user.role === 'Project Manager' || hasPermission(user, 'deleteClients', customRoles))
);
export const canDeleteClientProfile = (
  user: User | null | undefined,
  clientName: string,
  profiles: ClientProfile[] = [],
  customRoles: CustomRole[] = []
) => {
  if (isBossKoo(user)) return true;
  if (user?.role === 'Project Manager') {
    const profile = profiles.find(item => getClientKey(item.clientName) === getClientKey(clientName));
    return profile?.createdBy === user.id;
  }
  return canDeleteClientProfiles(user, customRoles);
};
export const getClientKey = (value: string | null | undefined) => value?.trim().toLowerCase() || '';
export const canEditClientProfile = (
  user: User | null | undefined,
  clientName: string,
  tasks: Task[] = [],
  customRoles: CustomRole[] = [],
  profiles: ClientProfile[] = []
) => {
  if (isBossKoo(user)) return true;
  const clientKey = getClientKey(clientName);
  if (user?.role === 'Project Manager') {
    const profile = profiles.find(item => getClientKey(item.clientName) === clientKey);
    if (profile?.createdBy === user.id) return true;
    if (profile) return false;
    return Boolean(clientKey) && tasks.some(task => (
      getClientKey(task.clientName) === clientKey && (task.createdBy === user.id || task.assignedTo === user.id)
    ));
  }
  if (!['Staff', 'HOD'].includes(user?.role || '') || !hasPermission(user, 'manageAssignedClients', customRoles)) return false;
  return Boolean(clientKey) && tasks.some(task => (
    task.assignedTo === user.id && getClientKey(task.clientName) === clientKey
  ));
};
export const canViewAllClients = (user: User | null | undefined, customRoles: CustomRole[] = []) => (
  Boolean(user && user.role !== 'Client'
    && (isBossKoo(user) || (user.role !== 'Project Manager' && user.role !== 'HOD' && hasPermission(user, 'viewAllClients', customRoles))))
);
export const getVisibleClientNames = (
  user: User | null | undefined,
  tasks: Task[] = [],
  projects: Project[] = [],
  customRoles: CustomRole[] = [],
  scope: VisibilityScope = {}
) => {
  if (!user) return [];
  if (user.role === 'Client') return user.companyName ? [user.companyName] : [];

  const collectNames = (names: string[]) => Array.from(new Map(
    names
      .map(name => name.trim())
      .filter(Boolean)
      .map(name => [getClientKey(name), name])
  ).values()).sort((a, b) => a.localeCompare(b));

  if (canViewAllClients(user, customRoles)) {
    return collectNames([
      ...tasks.map(task => task.clientName),
      ...projects.map(project => project.clientName),
    ]);
  }

  if (user.role === 'Project Manager') {
    return collectNames([
      ...(scope.clients || []).filter(client => client.createdBy === user.id).map(client => client.clientName),
      ...getVisibleTasks(user, tasks, customRoles, scope).map(task => task.clientName),
      ...getVisibleProjects(user, projects, tasks, customRoles, scope).map(project => project.clientName),
    ]);
  }

  if (!['Staff', 'HOD'].includes(user.role)) return [];

  return collectNames(
    getVisibleTasks(user, tasks, customRoles, scope).map(task => task.clientName)
  );
};
export const canRenameClient = (
  user: User | null | undefined,
  clientName?: string,
  profiles: ClientProfile[] = []
) => canManageClientProfiles(user, clientName, profiles);
export const canAssignTasksToOthers = (
  user: User | null | undefined,
  customRoles: CustomRole[] = [],
  task?: Task,
) => (
  isBossKoo(user)
  || (user?.role !== 'HOD' && hasPermission(user, 'editTasks', customRoles))
  || (hasPermission(user, 'manageCreatedTasks', customRoles) && (!task || task.createdBy === user?.id))
);

export const canViewTask = (
  user: User | null | undefined,
  task: Task,
  customRoles: CustomRole[] = [],
  scope: VisibilityScope = {},
) => {
  if (!user) return false;
  if (user.role === 'Client') {
    return getClientKey(task.clientName) === getClientKey(user.companyName) && task.visibility !== 'internal';
  }
  if (isBossKoo(user)) return true;
  if (user.role === 'Project Manager') {
    const clientKeys = ownedClientKeys(user, scope);
    const projectIds = ownedProjectIds(user, scope);
    return task.assignedTo === user.id
      || task.createdBy === user.id
      || clientKeys.has(getClientKey(task.clientName))
      || (Boolean(task.projectId) && projectIds.has(task.projectId as string));
  }
  if (user.role !== 'HOD' && canViewAllTasks(user, customRoles)) return true;
  if (['Staff', 'HOD'].includes(user.role)) {
    return task.assignedTo === user.id
      || task.createdBy === user.id
      || (isDepartmentScopedUser(user, customRoles) && isMemberInDepartment(user, task.department));
  }
  return false;
};

export const canEditTask = (user: User | null | undefined, task: Task, customRoles: CustomRole[] = []) => (
  isBossKoo(user) ||
  (user?.role !== 'HOD' && hasPermission(user, 'editTasks', customRoles)) ||
  (['Staff', 'HOD', 'Project Manager'].includes(user?.role || '') && task.assignedTo === user.id) ||
  (['Staff', 'HOD', 'Project Manager'].includes(user?.role || '') && task.createdBy === user.id) ||
  (isDepartmentScopedUser(user, customRoles) && isMemberInDepartment(user, task.department))
);
export const canDeleteTask = canEditTask;
export const isProjectParticipant = (user: User | null | undefined, project: Project, tasks: Task[] = []) => {
  if (!user) return false;
  return tasks.some(task => (
    task.projectId === project.id &&
    task.assignedTo === user.id
  ));
};
export const canEditProject = (
  user: User | null | undefined,
  project: Project,
  customRoles: CustomRole[] = []
) => {
  void customRoles;
  return Boolean(user) && (isBossKoo(user) || project.createdBy === user.id);
};
export const canDeleteProject = canEditProject;
export const canReviewTaskAsClient = (user: User | null | undefined, task: Task, customRoles: CustomRole[] = []) => (
  user?.role === 'Client' &&
  task.visibility !== 'internal' &&
  hasPermission(user, 'clientReview', customRoles) &&
  getClientKey(user.companyName) === getClientKey(task.clientName) &&
  (task.isCompleted || task.status === 'Waiting Approval') &&
  task.clientApprovalStatus !== 'Approved'
);
export const canCommentOnTask = (user: User | null | undefined, task: Task, customRoles: CustomRole[] = []) => (
  canEditTask(user, task, customRoles) ||
  (
    user?.role === 'Client' &&
    task.visibility !== 'internal' &&
    Boolean(user.companyName) &&
    getClientKey(user.companyName) === getClientKey(task.clientName) &&
    hasPermission(user, 'clientReview', customRoles)
  )
);

export const getTaskAccess = (
  user: User | null | undefined,
  task: Task,
  customRoles: CustomRole[] = [],
  scope: VisibilityScope = {},
): TaskAccess => {
  const canView = canViewTask(user, task, customRoles, scope);
  const canEdit = canView && canEditTask(user, task, customRoles);
  const canComment = canView && canCommentOnTask(user, task, customRoles);
  const canDelete = canEdit;
  const canAssign = canEdit && canAssignTasksToOthers(user, customRoles, task);
  return { canView, canEdit, canComment, canDelete, canAssign };
};

export const canAccessPath = (user: User | null | undefined, path: string, customRoles: CustomRole[] = []) => {
  if (!user) return false;
  const firstSegment = path.split('?')[0].replace(/^\/+/, '').split('/')[0];
  const route = (firstSegment ? `/${firstSegment}` : '/') as AppPath;

  // Clients is the merged task workspace. Preserve access for custom roles
  // that were granted the former Tasks page but not the tracker page.
  if (route === '/clients') {
    return hasPermission(user, 'viewDeliveryTracker', customRoles)
      || hasPermission(user, 'viewTasks', customRoles);
  }
  const permission = routePermission[route];
  return permission ? hasPermission(user, permission, customRoles) : false;
};

export const getCompaniesDashboardAction = (
  user: User | null | undefined,
  customRoles: CustomRole[] = [],
) => {
  if (!user || user.role === 'Client' || !canAccessPath(user, '/projects', customRoles)) return null;
  const canCreateProfile = canCreateClientProfiles(user, customRoles);
  const canManagePlans = canManageClientPlans(user, customRoles);
  if (canCreateProfile && canManagePlans) return 'Add client or plan';
  if (canCreateProfile) return 'Add client';
  if (canManagePlans) return 'Manage client plans';
  return 'View companies';
};

export const getVisibleNavigation = (user: User | null | undefined, customRoles: CustomRole[] = []) => (
  appNavigation.filter(item => canAccessPath(user, item.path, customRoles))
);

export const getDefaultAccessiblePath = (
  user: User | null | undefined,
  customRoles: CustomRole[] = []
): AppPath => {
  const firstPage = getVisibleNavigation(user, customRoles)[0];
  if (firstPage) return firstPage.path;
  return canAccessPath(user, '/settings', customRoles) ? '/settings' : '/';
};

export const getVisibleTasks = (
  user: User | null | undefined,
  tasks: Task[],
  customRoles: CustomRole[] = [],
  scope: VisibilityScope = {}
) => {
  if (!user) return [];
  return tasks.filter(task => canViewTask(user, task, customRoles, scope));
};

export const getVisibleProjects = (
  user: User | null | undefined,
  projects: Project[],
  tasks: Task[] = [],
  customRoles: CustomRole[] = [],
  scope: VisibilityScope = {}
) => {
  if (!user) return [];
  if (user.role === 'Client') return projects.filter(project => getClientKey(project.clientName) === getClientKey(user.companyName));
  if (isBossKoo(user)) return projects;
  const visibleProjectIds = new Set(
    getVisibleTasks(user, tasks, customRoles, scope)
      .map(task => task.projectId)
      .filter((id): id is string => Boolean(id))
  );
  if (user.role === 'Project Manager') {
    const clientKeys = ownedClientKeys(user, scope);
    return projects.filter(project => (
      project.createdBy === user.id
      || clientKeys.has(getClientKey(project.clientName))
      || visibleProjectIds.has(project.id)
    ));
  }
  if (['Staff', 'HOD'].includes(user.role)) {
    return projects.filter(project => project.createdBy === user.id || visibleProjectIds.has(project.id));
  }
  return [];
};

export const getAssignableProjects = (
  user: User | null | undefined,
  projects: Project[],
  tasks: Task[] = [],
  customRoles: CustomRole[] = [],
  users: User[] = [],
) => {
  if (!user) return [];
  if (!['Staff', 'HOD'].includes(user.role)) return getVisibleProjects(user, projects, tasks, customRoles);
  return projects.filter(project => canLinkTaskToProject(user, project, tasks, customRoles, users));
};

/**
 * Task-to-project links are more restrictive than project listing: a Staff
 * member may use their own project (even before its first task), a project
 * already connected to work they can see, or a legacy/Boss-curated project
 * when they may create tasks. This keeps another Staff/HOD member's empty
 * project, and another Project Manager's project, out of the task form.
 */
export const canLinkTaskToProject = (
  user: User | null | undefined,
  project: Project,
  tasks: Task[] = [],
  customRoles: CustomRole[] = [],
  users: User[] = [],
) => {
  if (!user || user.role === 'Client') return false;
  if (isBossKoo(user)) return true;
  if (user.role === 'Project Manager') return project.createdBy === user.id;
  if (!['Staff', 'HOD'].includes(user.role)) return false;
  if (project.createdBy === user.id) return true;

  const linkedTasks = tasks.filter(task => task.projectId === project.id);
  const hasVisibleProjectTask = getVisibleTasks(user, linkedTasks, customRoles).length > 0;
  if (hasVisibleProjectTask) return true;

  if (linkedTasks.length > 0) {
    return linkedTasks.some(task => isMemberInDepartment(user, task.department));
  }
  if (!canCreateTasks(user, customRoles)) return false;

  if (!project.createdBy) return true;
  const creator = users.find(member => member.id === project.createdBy);
  return Boolean(creator && isBossKoo(creator));
};

export const isNotificationVisible = (user: User | null | undefined, notification: AppNotification) => {
  if (!user) return false;
  if (notification.visibleToCurrentUser) return true;
  if (notification.targetUserId && notification.targetUserId === user.id) return true;
  // Supabase RLS note: Boss Koo maps to super_admin, but must still receive admin-scoped operational notices.
  if (notification.targetRole === 'Project Manager' && isBossKoo(user)) return true;
  if (user.role !== 'Client' && notification.targetRole && notification.targetRole === user.role) return true;
  if (notification.targetClient && user.role === 'Client' && getClientKey(notification.targetClient) === getClientKey(user.companyName)) return true;
  return false;
};

export const isNotificationReadByUser = (user: User | null | undefined, notification: AppNotification) => {
  if (user && notification.unreadByUserIds?.includes(user.id)) return false;
  if (!user) return Boolean(notification.isRead);
  if (notification.readByUserIds !== undefined) return notification.readByUserIds.includes(user.id);
  return Boolean(notification.isRead);
};

export const getUnreadNotifications = (
  user: User | null | undefined,
  notifications: AppNotification[] = []
) => notifications.filter(notification => (
  isNotificationVisible(user, notification) && !isNotificationReadByUser(user, notification)
));
