import { AppNotification, CustomRole, Department, Project, Role, RolePermissionKey, RolePermissions, Task, User } from '../types';
import { getMemberDepartments, isMemberInDepartment } from './departments';

export type DashboardPersona = 'boss' | 'admin' | 'operation' | 'account' | 'production' | 'client';

export type AppPath = '/' | '/tasks' | '/calendar' | '/clients' | '/projects' | '/reports' | '/approvals' | '/settings';

export const appNavigation: { label: string; path: AppPath }[] = [
  { label: 'Dashboard', path: '/' },
  { label: 'Tasks', path: '/tasks' },
  { label: 'Calendar', path: '/calendar' },
  { label: 'Clients', path: '/clients' },
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
  { title: 'Client Access', keys: ['viewAllClients', 'manageAssignedClients', 'viewAllServiceClients', 'viewAssignedServiceClients', 'viewServicePrices'] },
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
];

export const sanitizeNonSuperAdminPermissions = (permissions: RolePermissions): RolePermissions => {
  const sanitized = { ...permissions };
  nonSuperAdminOnlyPermissionKeys.forEach(key => {
    sanitized[key] = false;
  });
  return sanitized;
};

export const defaultRolePermissions: Record<Role, RolePermissions> = {
  Admin: makePermissions([
    'viewDashboard',
    'viewTasks',
    'viewCalendar',
    'viewProjects',
    'viewDeliveryTracker',
    'viewAllTasks',
    'viewAllClients',
    'manageAssignedClients',
    'viewReports',
    'viewSettings',
    'createTasks',
    'manageCreatedTasks',
    'createProjects',
    'manageServiceCatalog',
    'manageTaskTemplates',
    'manageClientPlans',
    'manageServiceCycles',
    'viewAllServiceClients',
    'viewAssignedServiceClients',
    'viewServicePrices',
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
export const isAdmin = (user: User | null | undefined) => user?.role === 'Admin';
export const SYSTEM_HOD_ROLE_ID = 'system-hod';

export const getDashboardPersona = (user: User | null | undefined): DashboardPersona => {
  if (isBossKoo(user)) return 'boss';
  if (user?.role === 'Admin') return 'admin';
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

  const directPermissions = user.permissions && Object.keys(user.permissions).length > 0
    ? user.permissions
    : undefined;
  const source = directPermissions || customRole?.permissions || defaultRolePermissions[user.role];
  const permissions = makePermissions(
    (Object.keys(permissionLabels) as RolePermissionKey[]).filter(key => (
      source[key] === true
      || (key === 'viewDeliveryTracker' && source.viewDeliveryTracker === undefined && source.viewProjects === true)
    ))
  );
  return sanitizeNonSuperAdminPermissions(permissions);
};

export const isHodRole = (role: CustomRole | null | undefined) => role?.id === SYSTEM_HOD_ROLE_ID;
export const isHodUser = (user: User | null | undefined, customRoles: CustomRole[] = []) => (
  Boolean(user?.role === 'Staff' && user.customRoleId && customRoles.some(role => role.id === user.customRoleId && isHodRole(role)))
);
export const getAssignableCustomRoles = (userRole: Role, customRoles: CustomRole[] = []) => (
  customRoles.filter(role => role.baseRole === userRole)
);

export const getEffectiveRoleName = (user: User | null | undefined, customRoles: CustomRole[] = []) => {
  if (!user) return 'Unknown';
  if (isBossKoo(user)) return 'Super Admin';
  const customRole = user.customRoleId
    ? customRoles.find(role => role.id === user.customRoleId)
    : undefined;
  return user.customRoleName || customRole?.name || user.role;
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
) => {
  if (!user) return false;
  if (user.role === 'Client') return getClientKey(user.companyName) === getClientKey(clientName);
  if (isBossKoo(user) || user.role === 'Admin' || hasPermission(user, 'viewAllServiceClients', customRoles)) return true;
  if (user.role !== 'Staff' || !hasPermission(user, 'viewAssignedServiceClients', customRoles)) return false;
  const clientKey = getClientKey(clientName);
  return Boolean(clientKey) && tasks.some(task => task.assignedTo === user.id && getClientKey(task.clientName) === clientKey);
};
export const canManageClientProfiles = (user: User | null | undefined) => Boolean(user && (isBossKoo(user) || user.role === 'Admin'));
export const getClientKey = (value: string | null | undefined) => value?.trim().toLowerCase() || '';
export const canEditClientProfile = (
  user: User | null | undefined,
  clientName: string,
  tasks: Task[] = [],
  customRoles: CustomRole[] = []
) => {
  if (canManageClientProfiles(user)) return true;
  if (user?.role !== 'Staff' || !hasPermission(user, 'manageAssignedClients', customRoles)) return false;

  const clientKey = getClientKey(clientName);
  return Boolean(clientKey) && tasks.some(task => (
    task.assignedTo === user.id && getClientKey(task.clientName) === clientKey
  ));
};
export const canViewAllClients = (user: User | null | undefined, customRoles: CustomRole[] = []) => (
  Boolean(user && user.role !== 'Client' && (isBossKoo(user) || user.role === 'Admin' || hasPermission(user, 'viewAllClients', customRoles)))
);
export const getVisibleClientNames = (
  user: User | null | undefined,
  tasks: Task[] = [],
  projects: Project[] = [],
  customRoles: CustomRole[] = []
) => {
  if (!user) return [];
  if (user.role === 'Client') return user.companyName ? [user.companyName] : [];

  if (canViewAllClients(user, customRoles)) {
    return Array.from(new Map(
      [
        ...tasks.map(task => task.clientName),
        ...projects.map(project => project.clientName),
      ]
        .map(name => name.trim())
        .filter(Boolean)
        .map(name => [getClientKey(name), name])
    ).values()).sort((a, b) => a.localeCompare(b));
  }

  if (user.role !== 'Staff') return [];

  const visibleTasks = getVisibleTasks(user, tasks, customRoles);
  return Array.from(new Map(
    visibleTasks
      .map(task => task.clientName)
      .map(name => name.trim())
      .filter(Boolean)
      .map(name => [getClientKey(name), name])
  ).values()).sort((a, b) => a.localeCompare(b));
};
export const canRenameClient = (
  user: User | null | undefined
) => canManageClientProfiles(user);
export const canAssignTasksToOthers = (
  user: User | null | undefined,
  customRoles: CustomRole[] = [],
  task?: Task,
) => (
  hasPermission(user, 'editTasks', customRoles)
  || (hasPermission(user, 'manageCreatedTasks', customRoles) && (!task || task.createdBy === user?.id))
);
export const canEditTask = (user: User | null | undefined, task: Task, customRoles: CustomRole[] = []) => (
  hasPermission(user, 'editTasks', customRoles) ||
  ((user?.role === 'Staff' || user?.role === 'Admin') && task.assignedTo === user.id) ||
  ((user?.role === 'Staff' || user?.role === 'Admin') && hasPermission(user, 'manageCreatedTasks', customRoles) && task.createdBy === user.id)
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
  return Boolean(user) && (
    isBossKoo(user) ||
    user?.role === 'Admin' ||
    (user?.role === 'Staff' && project.createdBy === user.id)
  );
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

export const canAccessPath = (user: User | null | undefined, path: string, customRoles: CustomRole[] = []) => {
  if (!user) return false;
  const firstSegment = path.split('?')[0].replace(/^\/+/, '').split('/')[0];
  const route = (firstSegment ? `/${firstSegment}` : '/') as AppPath;

  const permission = routePermission[route];
  return permission ? hasPermission(user, permission, customRoles) : false;
};

export const getCompaniesDashboardAction = (
  user: User | null | undefined,
  customRoles: CustomRole[] = [],
) => {
  if (!user || user.role === 'Client' || !canAccessPath(user, '/projects', customRoles)) return null;
  const canCreateProfile = canManageClientProfiles(user);
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
  customRoles: CustomRole[] = []
) => {
  if (!user) return [];
  if (user.role === 'Client') return tasks.filter(task => getClientKey(task.clientName) === getClientKey(user.companyName) && task.visibility !== 'internal');
  if (user.role === 'Admin' || isBossKoo(user) || canViewAllTasks(user, customRoles)) return tasks;
  if (user.role === 'Staff') {
    const canManageCreated = hasPermission(user, 'manageCreatedTasks', customRoles);
    return tasks.filter(task => task.assignedTo === user.id || (canManageCreated && task.createdBy === user.id));
  }
  return [];
};

export const getVisibleProjects = (
  user: User | null | undefined,
  projects: Project[],
  tasks: Task[] = [],
  customRoles: CustomRole[] = []
) => {
  if (!user) return [];
  if (user.role === 'Client') return projects.filter(project => getClientKey(project.clientName) === getClientKey(user.companyName));
  if (user.role === 'Admin' || isBossKoo(user)) return projects;
  if (user.role === 'Staff') {
    const visibleProjectIds = new Set(
      getVisibleTasks(user, tasks, customRoles)
        .map(task => task.projectId)
        .filter((id): id is string => Boolean(id))
    );
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
  if (user.role !== 'Staff') return getVisibleProjects(user, projects, tasks, customRoles);
  return projects.filter(project => canLinkTaskToProject(user, project, tasks, customRoles, users));
};

/**
 * Task-to-project links are more restrictive than project listing: a Staff
 * member may use their own project (even before its first task), a project
 * already connected to work they can see, or an Admin-curated/legacy project
 * when they may create tasks. This keeps another Staff/HOD member's empty
 * project out of the task form.
 */
export const canLinkTaskToProject = (
  user: User | null | undefined,
  project: Project,
  tasks: Task[] = [],
  customRoles: CustomRole[] = [],
  users: User[] = [],
) => {
  if (!user || user.role === 'Client') return false;
  if (isBossKoo(user) || user.role === 'Admin') return true;
  if (user.role !== 'Staff') return false;
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
  return Boolean(creator && (creator.role === 'Admin' || isBossKoo(creator)));
};

export const isNotificationVisible = (user: User | null | undefined, notification: AppNotification) => {
  if (!user) return false;
  if (notification.visibleToCurrentUser) return true;
  if (notification.targetUserId && notification.targetUserId === user.id) return true;
  // Supabase RLS note: Boss Koo maps to super_admin, but must still receive admin-scoped operational notices.
  if (notification.targetRole === 'Admin' && isBossKoo(user)) return true;
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
