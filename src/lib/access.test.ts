import { describe, expect, it } from 'vitest';
import type { CustomRole, Project, RolePermissions, Task, User } from '../types';
import {
  canAssignTasksToOthers,
  canAccessPath,
  canApproveRegistrations,
  canCommentOnTask,
  canCreateClientProfiles,
  canDeleteClientProfiles,
  canCreateUsers,
  canDeleteUser,
  canEditClientProfile,
  canEditProject,
  canEditTask,
  canOpenServiceClient,
  canRenameClient,
  canReviewTaskAsClient,
  canViewAllClients,
  canViewTask,
  allPermissions,
  defaultRolePermissions,
  getEffectivePermissions,
  getAssignableProjects,
  getDefaultAccessiblePath,
  getCompaniesDashboardAction,
  getVisibleClientNames,
  getVisibleProjects,
  getVisibleTasks,
  getTaskAccess,
  getUnreadNotifications,
  isNotificationReadByUser,
  BUILTIN_HOD_ROLE_ID,
} from './access';

const admin: User = { id: 'admin-1', name: 'Project Manager', role: 'Project Manager', departments: ['Management'], department: 'Management' };
const superAdmin: User = { ...admin, id: 'boss-1', name: 'Boss Koo', isSuperAdmin: true };
const staff: User = { id: 'staff-1', name: 'Staff', role: 'Staff', departments: ['Designer'], department: 'Designer' };
const otherStaff: User = { id: 'staff-2', name: 'Other Staff', role: 'Staff', departments: ['Video Editor'], department: 'Editor' };
const acmeClient: User = { id: 'client-1', name: 'Acme Client', role: 'Client', departments: ['Client'], department: 'Client', companyName: 'Acme' };
const members = [admin, superAdmin, staff, otherStaff];

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1',
  clientName: 'Acme',
  serviceType: 'Design',
  title: 'Artwork',
  description: '',
  department: 'Designer',
  assignedTo: staff.id,
  createdBy: admin.id,
  startDate: '2026-07-13',
  dueDate: '',
  priority: 'Medium',
  status: 'Pending',
  completionPercentage: 0,
  isCompleted: false,
  revisionCount: 0,
  clientApprovalStatus: 'Pending',
  isRecurring: false,
  recurrenceFrequency: 'None',
  ...overrides,
});

const projects: Project[] = [
  {
    id: 'project-acme',
    clientName: 'Acme',
    projectName: 'Acme',
    services: ['Design'],
    startDate: '2026-07-13',
    deadline: '',
    totalTasks: 1,
    completedTasks: 0,
  },
  {
    id: 'project-beta',
    clientName: 'Beta',
    projectName: 'Beta',
    services: ['SEO'],
    startDate: '2026-07-13',
    deadline: '',
    totalTasks: 1,
    completedTasks: 0,
  },
];

const tasks = [
  makeTask({ projectId: 'project-acme' }),
  makeTask({ id: 'task-2', projectId: 'project-beta', clientName: 'Beta', assignedTo: otherStaff.id }),
];

