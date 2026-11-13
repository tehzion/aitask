import { describe, expect, it } from 'vitest';
import type { CustomRole, User } from '../types';
import { defaultRolePermissions } from './access';
import { assignableDepartments, STAFF_DEPARTMENTS } from './departments';
import { assignableTaskAssignees, formatTaskAssigneeName } from './taskWorkflowAccess';

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
  it('allows Staff alongside HODs for a PM', () => {
    const ids = assignableTaskAssignees(pm, 'Designer', users).map(user => user.id);
    expect(ids).toContain('hod');
    expect(ids).toContain('staff');
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

  it('offers cross-department Staff for an HOD-owned task without changing PM choices', () => {
    expect(assignableTaskAssignees(hod, 'Designer', users, [], { task: { assignedTo: hod.id } }).map(user => user.id)).toEqual(['staff', 'video']);
    expect(assignableTaskAssignees(hod, 'Designer', users, [], { task: { assignedTo: staff.id } }).map(user => user.id)).not.toContain('video');
    expect(assignableTaskAssignees(pm, 'Designer', users, [], { task: { assignedTo: pm.id } }).map(user => user.id)).not.toContain('video');
  });

  it('only offers selected-department members and excludes disabled accounts and Clients', () => {
    const options = assignableTaskAssignees(pm, 'Designer', [...users, { ...staff, id: 'disabled', hasLogin: false }, { ...staff, id: 'client', role: 'Client' }]);
    expect(options.map(user => user.id)).toEqual(['hod', 'staff']);
  });
});

it('includes an HOD in each of their departments and none of the other departments', () => {
  const multiHod: User = { ...hod, id: 'multi-hod', department: 'Video Shooting', departments: ['Video Shooting', 'Video Editor'] };
  expect(assignableTaskAssignees(pm, 'Video Shooting', [...users, multiHod]).map(user => user.id)).toEqual(['multi-hod']);
  expect(assignableTaskAssignees(pm, 'Video Editor', [...users, multiHod]).map(user => user.id)).toEqual(['video', 'multi-hod']);
  expect(assignableTaskAssignees(pm, 'Management', [...users, multiHod]).map(user => user.id)).toEqual(['pm']);
  expect(assignableTaskAssignees(pm, undefined, [...users, multiHod])).toEqual([]);
});

it('labels HODs without changing other assignee names', () => {
  expect(formatTaskAssigneeName(hod)).toBe('HOD (HOD)');
  expect(formatTaskAssigneeName(staff)).toBe('Staff');
  expect(formatTaskAssigneeName(pm)).toBe('PM');
  expect(formatTaskAssigneeName({ ...staff, customRoleId: 'builtin-hod' })).toBe('Staff (HOD)');
});

describe('HOD delegation targets', () => {
  it('includes Staff from any department and excludes HODs, Clients, and unlinked members', async () => {
    const { eligibleHodDelegationStaff } = await import('./taskWorkflowAccess');
    const customHodRole: CustomRole = { id: 'custom-hod', name: 'Custom HOD', baseRole: 'HOD', permissions: defaultRolePermissions.HOD, createdAt: '', updatedAt: '' };
    const options = eligibleHodDelegationStaff([
      pm, hod, staff, videoStaff,
      { ...staff, id: 'unlinked', hasLogin: false },
      { ...staff, id: 'banned', hodDelegationEligible: false },
      { ...staff, id: 'client', role: 'Client' },
      { ...staff, id: 'hod-as-staff', customRoleId: 'builtin-hod' },
      { ...staff, id: 'custom-hod-as-staff', customRoleId: customHodRole.id },
      { ...staff, id: 'directory', directoryOnly: true },
    ], [customHodRole]);
    expect(options.map(user => user.id)).toEqual(['staff', 'video']);
  });
});
