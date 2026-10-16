import { describe, expect, it } from 'vitest';
import type { Task, User } from '../types';
import { getTaskStatusControls } from './taskStatusControls';
import { getTaskStatusOptions } from './taskWorkflowAccess';
import { getStaffGuidedAction } from './staffWorkspace';
import { TASK_EVIDENCE_REQUIRED } from './staffWorkflow';

const pm: User = { id: 'pm', name: 'PM', role: 'Project Manager', departments: [] };
const hod: User = { id: 'hod', name: 'HOD', role: 'HOD', departments: ['Designer'] };
const staff: User = { id: 'staff', name: 'Staff', role: 'Staff', departments: ['Designer'] };
const task: Task = {
  id: 'task', clientName: 'Company', title: 'Artwork', description: '', serviceType: 'Design',
  department: 'Designer', assignedTo: staff.id, createdBy: pm.id, startDate: '', dueDate: '',
  priority: 'Medium', status: 'Waiting Approval', completionPercentage: 60, isCompleted: false,
  revisionCount: 0, clientApprovalStatus: 'Pending', isRecurring: false,
};
const statuses = ['Pending', 'In Progress', 'Waiting Approval', 'Completed', 'Cancelled'];
const scope = { users: [pm, hod, staff] };
const completion = (user: User, current = task, configured = statuses) =>
  getTaskStatusControls(user, current, configured, [], scope).find(option => option.status === 'Completed');

describe('PM completion controls', () => {
  it.each(['Pending', 'In Progress', 'Waiting Approval', 'Revision', 'Cancelled'])('keeps completion visible with an approval explanation from %s', status => {
    expect(completion(pm, { ...task, status })).toEqual({ status: 'Completed', disabledReason: 'Only a project manager can confirm completion after internal approval.' });
    expect(getTaskStatusOptions(pm, { ...task, status }, statuses, [], scope)).not.toContain('Completed');
  });

  it('enables completion and the guided action after approval even if the configured statuses omit Completed', () => {
    const approved = { ...task, status: 'Approved', completionPercentage: 80 };
    expect(completion(pm, approved, ['Pending', 'Waiting Approval'])).toEqual({ status: 'Completed', disabledReason: undefined });
    expect(getStaffGuidedAction(approved, ['Pending'], pm, [], scope)).toMatchObject({ label: 'Confirm completion', targetStatus: 'Completed', disabled: false });
  });

  it('enables direct completion only for the responsible PM after they opt this task out of approval', () => {
    const optional = { ...task, requiresInternalApproval: false };
    expect(completion(pm, optional)).toEqual({ status: 'Completed', disabledReason: undefined });
    expect(getStaffGuidedAction(optional, statuses, pm, [], scope)).toMatchObject({ label: 'Confirm completion', targetStatus: 'Completed', disabled: false });
    expect(completion(staff, optional)).toBeUndefined();
    expect(completion(hod, optional)).toBeUndefined();
    expect(completion({ ...pm, id: 'foreign-pm' }, optional)).toBeUndefined();
    expect(completion(pm, { ...optional, workflowStepKind: 'internal_review' })?.disabledReason).toBe('Only a project manager can confirm completion after internal approval.');
  });

  it('still requires earlier workflow steps and output evidence for opted-out tasks', () => {
    const optional = { ...task, requiresInternalApproval: false, generatedFromDeliverable: true, workflowStepKind: 'work' as const, workflowDependenciesReady: false };
    expect(completion(pm, optional)?.disabledReason).toBe('Complete the earlier workflow steps first.');
    expect(completion(pm, { ...task, requiresInternalApproval: false, deliverableId: 'output' })?.disabledReason).toBe(TASK_EVIDENCE_REQUIRED);
  });

  it('does not grant final completion to staff, HOD, or a foreign PM', () => {
    const approved = { ...task, status: 'Approved' };
    expect(completion(staff, approved)).toBeUndefined();
    expect(completion(hod, approved)).toBeUndefined();
    expect(completion({ ...pm, id: 'foreign-pm' })).toBeUndefined();
  });

  it('keeps PM completion blocked on unfinished workflow dependencies', () => {
    const approved = { ...task, status: 'Approved', generatedFromDeliverable: true, workflowStepKind: 'work' as const, workflowDependenciesReady: false };
    expect(completion(pm, approved)?.disabledReason).toBe('Complete the earlier workflow steps first.');
  });

  it('explains missing output evidence before completing an approved linked task', () => {
    expect(completion(pm, { ...task, status: 'Approved', deliverableId: 'output' })?.disabledReason).toBe(TASK_EVIDENCE_REQUIRED);
  });

  it('offers only one canonical completion option for custom status lists', () => {
    const options = getTaskStatusControls(pm, { ...task, status: 'Approved' }, ['Completed', 'completed', 'Custom'], [], scope);
    expect(options.filter(option => option.status === 'Completed')).toHaveLength(1);
    expect(options.some(option => option.status === 'Custom')).toBe(true);
  });
});
