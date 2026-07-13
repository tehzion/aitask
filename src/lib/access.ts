import { AppNotification, CustomRole, Project, Role, RolePermissionKey, RolePermissions, Task, User } from '../types';

export type AppPath = '/' | '/tasks' | '/calendar' | '/clients' | '/projects' | '/reports' | '/approvals' | '/settings';

export const appNavigation: { label: string; path: AppPath }[] = [
  { label: 'Dashboard', path: '/' },
  { label: 'Tasks', path: '/tasks' },
  { label: 'Calendar', path: '/calendar' },
  { label: 'Clients', path: '/clients' },
  { label: 'Projects', path: '/projects' },
  { label: 'Reports', path: '/reports' },
  { label: 'Approvals', path: '/approvals' },
];

export const permissionLabels: Record<RolePermissionKey, string> = {
  viewDashboard: 'Dashboard access',
  viewTasks: 'Tasks access',
  viewCalendar: 'Calendar access',
  viewProjects: 'Projects access',
  viewAllTasks: 'View all tasks',
  viewAllClients: 'View all clients',
  manageAssignedClients: 'Manage assigned clients',
  viewReports: 'Reports access',
  viewApprovals: 'Approvals access',
  viewSettings: 'Settings access',
  createTasks: 'Create tasks',
  editTasks: 'Edit all tasks',
  createProjects: 'Create projects',
  manageUsers: 'Manage users',
  approveRegistrations: 'Approve registrations',
  deleteUsers: 'Delete users',
  clientReview: 'Client review actions',
};

export const permissionGroups: { title: string; keys: RolePermissionKey[] }[] = [
  { title: 'Page Access', keys: ['viewDashboard', 'viewTasks', 'viewCalendar', 'viewProjects', 'viewReports', 'viewApprovals', 'viewSettings'] },
  { title: 'Task Access', keys: ['viewAllTasks', 'createTasks', 'editTasks'] },
  { title: 'Client Access', keys: ['viewAllClients', 'manageAssignedClients'] },
  { title: 'Workflow Actions', keys: ['createProjects', 'manageUsers', 'approveRegistrations', 'deleteUsers', 'clientReview'] },
];

const makePermissions = (enabled: RolePermissionKey[]): RolePermissions => {
  const keys = Object.keys(permissionLabels) as RolePermissionKey[];
  return keys.reduce((permissions, key) => ({
    ...permissions,
    [key]: enabled.includes(key),
  }), {} as RolePermissions);
};

export const allPermissions: RolePermissions = makePermissions(Object.keys(permissionLabels) as RolePermissionKey[]);

export const defaultRolePermissions: Record<Role, RolePermissions> = {
  Admin: makePermissions([
    'viewDashboard',
    'viewTasks',
    'viewCalendar',
    'viewProjects',
    'viewAllTasks',
    'viewAllClients',
    'manageAssignedClients',
    'viewReports',
    'viewSettings',
    'createTasks',
    'editTasks',
    'createProjects',
  ]),
  Staff: makePermissions([
    'viewDashboard',
    'viewTasks',
    'viewCalendar',
    'viewProjects',
    'viewReports',
    'viewSettings',
    'createTasks',
  ]),
  Client: makePermissions([
    'viewDashboard',
    'viewTasks',
    'viewCalendar',
    'viewProjects',
    'viewReports',
    'viewSettings',
    'clientReview',
  ]),
};

const routePermission: Record<AppPath, RolePermissionKey> = {
  '/': 'viewDashboard',
  '/tasks': 'viewTasks',
  '/calendar': 'viewCalendar',
  '/clients': 'viewProjects',
  '/projects': 'viewProjects',
  '/reports': 'viewReports',
  '/approvals': 'viewApprovals',
  '/settings': 'viewSettings',
};