describe('staff permission matrix', () => {
  it('reserves member creation and registration approval for the Super Admin', () => {
    expect(getEffectivePermissions(superAdmin)).toEqual(allPermissions);
    expect(Object.values(getEffectivePermissions(superAdmin)).every(Boolean)).toBe(true);
    expect(canCreateUsers(superAdmin)).toBe(true);
    expect(canApproveRegistrations(superAdmin)).toBe(true);
    expect(canCreateUsers(admin)).toBe(false);
    expect(canApproveRegistrations(admin)).toBe(false);
    expect(canCreateUsers(staff)).toBe(false);
    expect(canApproveRegistrations(staff)).toBe(false);
    expect(canCreateUsers(acmeClient)).toBe(false);
    expect(canApproveRegistrations(acmeClient)).toBe(false);
    expect(canDeleteUser(superAdmin, staff)).toBe(true);
    expect(canDeleteUser(admin, staff)).toBe(false);
    expect(canDeleteUser({ ...staff, permissions: { ...defaultRolePermissions.Staff, deleteUsers: true } }, admin)).toBe(false);
  });

  it('lets staff manage assigned work without delegating or editing unrelated work', () => {
    expect(getVisibleTasks(staff, tasks).map(task => task.id)).toEqual(['task-1']);
    expect(canEditTask(staff, tasks[0])).toBe(true);
    expect(canEditTask(staff, tasks[1])).toBe(false);
    expect(canAssignTasksToOthers(staff)).toBe(false);
    expect(canAssignTasksToOthers(admin)).toBe(true);
  });

  it('keeps the default Staff UI and data surface limited to assigned work', () => {
    const routeAccess: Array<[string, boolean]> = [
      ['/', true],
      ['/tasks', true],
      ['/calendar', true],
      ['/projects', true],
      ['/clients', true],
      ['/reports', true],
      ['/settings', true],
      ['/approvals', false],
    ];
    routeAccess.forEach(([path, expected]) => expect(canAccessPath(staff, path)).toBe(expected));

    const permissions = getEffectivePermissions(staff);
    expect(permissions).toMatchObject({
      createTasks: true,
      manageCreatedTasks: false,
      viewAllTasks: false,
      viewAllClients: false,
      manageAssignedClients: false,
      manageUsers: false,
      approveRegistrations: false,
      deleteUsers: false,
    });
    expect(getVisibleClientNames(staff, tasks, projects)).toEqual(['Acme']);
    expect(getVisibleProjects(staff, projects, tasks).map(project => project.id)).toEqual(['project-acme']);
    expect(canOpenServiceClient(staff, 'Acme', [tasks[0]])).toBe(true);
    expect(canOpenServiceClient(staff, 'Beta', [tasks[0]])).toBe(false);
  });

  it('scopes admins to their own tasks and the work inside their companies', () => {
    const scopedTasks = [
      makeTask({ id: 'admin-created', createdBy: admin.id, assignedTo: otherStaff.id, clientName: 'Acme' }),
      makeTask({ id: 'admin-assigned', createdBy: otherStaff.id, assignedTo: admin.id, clientName: 'Beta' }),
      makeTask({ id: 'admin-owned-client', createdBy: otherStaff.id, assignedTo: otherStaff.id, clientName: 'Acme' }),
      makeTask({ id: 'admin-unrelated', createdBy: otherStaff.id, assignedTo: otherStaff.id, clientName: 'Gamma' }),
    ];
    const scope = {
      clients: [{ id: 'c-acme', clientName: 'Acme', createdBy: admin.id, createdAt: '', updatedAt: '' }],
      projects: [],
    };

    expect(getVisibleTasks(admin, scopedTasks, [], scope).map(task => task.id)).toEqual([
      'admin-created',
      'admin-assigned',
      'admin-owned-client',
    ]);
    expect(getVisibleTasks(superAdmin, scopedTasks).map(task => task.id)).toEqual([
      'admin-created',
      'admin-assigned',
      'admin-owned-client',
      'admin-unrelated',
    ]);
  });

  it('scopes clients and projects to connected work while keeping rename Project Manager-only', () => {
    expect(getVisibleClientNames(staff, tasks, projects)).toEqual(['Acme']);
    expect(getVisibleProjects(staff, projects, tasks).map(project => project.id)).toEqual(['project-acme']);
    expect(canRenameClient(staff)).toBe(false);
    expect(canRenameClient(admin)).toBe(true);
  });

  it('offers only Project Manager-created or legacy companies when Staff create tasks', () => {
    const companySet: Project[] = [
      { ...projects[0], createdBy: admin.id },
      { ...projects[1], createdBy: staff.id },
      { ...projects[0], id: 'project-legacy', clientName: 'Legacy', projectName: 'Legacy', createdBy: undefined },
    ];

    expect(getAssignableProjects(staff, companySet, tasks, [], members).map(project => project.id)).toEqual([
      'project-acme',
      'project-beta',
      'project-legacy',
    ]);
    expect(getAssignableProjects(admin, companySet, tasks, [], members).map(project => project.id)).toEqual([
      'project-acme',
      'project-beta',
    ]);
  });

  it('hides other Project Managers’ companies from the Staff create-task dropdown', () => {
    const otherDeptProject: Project = {
      ...projects[0],
      id: 'project-other-dept',
      clientName: 'Video Co',
      projectName: 'Video Co',
      createdBy: admin.id,
    };
    const freshAdminProject: Project = {
      ...projects[0],
      id: 'project-fresh-admin',
      clientName: 'Fresh Co',
      projectName: 'Fresh Co',
      createdBy: admin.id,
    };
    const companySet: Project[] = [
      { ...projects[0], createdBy: admin.id },
      otherDeptProject,
      freshAdminProject,
    ];
    const staffTasks = [
      makeTask({ id: 'designer-task', projectId: 'project-acme', department: 'Designer' }),
      makeTask({ id: 'video-task', projectId: 'project-other-dept', department: 'Video Editor', assignedTo: otherStaff.id }),
    ];

    expect(getAssignableProjects(staff, companySet, staffTasks, [], members).map(project => project.id)).toEqual([
      'project-acme',
    ]);
  });

  it('keeps own empty projects available while hiding another Staff member’s empty project', () => {
    const companySet: Project[] = [
      { ...projects[0], id: 'project-own-empty', clientName: 'Own Empty', projectName: 'Own Empty', createdBy: staff.id },
      { ...projects[0], id: 'project-other-empty', clientName: 'Other Empty', projectName: 'Other Empty', createdBy: otherStaff.id },
      { ...projects[0], id: 'project-admin-empty', clientName: 'Project Manager Empty', projectName: 'Project Manager Empty', createdBy: admin.id },
    ];

    expect(getAssignableProjects(staff, companySet, [], [], members).map(project => project.id)).toEqual([
      'project-own-empty',
    ]);
  });

  it('requires both explicit permission and assignment for staff profile editing', () => {
    const creatorOnlyTask = makeTask({
      id: 'task-created-only',
      clientName: 'Created Co',
      assignedTo: otherStaff.id,
      createdBy: staff.id,
    });
    const permittedStaff: User = {
      ...staff,
      permissions: { ...defaultRolePermissions.Staff, manageAssignedClients: true },
    };

    expect(canEditClientProfile(admin, 'Beta', tasks)).toBe(true);
    expect(canEditClientProfile(staff, 'Acme', tasks)).toBe(false);
    expect(canEditClientProfile(permittedStaff, 'Acme', tasks)).toBe(true);
    expect(canEditClientProfile(permittedStaff, 'Beta', tasks)).toBe(false);
    expect(canEditClientProfile(permittedStaff, 'Created Co', [creatorOnlyTask])).toBe(false);
    expect(getVisibleTasks(permittedStaff, [creatorOnlyTask]).map(task => task.id)).toEqual(['task-created-only']);
    expect(getVisibleClientNames(permittedStaff, [creatorOnlyTask])).toEqual(['Created Co']);
    expect(canEditTask(permittedStaff, creatorOnlyTask)).toBe(true);
    expect(canEditClientProfile(acmeClient, 'Acme', tasks)).toBe(false);
  });

  it('uses a custom role when a secure member has an empty permissions object', () => {
    const customRole: CustomRole = {
      id: 'client-manager',
      name: 'Client Manager',
      baseRole: 'Staff',
      permissions: { ...defaultRolePermissions.Staff, manageAssignedClients: true },
      createdAt: '2026-07-13T00:00:00.000Z',
      updatedAt: '2026-07-13T00:00:00.000Z',
    };
    const customRoleStaff: User = {
      ...staff,
      customRoleId: customRole.id,
      permissions: {} as User['permissions'],
    };

    expect(canEditClientProfile(customRoleStaff, 'Acme', tasks, [customRole])).toBe(true);
  });

  it('lets an HOD custom role add companies without granting project or rename control', () => {
    const hodRole: CustomRole = {
      id: BUILTIN_HOD_ROLE_ID,
      name: 'HOD',
      baseRole: 'HOD',
      isBuiltin: true,
      isProtected: false,
      departmentScoped: true,
      permissions: { ...defaultRolePermissions.HOD, createClients: true },
      createdAt: '2026-07-13T00:00:00.000Z',
      updatedAt: '2026-07-13T00:00:00.000Z',
    };
    const hod: User = { ...staff, role: 'HOD', customRoleId: hodRole.id, permissions: {} as User['permissions'] };

    expect(canCreateClientProfiles(superAdmin)).toBe(true);
    expect(canCreateClientProfiles(admin)).toBe(true);
    expect(canCreateClientProfiles(staff)).toBe(false);
    expect(canCreateClientProfiles(acmeClient)).toBe(false);
    expect(canCreateClientProfiles(hod, [hodRole])).toBe(true);
    expect(canRenameClient(hod)).toBe(false);
  });

  it('lets an HOD custom role delete companies without widening ordinary Staff', () => {
    const hodRole: CustomRole = {
      id: BUILTIN_HOD_ROLE_ID,
      name: 'HOD',
      baseRole: 'HOD',
      isBuiltin: true,
      isProtected: false,
      permissions: { ...defaultRolePermissions.HOD, deleteClients: true },
      createdAt: '2026-07-13T00:00:00.000Z',
      updatedAt: '2026-07-13T00:00:00.000Z',
    };
    const hod: User = { ...staff, role: 'HOD', customRoleId: hodRole.id, permissions: {} as User['permissions'] };

    expect(canDeleteClientProfiles(superAdmin)).toBe(true);
    expect(canDeleteClientProfiles(admin)).toBe(true);
    expect(canDeleteClientProfiles(staff)).toBe(false);
    expect(canDeleteClientProfiles(acmeClient)).toBe(false);
    expect(canDeleteClientProfiles(hod, [hodRole])).toBe(true);
  });

  it('gives Project Managers portfolio operations while keeping Boss-only keys protected', () => {
    const perms = getEffectivePermissions(admin);
    expect(perms.viewApprovals).toBe(false);
    expect(perms.createClients).toBe(true);
    expect(perms.deleteClients).toBe(true);
    expect(perms.createProjects).toBe(true);
    expect(perms.manageServiceCycles).toBe(true);
    expect(perms.editTasks).toBe(false);
    expect(perms.manageUsers).toBe(false);
    expect(perms.approveRegistrations).toBe(false);
    expect(perms.deleteUsers).toBe(false);
    expect(perms.viewProductionReports).toBe(false);
    expect(getEffectivePermissions(superAdmin).viewApprovals).toBe(true);
  });

  it('keeps approvals and broad visibility out of PM and HOD custom roles', () => {
    const pmRole: CustomRole = {
      id: 'pm-broad',
      name: 'Broad PM',
      baseRole: 'Project Manager',
      permissions: { ...defaultRolePermissions['Project Manager'], viewAllClients: true, viewApprovals: true },
      createdAt: '2026-09-19T00:00:00.000Z',
      updatedAt: '2026-09-19T00:00:00.000Z',
    };
    const pm: User = { ...admin, customRoleId: pmRole.id, permissions: {} as User['permissions'] };
    expect(canViewAllClients(pm, [pmRole])).toBe(false);
    expect(canAccessPath(pm, '/approvals', [pmRole])).toBe(false);
    expect(getVisibleClientNames(pm, [
      makeTask({ id: 'pm-owned', clientName: 'Acme', createdBy: pm.id }),
      makeTask({ id: 'other-client', clientName: 'Beta', createdBy: otherStaff.id, assignedTo: otherStaff.id }),
    ], [], [pmRole])).toEqual(['Acme']);

    const hodRole: CustomRole = {
      id: 'hod-broad',
      name: 'Broad HOD',
      baseRole: 'HOD',
      departmentScoped: true,
      permissions: {
        ...defaultRolePermissions.HOD,
        viewAllTasks: true,
        viewAllClients: true,
        viewApprovals: true,
        manageServiceCatalog: true,
      },
      createdAt: '2026-09-19T00:00:00.000Z',
      updatedAt: '2026-09-19T00:00:00.000Z',
    };
    const hod: User = { ...staff, role: 'HOD', customRoleId: hodRole.id, permissions: {} as User['permissions'] };
    const departmentTask = makeTask({ id: 'hod-department', department: 'Designer', assignedTo: otherStaff.id });
    const outsideTask = makeTask({ id: 'hod-outside', department: 'Video Editor', assignedTo: otherStaff.id });
    const hodPermissions = getEffectivePermissions(hod, [hodRole]);
    expect(hodPermissions.viewApprovals).toBe(false);
    expect(hodPermissions.viewAllTasks).toBe(false);
    expect(hodPermissions.viewAllClients).toBe(false);
    expect(hodPermissions.manageServiceCatalog).toBe(false);
    expect(canAccessPath(hod, '/approvals', [hodRole])).toBe(false);
    expect(getVisibleTasks(hod, [departmentTask, outsideTask], [hodRole]).map(task => task.id)).toEqual(['hod-department']);
  });

  it('scopes the HOD role to its own departments for visibility and editing', () => {
    const hodRole: CustomRole = {
      id: BUILTIN_HOD_ROLE_ID,
      name: 'HOD',
      baseRole: 'HOD',
      isBuiltin: true,
      isProtected: false,
      departmentScoped: true,
      permissions: { ...defaultRolePermissions.HOD, manageCreatedTasks: true },
      createdAt: '2026-07-13T00:00:00.000Z',
      updatedAt: '2026-07-13T00:00:00.000Z',
    };
    const designTask = makeTask({ id: 'design-dept-task', department: 'Designer', assignedTo: otherStaff.id, createdBy: otherStaff.id });
    const videoTask = makeTask({ id: 'video-dept-task', department: 'Video Editor', assignedTo: otherStaff.id, createdBy: otherStaff.id });
    const hod: User = { ...staff, role: 'HOD', customRoleId: hodRole.id, permissions: {} as User['permissions'] };

    expect(getVisibleTasks(hod, [designTask, videoTask], [hodRole]).map(task => task.id)).toEqual(['design-dept-task']);
    expect(canEditTask(hod, designTask, [hodRole])).toBe(true);
    expect(canEditTask(hod, videoTask, [hodRole])).toBe(false);
  });

  it('honours an opt-in department-scoped custom role only when enabled', () => {
    const scopedRole: CustomRole = {
      id: 'dept-scoped-role',
      name: 'Department Lead',
      baseRole: 'Staff',
      departmentScoped: true,
      permissions: { ...defaultRolePermissions.Staff },
      createdAt: '2026-07-13T00:00:00.000Z',
      updatedAt: '2026-07-13T00:00:00.000Z',
    };
    const designTask = makeTask({ id: 'd', department: 'Designer', assignedTo: otherStaff.id, createdBy: otherStaff.id });
    const scopedUser: User = { ...staff, customRoleId: scopedRole.id, permissions: {} as User['permissions'] };
    expect(getVisibleTasks(scopedUser, [designTask], [scopedRole]).map(task => task.id)).toEqual(['d']);

    const plainRole: CustomRole = { ...scopedRole, id: 'plain-role', departmentScoped: false };
    const plainUser: User = { ...staff, customRoleId: plainRole.id, permissions: {} as User['permissions'] };
    expect(getVisibleTasks(plainUser, [designTask], [plainRole])).toEqual([]);
  });

  it('layers a member permission override on top of the custom role grants', () => {
    const role: CustomRole = {
      id: 'layered-role',
      name: 'Layered',
      baseRole: 'Staff',
      permissions: { ...defaultRolePermissions.Staff, viewAllClients: true },
      createdAt: '2026-07-13T00:00:00.000Z',
      updatedAt: '2026-07-13T00:00:00.000Z',
    };
    const user: User = { ...staff, customRoleId: role.id, permissions: { viewAllTasks: true } as User['permissions'] };
    const perms = getEffectivePermissions(user, [role]);
    expect(perms.viewAllClients).toBe(true);
    expect(perms.viewAllTasks).toBe(true);
  });

  it('chooses the first permitted page when Dashboard and Settings are disabled', () => {
    const taskOnlyStaff: User = {
      ...staff,
      permissions: {
        ...defaultRolePermissions.Staff,
        viewDashboard: false,
        viewCalendar: false,
        viewProjects: false,
        viewReports: false,
        viewSettings: false,
      },
    };

    expect(getDefaultAccessiblePath(taskOnlyStaff)).toBe('/clients');
  });

  it('keeps Companies separate while task access opens the merged client workspace', () => {
    const companiesOnly: User = {
      ...staff,
      permissions: { ...defaultRolePermissions.Staff, viewProjects: true, viewDeliveryTracker: false },
    };
    const trackerOnly: User = {
      ...staff,
      permissions: { ...defaultRolePermissions.Staff, viewProjects: false, viewDeliveryTracker: true },
    };

    expect(canAccessPath(companiesOnly, '/projects')).toBe(true);
    expect(canAccessPath(companiesOnly, '/clients')).toBe(true);
    expect(canAccessPath(trackerOnly, '/projects')).toBe(false);
    expect(canAccessPath(trackerOnly, '/clients')).toBe(true);
  });

  it('uses a Companies dashboard action that matches the member permissions', () => {
    const profileOnly: User = {
      ...admin,
      permissions: { ...defaultRolePermissions['Project Manager'], manageClientPlans: false },
    };
    const plansOnly: User = {
      ...staff,
      permissions: { ...defaultRolePermissions.Staff, manageClientPlans: true },
    };
    const viewOnly: User = {
      ...staff,
      permissions: { ...defaultRolePermissions.Staff, manageClientPlans: false },
    };
    const blocked: User = {
      ...staff,
      permissions: { ...defaultRolePermissions.Staff, viewProjects: false },
    };

    expect(getCompaniesDashboardAction(superAdmin)).toBe('Add client or plan');
    expect(getCompaniesDashboardAction(profileOnly)).toBe('Add client');
    expect(getCompaniesDashboardAction(plansOnly)).toBe('Manage client plans');
    expect(getCompaniesDashboardAction(viewOnly)).toBe('View companies');
    expect(getCompaniesDashboardAction(blocked)).toBeNull();
    expect(getCompaniesDashboardAction(acmeClient)).toBeNull();
  });

  it('honors an explicit View all clients permission', () => {
    const elevatedStaff: User = {
      ...staff,
      permissions: { ...defaultRolePermissions.Staff, viewAllClients: true },
    };
    expect(canViewAllClients(elevatedStaff)).toBe(true);
    expect(getVisibleClientNames(elevatedStaff, tasks, projects)).toEqual(['Acme', 'Beta']);
    expect(canEditClientProfile(elevatedStaff, 'Acme', tasks)).toBe(false);
    expect(canRenameClient(elevatedStaff)).toBe(false);
  });

  it('requires assigned-service permission before Staff can open a service client', () => {
    const assigned = makeTask({ clientName: 'Acme', assignedTo: staff.id });
    const withoutPermission = { ...staff, permissions: { ...defaultRolePermissions.Staff, viewAssignedServiceClients: false } };
    expect(canOpenServiceClient(withoutPermission, 'Acme', [assigned])).toBe(false);
    expect(canOpenServiceClient(staff, 'Acme', [assigned])).toBe(true);
    expect(canOpenServiceClient(staff, 'Beta', [assigned])).toBe(false);
  });

  it('grants broad reads without broad edits through View all tasks', () => {
    const viewingStaff: User = {
      ...staff,
      permissions: { ...defaultRolePermissions.Staff, viewAllTasks: true },
    };

    expect(getVisibleTasks(viewingStaff, tasks).map(task => task.id)).toEqual(['task-1', 'task-2']);
    expect(getVisibleClientNames(viewingStaff, tasks, projects)).toEqual(['Acme', 'Beta']);
    expect(getVisibleProjects(viewingStaff, projects, tasks).map(project => project.id)).toEqual(['project-acme', 'project-beta']);
    expect(canEditTask(viewingStaff, tasks[1])).toBe(false);
  });

  it('does not let legacy Edit all tasks data broaden non-Boss access', () => {
    const editingStaff: User = {
      ...staff,
      permissions: { ...defaultRolePermissions.Staff, editTasks: true },
    };

    expect(getVisibleTasks(editingStaff, tasks).map(task => task.id)).toEqual(['task-1']);
    expect(canEditTask(editingStaff, tasks[1])).toBe(false);
  });

  it('removes protected account-management and retired report permissions from non-super-admin roles', () => {
    const unsafeStaff: User = {
      ...staff,
      permissions: {
        ...defaultRolePermissions.Staff,
        editTasks: true,
        manageUsers: true,
        approveRegistrations: true,
        deleteUsers: true,
        viewProductionReports: true,
      },
    };
    const effective = getEffectivePermissions(unsafeStaff);
    expect(effective.editTasks).toBe(false);
    expect(effective.manageUsers).toBe(false);
    expect(effective.approveRegistrations).toBe(false);
    expect(effective.deleteUsers).toBe(false);
    expect(effective.viewProductionReports).toBe(false);
  });

  it('gives the protected HOD scope to created, assigned, and department tasks', () => {
    const hodRole: CustomRole = {
      id: BUILTIN_HOD_ROLE_ID,
      name: 'HOD',
      baseRole: 'HOD',
      isBuiltin: true,
      isProtected: false,
      departmentScoped: true,
      permissions: { ...defaultRolePermissions.HOD, manageCreatedTasks: true },
      createdAt: '2026-09-07T00:00:00.000Z',
      updatedAt: '2026-09-07T00:00:00.000Z',
    };
    const hod: User = { ...staff, role: 'HOD', customRoleId: hodRole.id, customRoleName: hodRole.name };
    const createdAndReassigned = makeTask({ id: 'hod-created', createdBy: hod.id, assignedTo: otherStaff.id });
    const assignedToHod = makeTask({ id: 'hod-assigned', createdBy: otherStaff.id, assignedTo: hod.id });
    const sameDepartment = makeTask({ id: 'hod-unrelated', createdBy: otherStaff.id, assignedTo: otherStaff.id });
    const otherDepartment = makeTask({ id: 'hod-other-dept', department: 'Video Editor', createdBy: otherStaff.id, assignedTo: otherStaff.id });
    const visible = getVisibleTasks(hod, [createdAndReassigned, assignedToHod, sameDepartment, otherDepartment], [hodRole]);

    expect(visible.map(task => task.id)).toEqual(['hod-created', 'hod-assigned', 'hod-unrelated']);
    expect(canEditTask(hod, createdAndReassigned, [hodRole])).toBe(true);
    expect(canEditTask(hod, assignedToHod, [hodRole])).toBe(true);
    expect(canEditTask(hod, sameDepartment, [hodRole])).toBe(true);
    expect(canEditTask(hod, otherDepartment, [hodRole])).toBe(false);
    expect(canAssignTasksToOthers(hod, [hodRole], createdAndReassigned)).toBe(true);
    expect(canAssignTasksToOthers(hod, [hodRole], assignedToHod)).toBe(false);
  });

  it('scopes Project Manager task visibility to owned and assigned work while keeping edits scoped', () => {
    const adminCreated = makeTask({ id: 'admin-created', createdBy: admin.id, assignedTo: otherStaff.id });
    const adminAssigned = makeTask({ id: 'admin-assigned', createdBy: otherStaff.id, assignedTo: admin.id });
    const unrelated = makeTask({ id: 'admin-unrelated', createdBy: otherStaff.id, assignedTo: otherStaff.id });

    expect(getVisibleTasks(admin, [adminCreated, adminAssigned, unrelated]).map(task => task.id)).toEqual([
      'admin-created', 'admin-assigned',
    ]);
    expect(canEditTask(admin, adminCreated)).toBe(true);
    expect(canEditTask(admin, adminAssigned)).toBe(true);
    expect(canEditTask(admin, unrelated)).toBe(false);
  });

  it('keeps task-detail decisions aligned across Boss Koo, PM, HOD, and Staff', () => {
    const pmPortfolioTask = makeTask({ id: 'pm-portfolio', clientName: 'Owned Co', createdBy: otherStaff.id, assignedTo: otherStaff.id });
    const pmAssignedTask = makeTask({ id: 'pm-assigned', clientName: 'Other Co', createdBy: otherStaff.id, assignedTo: admin.id });
    const pmCreatedTask = makeTask({ id: 'pm-created', clientName: 'Other Co', createdBy: admin.id, assignedTo: otherStaff.id });
    const pmUnrelatedTask = makeTask({ id: 'pm-unrelated', clientName: 'Hidden Co', createdBy: otherStaff.id, assignedTo: otherStaff.id });
    const pmScope = {
      clients: [{ id: 'owned-co', clientName: 'Owned Co', createdBy: admin.id, createdAt: '', updatedAt: '' }],
      projects: [],
    };

    expect(canViewTask(admin, pmPortfolioTask, [], pmScope)).toBe(true);
    expect(getTaskAccess(admin, pmPortfolioTask, [], pmScope)).toMatchObject({
      canView: true,
      canEdit: true,
      canComment: true,
      canDelete: true,
      canAssign: true,
    });
    expect(getTaskAccess(admin, pmAssignedTask)).toMatchObject({ canView: true, canEdit: true, canComment: true, canDelete: true, canAssign: false });
    expect(getTaskAccess(admin, pmCreatedTask)).toMatchObject({ canView: true, canEdit: true, canComment: true, canDelete: true, canAssign: true });
    expect(getTaskAccess(admin, pmUnrelatedTask)).toEqual({ canView: false, canEdit: false, canComment: false, canDelete: false, canAssign: false });

    // A PM cannot manage another PM's portfolio, and the unused service-client
    // key is no longer part of the PM defaults.
    const otherPm: User = { ...admin, id: 'admin-2', name: 'Other PM' };
    const otherPmScope = {
      clients: [{ id: 'owned-co', clientName: 'Owned Co', createdBy: otherPm.id, createdAt: '', updatedAt: '' }],
      projects: [],
    };
    expect(canEditTask(admin, pmPortfolioTask, [], otherPmScope)).toBe(false);
    expect(getTaskAccess(admin, pmPortfolioTask, [], otherPmScope).canEdit).toBe(false);
    expect(getEffectivePermissions(admin).viewAllServiceClients).toBe(false);

    const hodRole: CustomRole = {
      id: BUILTIN_HOD_ROLE_ID,
      name: 'HOD',
      baseRole: 'HOD',
      isBuiltin: true,
      isProtected: false,
      departmentScoped: true,
      permissions: { ...defaultRolePermissions.HOD, manageCreatedTasks: true },
      createdAt: '2026-09-07T00:00:00.000Z',
      updatedAt: '2026-09-07T00:00:00.000Z',
    };
    const hod: User = { ...staff, id: 'hod-1', name: 'HOD', role: 'HOD', customRoleId: hodRole.id, customRoleName: hodRole.name };
    const hodDepartmentTask = makeTask({ id: 'hod-department', department: 'Designer', createdBy: otherStaff.id, assignedTo: otherStaff.id });
    const hodOtherDepartmentTask = makeTask({ id: 'hod-other-department', department: 'Video Editor', createdBy: otherStaff.id, assignedTo: otherStaff.id });
    expect(getTaskAccess(hod, hodDepartmentTask, [hodRole])).toMatchObject({ canView: true, canEdit: true, canComment: true, canDelete: true, canAssign: false });
    expect(getTaskAccess(hod, hodOtherDepartmentTask, [hodRole])).toEqual({ canView: false, canEdit: false, canComment: false, canDelete: false, canAssign: false });

    const staffAssignedTask = makeTask({ id: 'staff-assigned', assignedTo: staff.id });
    const staffCreatedTask = makeTask({ id: 'staff-created', assignedTo: otherStaff.id, createdBy: staff.id });
    const staffUnrelatedTask = makeTask({ id: 'staff-unrelated', assignedTo: otherStaff.id, createdBy: otherStaff.id });
    expect(getTaskAccess(staff, staffAssignedTask)).toMatchObject({ canView: true, canEdit: true, canComment: true, canDelete: true, canAssign: false });
    expect(getTaskAccess(staff, staffCreatedTask)).toMatchObject({ canView: true, canEdit: true, canComment: true, canDelete: true, canAssign: false });
    expect(getTaskAccess(staff, staffUnrelatedTask)).toEqual({ canView: false, canEdit: false, canComment: false, canDelete: false, canAssign: false });
    expect(getTaskAccess(superAdmin, staffUnrelatedTask)).toEqual({ canView: true, canEdit: true, canComment: true, canDelete: true, canAssign: true });
  });

  it('keeps missing permissions disabled for existing persisted roles', () => {
    const legacyPermissions: Partial<RolePermissions> = { ...defaultRolePermissions.Staff };
    delete legacyPermissions.viewAllTasks;
    const legacyStaff: User = {
      ...staff,
      permissions: legacyPermissions as User['permissions'],
    };

    expect(getEffectivePermissions(legacyStaff).viewAllTasks).toBe(false);
    expect(getVisibleTasks(legacyStaff, tasks).map(task => task.id)).toEqual(['task-1']);
  });

  it('keeps owned empty companies visible and prevents editing unrelated companies', () => {
    const projectSet: Project[] = [
      ...projects,
      { ...projects[0], id: 'project-owned-empty', clientName: 'Owned', projectName: 'Owned', createdBy: staff.id },
      { ...projects[0], id: 'project-unrelated-empty', clientName: 'Hidden', projectName: 'Hidden', createdBy: otherStaff.id },
    ];

    expect(getVisibleProjects(staff, projectSet, tasks).map(project => project.id)).toEqual([
      'project-acme',
      'project-owned-empty',
    ]);
    expect(canEditProject(staff, projectSet[2])).toBe(true);
    expect(canEditProject(staff, projectSet[3])).toBe(false);
    expect(canEditProject({
      ...staff,
      permissions: { ...defaultRolePermissions.Staff, createProjects: true },
    }, projectSet[3])).toBe(false);
    expect(canEditProject(admin, projectSet[3])).toBe(false);
    expect(canEditProject(admin, { ...projectSet[3], createdBy: admin.id })).toBe(true);
    expect(canEditProject(superAdmin, projectSet[3])).toBe(true);
  });
});

