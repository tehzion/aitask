import { describe, expect, it } from 'vitest';
import type { User } from '../types';
import { assignableDepartments, STAFF_DEPARTMENTS } from './departments';
import { assignableTaskAssignees, TASK_HOD_ASSIGNMENT_REQUIRED } from './taskWorkflowAccess';

const pm: User = { id: 'pm', name: 'PM', role: 'Project Manager', departments: ['Management'], department: 'Management' };
const hod: User = { id: 'hod', name: 'HOD', role: 'HOD', departments: ['Designer'], department: 'Designer' };
const staff: User = { id: 'staff', name: 'Staff', role: 'Staff', departments: ['Designer'], department: 'Designer' };
const videoStaff: User = { id: 'video', name: 'Video Staff', role: 'Staff', departments: ['Video Editor'], department: 'Video Editor' };
const users = [pm, hod, staff, videoStaff];

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
});