export const isBossKoo = (user: User | null | undefined) => Boolean(user?.isSuperAdmin);
export const isAdmin = (user: User | null | undefined) => user?.role === 'Admin';

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
  return makePermissions(
    (Object.keys(permissionLabels) as RolePermissionKey[]).filter(key => source[key] === true)
  );
};

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
export const canCreateUsers = (user: User | null | undefined, customRoles: CustomRole[] = []) => canManageUsers(user, customRoles);
export const canApproveRegistrations = (user: User | null | undefined, customRoles: CustomRole[] = []) => hasPermission(user, 'approveRegistrations', customRoles);
export const canDeleteUser = (actor: User | null | undefined, target: User | null | undefined, customRoles: CustomRole[] = []) => (
  Boolean(actor && target && hasPermission(actor, 'deleteUsers', customRoles) && actor.id !== target.id && !isBossKoo(target))
);
export const canCreateTasks = (user: User | null | undefined, customRoles: CustomRole[] = []) => hasPermission(user, 'createTasks', customRoles);
export const canViewAllTasks = (user: User | null | undefined, customRoles: CustomRole[] = []) => (
  hasPermission(user, 'viewAllTasks', customRoles) || hasPermission(user, 'editTasks', customRoles)
);
export const canManageTasks = (user: User | null | undefined, customRoles: CustomRole[] = []) => (
  hasPermission(user, 'createTasks', customRoles) || hasPermission(user, 'editTasks', customRoles)
);
export const canManageProjects = (user: User | null | undefined, customRoles: CustomRole[] = []) => hasPermission(user, 'createProjects', customRoles);
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
export const canAssignTasksToOthers = (user: User | null | undefined, customRoles: CustomRole[] = []) => (
  hasPermission(user, 'editTasks', customRoles)
);
export const canEditTask = (user: User | null | undefined, task: Task, customRoles: CustomRole[] = []) => (
  hasPermission(user, 'editTasks', customRoles) ||
  (user?.role === 'Staff' && task.assignedTo === user.id)
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
) => (
  hasPermission(user, 'createProjects', customRoles) ||
  (user?.role === 'Staff' && project.createdBy === user.id)
);
export const canDeleteProject = canEditProject;
export const canReviewTaskAsClient = (user: User | null | undefined, task: Task, customRoles: CustomRole[] = []) => (
  user?.role === 'Client' &&
  hasPermission(user, 'clientReview', customRoles) &&
  user.companyName === task.clientName &&
  (task.isCompleted || task.status === 'Waiting Approval') &&
  task.clientApprovalStatus !== 'Approved'
);
export const canCommentOnTask = (user: User | null | undefined, task: Task, customRoles: CustomRole[] = []) => (
  canEditTask(user, task, customRoles) ||
  (
    user?.role === 'Client' &&
    Boolean(user.companyName) &&
    user.companyName === task.clientName &&
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

export const getVisibleNavigation = (user: User | null | undefined, customRoles: CustomRole[] = []) => (
  appNavigation.filter(item => canAccessPath(user, item.path, customRoles))
);

export const getVisibleTasks = (
  user: User | null | undefined,
  tasks: Task[],
  customRoles: CustomRole[] = []
) => {
  if (!user) return [];
  if (user.role === 'Client') return tasks.filter(task => task.clientName === user.companyName);
  if (user.role === 'Admin' || isBossKoo(user) || canViewAllTasks(user, customRoles)) return tasks;
  if (user.role === 'Staff') {
    return tasks.filter(task => task.assignedTo === user.id);
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
  if (user.role === 'Client') return projects.filter(project => project.clientName === user.companyName);
  if (user.role === 'Admin' || isBossKoo(user)) return projects;
  if (user.role === 'Staff') {
    const visibleProjectIds = new Set(
      getVisibleTasks(user, tasks, customRoles)
        .map(task => task.projectId)
        .filter((id): id is string => Boolean(id))
    );
    return projects.filter(project => visibleProjectIds.has(project.id));
  }
  return [];
};

export const isNotificationVisible = (user: User | null | undefined, notification: AppNotification) => {
  if (!user) return false;
  if (notification.targetUserId && notification.targetUserId === user.id) return true;
  // Supabase RLS note: Boss Koo maps to super_admin, but must still receive admin-scoped operational notices.
  if (notification.targetRole === 'Admin' && isBossKoo(user)) return true;
  if (notification.targetRole && notification.targetRole === user.role) return true;
  if (notification.targetClient && user.role === 'Client' && notification.targetClient === user.companyName) return true;
  return false;
};

export const isNotificationReadByUser = (user: User | null | undefined, notification: AppNotification) => {
  if (!user) return Boolean(notification.isRead);
  return Boolean(notification.isRead) || Boolean(notification.readByUserIds?.includes(user.id));
};