describe('client isolation and feedback', () => {
  it('shows only exact company tasks and projects', () => {
    expect(getVisibleTasks(acmeClient, tasks).map(task => task.clientName)).toEqual(['Acme']);
    expect(getVisibleProjects(acmeClient, projects, tasks).map(project => project.clientName)).toEqual(['Acme']);
  });

  it('allows feedback on owned tasks and review only when ready', () => {
    const owned = tasks[0];
    const ready = makeTask({ status: 'Waiting Approval' });
    expect(canCommentOnTask(acmeClient, owned)).toBe(true);
    expect(canCommentOnTask(acmeClient, tasks[1])).toBe(false);
    expect(canReviewTaskAsClient(acmeClient, owned)).toBe(false);
    expect(canReviewTaskAsClient(acmeClient, ready)).toBe(true);
  });

  it('uses per-user receipts as the source of truth while preserving legacy reads', () => {
    const notification = {
      id: 'notice-1',
      targetUserId: acmeClient.id,
      targetRole: 'Staff' as const,
      title: 'Update',
      message: 'Task changed',
      route: { page: 'tasks' as const, entityId: 'task-1' },
      isRead: false,
      readByUserIds: [acmeClient.id],
      createdAt: '2026-07-13T00:00:00.000Z',
      iconType: 'task' as const,
    };
    expect(isNotificationReadByUser(acmeClient, notification)).toBe(true);
    expect(isNotificationReadByUser(staff, notification)).toBe(false);
    expect(isNotificationReadByUser(staff, { ...notification, isRead: true })).toBe(false);
    expect(isNotificationReadByUser(staff, {
      ...notification,
      isRead: true,
      readByUserIds: undefined,
    })).toBe(true);
    expect(getUnreadNotifications(staff, [notification])).toEqual([notification]);
    expect(getUnreadNotifications(acmeClient, [notification])).toEqual([]);
  });
});

