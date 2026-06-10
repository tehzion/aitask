import { AppNotification, CustomRole, Project, Role, RolePermissionKey, RolePermissions, Task, User } from '../types';

export type AppPath = '/' | '/tasks' | '/calendar' | '/projects' | '/reports' | '/approvals' | '/settings';

export const appNavigation: { label: string; path: AppPath }[] = [
  { label: 'Dashboard', path: '/' },
  { label: 'Tasks', path: '/tasks' },
  { label: 'Calendar', path: '/calendar' },
  { label: 'Projects', path: '/projects' },
  { label: 'Reports', path: '/reports' },
  { label: 'Approvals', path: '/approvals' },
];

export const permissionLabels: Record<RolePermissionKey, string> = {
  viewDashboard: 'Dashboard access',
  viewTasks: 'Tasks access',
  viewCalendar: 'Calendar access',
  viewProjects: 'Projects access',
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
  { title: 'Workflow Actions', keys: ['createTasks', 'editTasks', 'createProjects', 'manageUsers', 'approveRegistrations', 'deleteUsers', 'clientReview'] },
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

  return user.permissions || customRole?.permissions || defaultRolePermissions[user.role];
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
export const canManageTasks = (user: User | null | undefined, customRoles: CustomRole[] = []) => (
  hasPermission(user, 'createTasks', customRoles) || hasPermission(user, 'editTasks', customRoles)
);
export const canManageProjects = (user: User | null | undefined, customRoles: CustomRole[] = []) => hasPermission(user, 'createProjects', customRoles);
export const canEditTask = (user: User | null | undefined, task: Task, customRoles: CustomRole[] = []) => (
  hasPermission(user, 'editTasks', customRoles) || (user?.role === 'Staff' && task.assignedTo === user.id)
);
export const canReviewTaskAsClient = (user: User | null | undefined, task: Task, customRoles: CustomRole[] = []) => (
  user?.role === 'Client' &&
  hasPermission(user, 'clientReview', customRoles) &&
  user.companyName === task.clientName &&
  (task.isCompleted || task.status === 'Waiting Approval') &&
  task.clientApprovalStatus !== 'Approved'
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

export const getVisibleTasks = (user: User | null | undefined, tasks: Task[]) => {
  if (!user) return [];
  if (user.role === 'Client') return tasks.filter(task => task.clientName === user.companyName);
  return tasks;
};

export const getVisibleProjects = (user: User | null | undefined, projects: Project[]) => {
  if (!user) return [];
  if (user.role === 'Client') return projects.filter(project => project.clientName === user.companyName);
  return projects;
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
  if (notification.readByUserIds) return notification.readByUserIds.includes(user.id);
  return Boolean(notification.isRead);
};
