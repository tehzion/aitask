import { describe, expect, it } from 'vitest';
import type { CustomRole, Project, RolePermissions, Task, User } from '../types';
import {
  canAssignTasksToOthers,
  canApproveRegistrations,
  canCommentOnTask,
  canCreateUsers,
  canDeleteUser,
  canEditClientProfile,
  canEditProject,
  canEditTask,
  canRenameClient,
  canReviewTaskAsClient,
  canViewAllClients,
  defaultRolePermissions,
  getEffectivePermissions,
  getAssignableProjects,
  getDefaultAccessiblePath,
  getVisibleClientNames,
  getVisibleProjects,
  getVisibleTasks,
  getUnreadNotifications,
  isNotificationReadByUser,
} from './access';

const admin: User = { id: 'admin-1', name: 'Admin', role: 'Admin', department: 'Management' };
const superAdmin: User = { ...admin, id: 'boss-1', name: 'Boss Koo', isSuperAdmin: true };
const staff: User = { id: 'staff-1', name: 'Staff', role: 'Staff', department: 'Designer' };
const otherStaff: User = { id: 'staff-2', name: 'Other Staff', role: 'Staff', department: 'Editor' };
const acmeClient: User = { id: 'client-1', name: 'Acme Client', role: 'Client', department: 'Client', companyName: 'Acme' };

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
    expect(canCreateUsers(superAdmin)).toBe(true);
    expect(canApproveRegistrations(superAdmin)).toBe(true);
    expect(canCreateUsers(admin)).toBe(false);
    expect(canApproveRegistrations(admin)).toBe(false);
    expect(canCreateUsers(staff)).toBe(false);
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

  it('lets admins view tasks created by every staff member', () => {
    const staffCreatedTasks = [
      makeTask({ id: 'task-created-by-staff', createdBy: staff.id, assignedTo: staff.id }),
      makeTask({ id: 'task-created-by-other-staff', createdBy: otherStaff.id, assignedTo: otherStaff.id }),
    ];

    expect(getVisibleTasks(admin, staffCreatedTasks).map(task => task.id)).toEqual([
      'task-created-by-staff',
      'task-created-by-other-staff',
    ]);
  });

  it('scopes clients and projects to connected work while keeping rename admin-only', () => {
    expect(getVisibleClientNames(staff, tasks, projects)).toEqual(['Acme']);
    expect(getVisibleProjects(staff, projects, tasks).map(project => project.id)).toEqual(['project-acme']);
    expect(canRenameClient(staff)).toBe(false);
    expect(canRenameClient(admin)).toBe(true);
  });

  it('offers only Admin-created or legacy companies when Staff create tasks', () => {
    const companySet: Project[] = [
      { ...projects[0], createdBy: admin.id },
      { ...projects[1], createdBy: staff.id },
      { ...projects[0], id: 'project-legacy', clientName: 'Legacy', projectName: 'Legacy', createdBy: undefined },
    ];

    expect(getAssignableProjects(staff, companySet, [admin, staff], tasks).map(project => project.id)).toEqual([
      'project-acme',
      'project-legacy',
    ]);
    expect(getAssignableProjects(admin, companySet, [admin, staff], tasks)).toEqual(companySet);
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
    expect(getVisibleTasks(permittedStaff, [creatorOnlyTask])).toEqual([]);
    expect(getVisibleClientNames(permittedStaff, [creatorOnlyTask])).toEqual([]);
    expect(canEditTask(permittedStaff, creatorOnlyTask)).toBe(false);
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

    expect(getDefaultAccessiblePath(taskOnlyStaff)).toBe('/tasks');
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

  it('treats Edit all tasks as broad task visibility and editing', () => {
    const editingStaff: User = {
      ...staff,
      permissions: { ...defaultRolePermissions.Staff, editTasks: true },
    };

    expect(getVisibleTasks(editingStaff, tasks).map(task => task.id)).toEqual(['task-1', 'task-2']);
    expect(canEditTask(editingStaff, tasks[1])).toBe(true);
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
    expect(canEditProject(admin, projectSet[3])).toBe(true);
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

  it('tracks notification reads per user while preserving legacy reads', () => {
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
    expect(isNotificationReadByUser(staff, { ...notification, isRead: true })).toBe(true);
    expect(getUnreadNotifications(staff, [notification])).toEqual([notification]);
    expect(getUnreadNotifications(acmeClient, [notification])).toEqual([]);
  });
});