describe('project manager ownership follow-ups', () => {
  const ownedProfile = { id: 'c-own', clientName: 'Acme', createdBy: admin.id, createdAt: '', updatedAt: '' };
  const otherProfile = { id: 'c-other', clientName: 'Beta', createdBy: 'admin-2', createdAt: '', updatedAt: '' };

  it('scopes company rename to the owning Project Manager', () => {
    const otherAdmin: User = { ...admin, id: 'admin-2', name: 'Other PM' };
    expect(canRenameClient(admin, 'Acme', [ownedProfile])).toBe(true);
    expect(canRenameClient(otherAdmin, 'Acme', [ownedProfile])).toBe(false);
    expect(canRenameClient(superAdmin, 'Acme', [ownedProfile])).toBe(true);
  });

  it('scopes the service workspace to owned clients or owned tasks', () => {
    expect(canOpenServiceClient(admin, 'Acme', [], [], [ownedProfile])).toBe(true);
    expect(canOpenServiceClient(admin, 'Beta', [], [], [ownedProfile, otherProfile])).toBe(false);
    expect(canOpenServiceClient(superAdmin, 'Beta', [], [], [])).toBe(true);

    const ownTask = makeTask({ id: 'admin-own-service', clientName: 'Beta', createdBy: admin.id, assignedTo: otherStaff.id });
    expect(canOpenServiceClient(admin, 'Beta', [ownTask], [], [])).toBe(true);
  });

  it('lets a Project Manager edit a company profile through their own task when no profile exists', () => {
    const ownTask = makeTask({ id: 'admin-own-edit', clientName: 'Gamma', createdBy: admin.id, assignedTo: otherStaff.id });
    const otherTask = makeTask({ id: 'admin-other-edit', clientName: 'Gamma', createdBy: otherStaff.id, assignedTo: otherStaff.id });
    expect(canEditClientProfile(admin, 'Gamma', [ownTask], [], [])).toBe(true);
    expect(canEditClientProfile(admin, 'Gamma', [otherTask], [], [])).toBe(false);
  });
});
