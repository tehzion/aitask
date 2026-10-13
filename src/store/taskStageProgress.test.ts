import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Task, User } from '../types';
import { getTaskStatusOptions } from '../lib/taskWorkflowAccess';
import { useStore } from './index';

const initial = useStore.getState();
const pm: User = { id: 'stage-pm', name: 'PM', role: 'Project Manager', departments: [] };
const hod: User = { id: 'stage-hod', name: 'HOD', role: 'HOD', departments: ['Designer'] };
const staff: User = { id: 'stage-staff', name: 'Staff', role: 'Staff', departments: ['Designer'] };
const client: User = { id: 'stage-client', name: 'Client', role: 'Client', companyName: 'Stages', departments: [] };
const task: Task = { id: 'staged-task', clientId: 'staged-client', clientName: 'Stages', title: 'Stage artwork', description: '', serviceType: 'Design', department: 'Designer', assignedTo: '', createdBy: pm.id, status: 'Pending', startDate: '2026-10-01', dueDate: '', priority: 'Medium', completionPercentage: 0, isCompleted: false, revisionCount: 0, clientApprovalStatus: 'Pending', isRecurring: false, visibility: 'client-visible' };
const current = () => useStore.getState().tasks[0];
const actor = (user: User) => useStore.setState({ currentUser: user });
beforeEach(() => useStore.setState({ ...initial, currentUser: pm, users: [pm, hod, staff, client], clients: [{ id: 'staged-client', clientName: 'Stages', createdBy: pm.id, createdAt: '2026-10-01', updatedAt: '2026-10-01' }], tasks: [{ ...task }], projects: [], deliverables: [], serviceCycles: [], notifications: [], rolePermissions: [], backend: { ...initial.backend, mode: 'local', status: 'local', pendingMutations: 0, hasLocalChanges: false } }, true));
afterEach(() => useStore.setState(initial, true));

describe('role-controlled task milestones', () => {
  it('persists the complete PM → HOD → Staff → HOD → PM lifecycle and revision rollback', () => {
    expect(useStore.getState().updateTaskAssignee(task.id, hod.id).ok).toBe(true);
    expect(current().completionPercentage).toBe(10);
    actor(hod);
    expect(useStore.getState().updateTaskAssignee(task.id, staff.id).ok).toBe(true);
    expect(current().completionPercentage).toBe(20);
    actor(staff);
    expect(useStore.getState().updateTaskWork(task.id, { kind: 'accept' }).ok).toBe(true);
    expect(current().completionPercentage).toBe(30);
    expect(useStore.getState().updateTaskStatus(task.id, 'Waiting Approval').ok).toBe(true);
    expect(current().completionPercentage).toBe(60);
    expect(useStore.getState().updateTaskStatus(task.id, 'Approved').ok).toBe(false);
    expect(useStore.getState().updateTask(task.id, { status: 'Completed' }).ok).toBe(false);
    expect(useStore.getState().requestRevision(task.id, 'Self review').ok).toBe(false);
    actor(hod);
    expect(useStore.getState().requestRevision(task.id, 'Adjust the artwork').ok).toBe(true);
    expect(current()).toMatchObject({ completionPercentage: 50, isCompleted: false, revisionCount: 1 });
    actor(staff);
    expect(useStore.getState().updateTaskStatus(task.id, 'Waiting Approval').ok).toBe(true);
    expect(current().completionPercentage).toBe(60);
    actor(hod);
    expect(useStore.getState().updateTask(task.id, { status: 'Approved' }).ok).toBe(true);
    expect(current()).toMatchObject({ completionPercentage: 80, isCompleted: false });
    expect(useStore.getState().updateTaskStatus(task.id, 'Completed').ok).toBe(false);
    actor(client);
    expect(useStore.getState().reviewClientApproval(task.id, 'Approved', 'Customer OK').ok).toBe(true);
    expect(current()).toMatchObject({ status: 'Approved', completionPercentage: 80, isCompleted: false });
    actor(pm);
    expect(useStore.getState().updateTaskStatus(task.id, 'Completed').ok).toBe(true);
    expect(current()).toMatchObject({ completionPercentage: 100, isCompleted: true, clientApprovalStatus: 'Approved' });
    expect(current().completedAt).toBeTruthy();
  });
  it('hides decisions belonging to other roles and requires HOD approval before PM completion', () => {
    useStore.setState({ tasks: [{ ...task, assignedTo: staff.id, status: 'Waiting Approval' }] });
    const statuses = ['Pending', 'In Progress', 'Waiting Approval', 'Completed', 'Cancelled'];
    expect(getTaskStatusOptions(staff, current(), statuses)).toEqual(['Waiting Approval']);
    expect(getTaskStatusOptions(hod, current(), statuses)).toContain('Approved');
    expect(getTaskStatusOptions(hod, current(), statuses)).not.toContain('Completed');
    expect(useStore.getState().updateTaskStatus(task.id, 'Completed').ok).toBe(false);
    actor(client);
    expect(useStore.getState().reviewClientApproval(task.id, 'Approved').ok).toBe(false);
  });
  it('returning approved work through the status selector also sets revision to 50%', () => {
    useStore.setState({ tasks: [{ ...task, assignedTo: staff.id, status: 'Approved', completionPercentage: 80 }] });
    actor(hod);
    expect(useStore.getState().updateTaskStatus(task.id, 'In Progress').ok).toBe(true);
    expect(current()).toMatchObject({ completionPercentage: 50, revisionCount: 1, clientApprovalStatus: 'Rejected' });
  });
});
