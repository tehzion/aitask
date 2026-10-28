import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useStore } from './index';
import type { Deliverable, Task, User } from '../types';
import { getTaskStatusControls } from '../lib/taskStatusControls';

const initial = useStore.getState();
const staff: User = { id: 'evidence-staff', name: 'Staff', role: 'Staff', department: 'Designer', departments: ['Designer'] };
const owner: User = { id: 'evidence-owner', name: 'Owner', role: 'Project Manager', department: 'Designer', departments: ['Designer'], isSuperAdmin: true };
// An ordinary task: a phone call with no document or file to hand in.
const call: Task = { id: 'call-task', title: 'Follow-up call', description: 'Confirm the shoot date by phone.', clientId: 'company', clientName: 'Company', serviceType: 'Account', department: 'Designer', createdBy: owner.id, assignedBy: owner.id, assignedTo: staff.id, startDate: '2026-10-01', dueDate: '', priority: 'Medium', status: 'In Progress', isCompleted: false, completionPercentage: 40, revisionCount: 0, clientApprovalStatus: 'Pending', isRecurring: false };
const deliverable = { id: 'banner-set', clientId: 'company', cycleId: 'cycle', taskIds: ['linked-task'], attachments: [], status: 'Planned' } as unknown as Deliverable;
const linked: Task = { ...call, id: 'linked-task', title: 'Banner delivery', deliverableId: deliverable.id, serviceCycleId: 'cycle' };

beforeEach(() => useStore.setState({ ...initial, currentUser: staff, users: [staff, owner], tasks: [structuredClone(call), structuredClone(linked)], clients: [], projects: [], deliverables: [deliverable], serviceCycles: [], rolePermissions: [], notifications: [], backend: { ...initial.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 } }, true));
afterEach(() => useStore.setState(initial, true));

describe('outputs are optional when submitting', () => {
  it('submits an ordinary task for review without a link or file', () => {
    expect(useStore.getState().updateTaskStatus(call.id, 'Waiting Approval').ok).toBe(true);
    expect(useStore.getState().tasks.find(task => task.id === call.id)?.status).toBe('Waiting Approval');
  });

  it('completes an ordinary no-approval task directly without a link or file', () => {
    useStore.setState(state => ({ tasks: state.tasks.map(task => task.id === call.id ? { ...task, approvalMode: 'none', requiresInternalApproval: false } : task) }));
    const result = useStore.getState().updateTaskStatus(call.id, 'Completed');
    expect(result.ok).toBe(true);
    expect(useStore.getState().tasks.find(task => task.id === call.id)).toMatchObject({ status: 'Completed', isCompleted: true });
  });

  it('submits a delivery-linked task for review without a link or file', () => {
    const controls = getTaskStatusControls(staff, linked, ['In Progress', 'Waiting Approval'], [], { users: [staff, owner] }, { tasks: [linked], cycles: [], deliverables: [deliverable] });
    expect(controls.find(control => control.status === 'Waiting Approval')?.disabledReason).toBeUndefined();
    expect(useStore.getState().updateTaskStatus(linked.id, 'Waiting Approval').ok).toBe(true);
    expect(useStore.getState().tasks.find(task => task.id === linked.id)?.status).toBe('Waiting Approval');
  });

  it('still accepts an output link when one is supplied', () => {
    expect(useStore.getState().updateTask(linked.id, { status: 'Waiting Approval', attachmentLink: 'https://example.com/banners' }).ok).toBe(true);
  });
});
