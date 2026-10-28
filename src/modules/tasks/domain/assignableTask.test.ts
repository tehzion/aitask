import { describe, expect, it } from 'vitest';
import { assignableDepartments, STAFF_DEPARTMENTS } from '../../../shared/authorization/departments';
import { assignableTaskAssignees, TASK_HOD_ASSIGNMENT_REQUIRED } from '../../../shared/authorization/taskWorkflowAccess';
import type { Project, User } from '../../../shared/types/index';

const pm: User = { id: 'pm', name: 'PM', role: 'Project Manager', departments: ['Management'], department: 'Management' };
const hod: User = { id: 'hod', name: 'HOD', role: 'HOD', departments: ['Designer'], department: 'Designer' };
const staff: User = { id: 'staff', name: 'Staff', role: 'Staff', departments: ['Designer'], department: 'Designer' };
const videoStaff: User = { id: 'video', name: 'Video Staff', role: 'Staff', departments: ['Video Editor'], department: 'Video Editor' };
const users = [pm, hod, staff, videoStaff];
const projectWithoutHod: Project = {
  id: 'project-without-hod', clientName: 'Routing Co', projectName: 'Routing Co',
  createdBy: pm.id, projectManagerIds: [pm.id], hodMemberIds: [], staffMemberIds: [staff.id],
  services: ['Design'], startDate: '2026-10-01', deadline: '',
};

describe('assignableDepartments', () => {
  it('lets a Project Manager choose any staff department', () => {
    expect(assignableDepartments(pm)).toEqual([...STAFF_DEPARTMENTS]);
  });

  it('limits a department-scoped HOD or Staff member to their own departments', () => {
    expect(assignableDepartments(hod)).toEqual(['Designer']);
    expect(assignableDepartments(staff)).toEqual(['Designer']);
  });
});

describe('assignableTaskAssignees', () => {
  it('hides staff from a Project Manager when the department has an HOD', () => {
    const ids = assignableTaskAssignees(pm, 'Designer', users).map(user => user.id);
    expect(ids).toContain('hod');
    expect(ids).not.toContain('staff');
  });

  it('allows the project-manager fallback when the department has no HOD', () => {
    const ids = assignableTaskAssignees(pm, 'Video Editor', users).map(user => user.id);
    expect(ids).toContain('video');
  });

  it('allows a direct staff assignment when the caller opts into the review handoff', () => {
    const ids = assignableTaskAssignees(pm, 'Designer', users, [], { allowDirectStaff: true }).map(user => user.id);
    expect(ids).toContain('staff');
  });

  it('does not restrict a department HOD acting within their own department', () => {
    const ids = assignableTaskAssignees(hod, 'Designer', users).map(user => user.id);
    expect(ids).toContain('staff');
    expect(ids).not.toContain('video');
  });

  it('still reports the HOD-first error for a direct Project Manager assignment', () => {
    expect(assignableTaskAssignees(pm, 'Designer', users).some(user => user.id === 'staff')).toBe(false);
    expect(TASK_HOD_ASSIGNMENT_REQUIRED).toMatch(/HOD/);
  });

  it('uses this project\'s HOD and Staff membership instead of department-wide users', () => {
    const inactiveStaff = { ...staff, id: 'inactive-staff', hasLogin: false };
    const options = assignableTaskAssignees(pm, 'Designer', [...users, inactiveStaff], [], { project: projectWithoutHod });
    expect(options.map(user => user.id)).toContain(staff.id);
    expect(options.map(user => user.id)).not.toContain(hod.id);
    expect(options.map(user => user.id)).not.toContain(inactiveStaff.id);
  });
});
