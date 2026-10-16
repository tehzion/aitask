import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task, User } from '../types';
import { getTaskStatusControls } from './taskStatusControls';
import { getTaskStatusOptions } from './taskWorkflowAccess';
import { getStaffGuidedAction } from './staffWorkspace';
import { TASK_EVIDENCE_REQUIRED } from './staffWorkflow';

const makeActors = () => ({
  pm: { id: 'pm', name: 'PM', role: 'Project Manager', departments: [] } as User,
  hod: { id: 'hod', name: 'HOD', role: 'HOD', departments: ['Designer'] } as User,
  staff: { id: 'staff', name: 'Staff', role: 'Staff', departments: ['Designer'] } as User,
});
const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'task', clientName: 'Company', title: 'Artwork', description: '', serviceType: 'Design',
  department: 'Designer', assignedTo: 'staff', createdBy: 'pm', startDate: '', dueDate: '',
  priority: 'Medium', status: 'Waiting Approval', completionPercentage: 60, isCompleted: false,
  revisionCount: 0, clientApprovalStatus: 'Pending', isRecurring: false,
  ...overrides,
});
const makeStatuses = () => ['Pending', 'In Progress', 'Waiting Approval', 'Completed', 'Cancelled'];
const completion = (user: User, current = makeTask(), configured = makeStatuses()) => {
  const actors = makeActors();
  return getTaskStatusControls(user, current, configured, [], { users: [actors.pm, actors.hod, actors.staff] })
    .find(option => option.status === 'Completed');
};

// This suite previously depended on shared module fixtures and the ambient
// clock while its access dependency graph supports expiring reviewer grants.
// Fresh records plus a fixed clock keep actor ownership and time isolated.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-16T00:00:00.000Z'));
});
afterEach(() => vi.useRealTimers());

describe('PM completion controls', () => {
  const { pm, hod, staff } = makeActors();
  const task = makeTask();
  const statuses = makeStatuses();
  const scope = { users: [pm, hod, staff] };
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

  it('routes client-visible opt-out work through client review before completion', () => {
    const optional = makeTask({ requiresInternalApproval: false, visibility: 'client-visible' });
    expect(completion(pm, optional)?.disabledReason).toBe('Client approval is required before completion.');
    expect(getTaskStatusOptions(pm, optional, statuses, [], scope)).toContain('Approved');
    expect(getTaskStatusOptions(pm, optional, statuses, [], scope)).not.toContain('Completed');
    expect(completion(pm, { ...optional, status: 'Approved', clientApprovalStatus: 'Approved' })).toEqual({ status: 'Completed', disabledReason: undefined });
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

  it('does not leak completion ownership across repeated actor checks', () => {
    const optional = makeTask({ requiresInternalApproval: false });
    for (let index = 0; index < 100; index += 1) {
      expect(completion(pm, optional)?.status).toBe('Completed');
      expect(completion({ ...pm, id: `foreign-pm-${index}` }, optional)).toBeUndefined();
    }
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
