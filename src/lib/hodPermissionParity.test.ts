import { describe, expect, it } from 'vitest';
import { canAccessPath, canAssignTasksToOthers, canDeleteClientProfile, canEditTask, canOpenServiceClient, canLinkTaskToProject, canViewTask, defaultRolePermissions, getEffectivePermissions, getTaskAccess } from './access';
import type { CustomRole, Project, Task, User } from '../types';

const hod: User = { id: 'hod', name: 'HOD', role: 'HOD', department: 'Video Shooting', departments: ['Video Shooting', 'Video Editor'] };
const task = (values: Partial<Task> = {}) => ({ id: 'task', clientName: 'Visible Co', department: 'Video Editor', createdBy: 'pm', assignedTo: 'editor', ...values } as Task);

describe('HOD permission parity', () => {
  it.each(['Editor', 'video-editor', 'video editing', 'editing'])('recognizes the legacy department %s and grants scoped HOD execution management', department => {
    const work = task({ department: department as Task['department'] });
    expect(getTaskAccess(hod, work)).toMatchObject({ canView: true, canEdit: true, canComment: true, canDelete: false, canAssign: true });
  });
  it('keeps HOD delegation inside the member department', () => {
    expect(canAssignTasksToOthers(hod, [], task())).toBe(true);
    expect(canAssignTasksToOthers(hod, [], task({ assignedTo: hod.id }))).toBe(true);
    expect(canAssignTasksToOthers(hod, [], task({ createdBy: hod.id }))).toBe(true);
    expect(canAssignTasksToOthers({ ...hod, permissions: { ...defaultRolePermissions.HOD, manageCreatedTasks: false } }, [], task({ assignedTo: hod.id }))).toBe(false);
    expect(canEditTask(hod, task({ department: 'Designer' }))).toBe(false);
  });
  it('keeps a Staff-shaped HOD inside explicitly assigned projects', () => {
    const customHodRole: CustomRole = {
      id: 'custom-hod',
      name: 'Custom HOD',
      baseRole: 'HOD',
      isBuiltin: true,
      departmentScoped: true,
      permissions: { ...defaultRolePermissions.HOD },
      createdAt: '',
      updatedAt: '',
    };
    const staffShapedHod: User = { ...hod, role: 'Staff', customRoleId: customHodRole.id };
    const projectBase = { services: ['Video Editing'], startDate: '2026-10-01', deadline: '' };
    const projects: Project[] = [
      { ...projectBase, id: 'owned-project', clientName: 'Visible Co', projectName: 'Owned', hodMemberIds: [staffShapedHod.id] },
      { ...projectBase, id: 'foreign-project', clientName: 'Visible Co', projectName: 'Foreign', hodMemberIds: ['other-hod'] },
    ];
    const owned = task({ id: 'owned-task', projectId: 'owned-project' });
    const foreign = task({ id: 'foreign-task', projectId: 'foreign-project' });
    const scope = { projects };

    expect(canViewTask(staffShapedHod, owned, [customHodRole], scope)).toBe(true);
    expect(canEditTask(staffShapedHod, owned, [customHodRole], scope)).toBe(true);
    expect(canViewTask(staffShapedHod, foreign, [customHodRole], scope)).toBe(false);
    expect(canEditTask(staffShapedHod, foreign, [customHodRole], scope)).toBe(false);
    expect(canAssignTasksToOthers(staffShapedHod, [customHodRole], foreign, scope)).toBe(false);
  });
  it('requires delegation authority for deletion without revoking department edits', () => {
    expect(getTaskAccess(hod, task())).toMatchObject({ canEdit: true, canDelete: false });
    expect(getTaskAccess(hod, task({ assignedTo: hod.id }))).toMatchObject({ canDelete: true });
    expect(getTaskAccess(hod, task({ createdBy: hod.id }))).toMatchObject({ canDelete: true });
    const revoked = { ...hod, permissions: { ...defaultRolePermissions.HOD, manageCreatedTasks: false } };
    expect(getTaskAccess(revoked, task({ assignedTo: hod.id }))).toMatchObject({ canEdit: true, canDelete: false });
    expect(getTaskAccess(hod, task({ department: 'Designer', assignedTo: hod.id }))).toMatchObject({ canEdit: true, canDelete: false });
  });
  it('applies the destructive boundary to department-scoped Staff custom roles', () => {
    const role: CustomRole = { id: 'department-lead', name: 'Department lead', baseRole: 'Staff', departmentScoped: true, permissions: { ...defaultRolePermissions.Staff, manageCreatedTasks: true }, createdAt: '', updatedAt: '' };
    const lead: User = { ...hod, role: 'Staff', customRoleId: role.id };
    expect(getTaskAccess(lead, task(), [role])).toMatchObject({ canEdit: true, canDelete: false });
    expect(getTaskAccess(lead, task({ assignedTo: lead.id }), [role])).toMatchObject({ canDelete: true });
  });
  it('does not expose service records just because a task is in the HOD department', () => {
    expect(canOpenServiceClient(hod, 'Visible Co', [task()])).toBe(false);
    expect(canOpenServiceClient(hod, 'Visible Co', [task({ assignedTo: hod.id })])).toBe(true);
    expect(canOpenServiceClient(hod, 'Hidden Co', [task({ assignedTo: hod.id })])).toBe(false);
  });
  it('keeps approvals and service administration blocked despite per-member overrides', () => {
    const hostile = { ...hod, permissions: { ...defaultRolePermissions.HOD, viewApprovals: true, manageUsers: true, viewAllTasks: true, viewAllClients: true, manageClientPlans: true, manageServiceCycles: true, viewServicePrices: true } };
    expect(canAccessPath(hostile, '/approvals')).toBe(false);
    expect(getEffectivePermissions(hostile)).toMatchObject({ viewApprovals: false, manageUsers: false, viewAllTasks: false, viewAllClients: false, manageClientPlans: false, manageServiceCycles: false, viewServicePrices: false });
  });
  it('gates company deletion on edit capability', () => {
    const profiles = [{ id: 'c', clientName: 'Visible Co', createdBy: 'pm', createdAt: '', updatedAt: '' }];
    // Deletion is gated on edit: a department-visible task alone is not enough.
    expect(canDeleteClientProfile(hod, 'Visible Co', profiles)).toBe(false);
    expect(canDeleteClientProfile(hod, 'Visible Co', profiles, [], [task()])).toBe(false);
    expect(canDeleteClientProfile(hod, 'Hidden Co', profiles, [], [task()])).toBe(false);
    // A HOD who can edit the company (assigned task + manageAssignedClients) may delete it.
    const assigningHod = { ...hod, permissions: { ...defaultRolePermissions.HOD, manageAssignedClients: true } };
    expect(canDeleteClientProfile(assigningHod, 'Visible Co', profiles, [], [task({ assignedTo: hod.id })])).toBe(true);
    // Owning the profile no longer bypasses the edit requirement.
    expect(canDeleteClientProfile(hod, 'Visible Co', [{ ...profiles[0], createdBy: hod.id }])).toBe(false);
    expect(canDeleteClientProfile({ ...hod, permissions: { ...defaultRolePermissions.HOD, deleteClients: false } }, 'Visible Co', profiles, [], [task()])).toBe(false);
  });
  it('offers populated Boss-curated projects without exposing another PM’s projects', () => {
    const project = { id: 'p', clientName: 'Curated Co', projectName: 'Curated', createdBy: 'boss' } as Project;
    const outside = task({ projectId: 'p', department: 'Designer', assignedTo: 'designer' });
    const users = [{ id: 'boss', name: 'Boss', role: 'Project Manager', isSuperAdmin: true, department: 'Management', departments: ['Management'] }, { id: 'pm', name: 'PM', role: 'Project Manager', department: 'Management', departments: ['Management'] }] as User[];
    expect(canLinkTaskToProject(hod, project, [outside], [], users)).toBe(true);
    expect(canLinkTaskToProject(hod, { ...project, createdBy: 'pm' }, [outside], [], users)).toBe(false);
    const staff = { ...hod, id: 'ordinary-staff', role: 'Staff' } as User;
    expect(canLinkTaskToProject(staff, { ...project, createdBy: 'pm' }, [task({ projectId: 'p' })], [], users)).toBe(false);
  });

  it('keeps foreign-department assigned tasks editable without offering a rejected reassignment', () => {
    const foreign = task({ department: 'Designer', assignedTo: hod.id });
    expect(getTaskAccess(hod, foreign)).toMatchObject({ canView: true, canEdit: true, canAssign: false });
    expect(canAssignTasksToOthers(hod, [], { ...foreign, createdBy: hod.id })).toBe(false);
  });

});
