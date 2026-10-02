import { describe, expect, it } from 'vitest';
import { canAccessPath, canAssignTasksToOthers, canDeleteClientProfile, canEditTask, canOpenServiceClient, canLinkTaskToProject, defaultRolePermissions, getEffectivePermissions, getTaskAccess } from './access';
import type { Project, Task, User } from '../types';

const hod: User = { id: 'hod', name: 'HOD', role: 'HOD', department: 'Video Shooting', departments: ['Video Shooting', 'Video Editor'] };
const task = (values: Partial<Task> = {}) => ({ id: 'task', clientName: 'Visible Co', department: 'Video Editor', createdBy: 'pm', assignedTo: 'editor', ...values } as Task);

describe('HOD permission parity', () => {
  it.each(['Editor', 'video-editor', 'video editing', 'editing'])('recognizes the legacy department %s without granting delegation of somebody else’s task', department => {
    const work = task({ department: department as Task['department'] });
    expect(getTaskAccess(hod, work)).toMatchObject({ canView: true, canEdit: true, canComment: true, canDelete: true, canAssign: false });
  });
  it('separates department oversight from assignment authority', () => {
    expect(canAssignTasksToOthers(hod, [], task())).toBe(false);
    expect(canAssignTasksToOthers(hod, [], task({ assignedTo: hod.id }))).toBe(true);
    expect(canAssignTasksToOthers(hod, [], task({ createdBy: hod.id }))).toBe(true);
    expect(canAssignTasksToOthers({ ...hod, permissions: { ...defaultRolePermissions.HOD, manageCreatedTasks: false } }, [], task({ assignedTo: hod.id }))).toBe(false);
    expect(canEditTask(hod, task({ department: 'Designer' }))).toBe(false);
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
  it('requires visible or owned company scope before offering deletion', () => {
    const profiles = [{ id: 'c', clientName: 'Visible Co', createdBy: 'pm', createdAt: '', updatedAt: '' }];
    expect(canDeleteClientProfile(hod, 'Visible Co', profiles)).toBe(false);
    expect(canDeleteClientProfile(hod, 'Visible Co', profiles, [], [task()])).toBe(true);
    expect(canDeleteClientProfile(hod, 'Hidden Co', profiles, [], [task()])).toBe(false);
    expect(canDeleteClientProfile(hod, 'Visible Co', [{ ...profiles[0], createdBy: hod.id }])).toBe(true);
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
