import { describe, expect, it } from 'vitest';
import type { Task, User } from '../types';
import { canReviewTaskInternally, getDepartmentReviewers, taskTransitionError } from './taskWorkflowAccess';
import { getStaffGuidedAction } from './staffWorkspace';
import { canApproveInternalReview } from './workflowReview';
const pm: User = { id: 'pm', name: 'PM', role: 'Project Manager', departments: [] };
const other: User = { ...pm, id: 'other' };
const hod: User = { id: 'hod', name: 'HOD', role: 'HOD', departments: ['Designer'] };
const task = { id: 'task', department: 'Designer', createdBy: 'staff', clientName: 'Company', status: 'Waiting Approval' } as Task;
const scope = { users: [pm, other], clients: [{ id: 'co', clientName: 'Company', createdBy: pm.id, createdAt: '', updatedAt: '' }] };
describe('department PM fallback reviewer', () => {
  it('routes and permits only the portfolio PM without a Designer HOD', () => {
    expect(getDepartmentReviewers(scope.users, task, [], scope).map(u => u.id)).toEqual(['pm']);
    expect(canReviewTaskInternally(pm, task, [], scope)).toBe(true);
    expect(getStaffGuidedAction(task, ['Waiting Approval', 'Completed'], pm, [], scope)).toMatchObject({ label: 'Approve', targetStatus: 'Approved', disabled: false });
    expect(canApproveInternalReview(pm, task, [], scope)).toBe(true);
    expect(canReviewTaskInternally(other, task, [], scope)).toBe(false);
  });
  it.each(['Operation', 'Management', 'Video Editor'] as const)('routes %s review to its responsible PM when no HOD exists', department => {
    expect(getDepartmentReviewers(scope.users, { ...task, department }, [], scope).map(u => u.id)).toEqual(['pm']);
    expect(canReviewTaskInternally(pm, { ...task, department }, [], scope)).toBe(true);
    expect(canReviewTaskInternally(other, { ...task, department }, [], scope)).toBe(false);
  });
  it('cannot move another department into the PM fallback during approval', () => {
    expect(taskTransitionError(pm, { ...task, department: 'Video Editor' }, { ...task, status: 'Approved', isCompleted: false }, [], scope)).toBe('Reassign work before submitting it for review.');
  });
  it('retains HOD authority once configured', () => {
    const users = [...scope.users, hod];
    expect(getDepartmentReviewers(users, task, [], scope).map(u => u.id)).toEqual(['hod']);
    expect(canReviewTaskInternally(pm, task, [], { ...scope, users })).toBe(false);
    expect(canReviewTaskInternally(pm, { ...task, department: 'Video Editor' }, [], scope)).toBe(true);
  });
  it('uses canonical actor-bound context over a filtered roster', () => {
    expect(canReviewTaskInternally(pm, { ...task, reviewAccess: { actorId: pm.id, canApprove: false } }, [], scope)).toBe(false);
    expect(canReviewTaskInternally(pm, { ...task, reviewAccess: { actorId: pm.id, canApprove: true } })).toBe(true);
    expect(canReviewTaskInternally(other, { ...task, reviewAccess: { actorId: pm.id, canApprove: true } }, [], scope)).toBe(false);
  });
});
