import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Task, User } from '../types';
import { getTaskStatusOptions, TASK_HOD_REQUIRED } from '../lib/taskWorkflowAccess';
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

describe('role readiness at alternate entry points', () => {
  it('refuses an orphan review and saves it after a department HOD is configured', () => {
    actor(staff);
    useStore.setState({ users: [pm, staff, client], clients: [], tasks: [{ ...task, createdBy: 'missing-owner', assignedTo: staff.id, status: 'In Progress' }] });
    expect(useStore.getState().updateTaskStatus(task.id, 'Waiting Approval')).toEqual({ ok: false, error: TASK_HOD_REQUIRED });
    expect(useStore.getState().updateTask(task.id, { status: 'Waiting Approval' })).toEqual({ ok: false, error: TASK_HOD_REQUIRED });
    expect(current().status).toBe('In Progress');
    useStore.setState({ users: [pm, hod, staff, client] });
    expect(useStore.getState().updateTaskStatus(task.id, 'Waiting Approval').ok).toBe(true);
    expect(useStore.getState().notifications.some(n => n.targetUserId === hod.id && n.title === 'Task Ready for Approval')).toBe(true);
  });
  it('new tasks submitted immediately notify the HOD', () => {
    const id = useStore.getState().addTask({ ...task, status: 'Waiting Approval', assignedTo: staff.id });
    expect(id).toBeTruthy();
    expect(useStore.getState().notifications.some(n => n.targetUserId === hod.id && n.route?.entityId === id && n.title === 'Task Ready for Approval')).toBe(true);
  });
  it('reassignment clears review and acceptance metadata through quick and full edits', () => {
    for (const fullEdit of [false, true]) {
      useStore.setState({ tasks: [{ ...task, status: 'Waiting Approval', assignedTo: staff.id, workState: { acceptedBy: staff.id, acceptedAt: '2026-10-01', reviewRequestedBy: staff.id, reviewRequestedAt: '2026-10-02' } }] });
      const result = fullEdit ? useStore.getState().updateTask(task.id, { assignedTo: hod.id }) : useStore.getState().updateTaskAssignee(task.id, hod.id);
      expect(result.ok).toBe(true);
      expect(current()).toMatchObject({ status: 'Pending', completionPercentage: 10 });
      expect(current().workState?.acceptedBy).toBeUndefined();
      expect(current().workState?.reviewRequestedBy).toBeUndefined();
    }
  });
  it('requires evidence again when HOD approves submitted linked work', () => {
    useStore.setState({ tasks: [{ ...task, status: 'Waiting Approval', assignedTo: staff.id, deliverableId: 'output' }] });
    actor(hod);
    expect(useStore.getState().updateTaskStatus(task.id, 'Approved').ok).toBe(false);
    expect(useStore.getState().updateTask(task.id, { status: 'Approved', attachmentLink: 'https://example.com/output' }).ok).toBe(true);
  });
  it('customer revision returns to Staff and requires another HOD approval before PM completion', () => {
    useStore.setState({ tasks: [{ ...task, assignedTo: staff.id, status: 'Approved', completionPercentage: 80 }] });
    actor(client);
    expect(useStore.getState().reviewClientApproval(task.id, 'Rejected', 'Use the new artwork').ok).toBe(true);
    expect(current()).toMatchObject({ status: 'In Progress', completionPercentage: 50, revisionCount: 1 });
    actor(pm);
    expect(useStore.getState().updateTaskStatus(task.id, 'Completed').ok).toBe(false);
    actor(staff);
    expect(useStore.getState().updateTaskStatus(task.id, 'Waiting Approval').ok).toBe(true);
    actor(hod);
    expect(useStore.getState().updateTaskStatus(task.id, 'Approved').ok).toBe(true);
    actor(pm);
    expect(useStore.getState().updateTaskStatus(task.id, 'Completed').ok).toBe(true);
  });
  it('preserves HOD capabilities for legacy Staff accounts without a role-directory record', () => {
    const legacy = { ...hod, role: 'Staff' as const, customRoleId: 'builtin-hod' };
    useStore.setState({ tasks: [{ ...task, assignedTo: staff.id, status: 'Waiting Approval' }], currentUser: legacy, users: [pm, legacy, staff, client], rolePermissions: [] });
    expect(getTaskStatusOptions(legacy, current(), ['Pending', 'Waiting Approval', 'Completed'])).toContain('Approved');
    expect(useStore.getState().updateTaskStatus(task.id, 'Approved').ok).toBe(true);
    expect(useStore.getState().updateTaskStatus(task.id, 'Completed').ok).toBe(false);
    useStore.setState({ tasks: [{ ...task, assignedTo: legacy.id }] });
    expect(useStore.getState().updateTaskAssignee(task.id, staff.id).ok).toBe(true);
  });
});

describe('approved output integrity', () => {
  it('requires revision before changing submitted output and preserves routine comments and dates', () => {
    useStore.setState({ tasks: [{ ...task, assignedTo: staff.id, status: 'Approved', completionPercentage: 80, attachmentLink: 'https://example.com/approved' }] });
    actor(staff);
    expect(useStore.getState().updateTaskAttachment(task.id, 'https://example.com/replacement').ok).toBe(false);
    expect(useStore.getState().updateTask(task.id, { description: 'Different output' }).ok).toBe(false);
    expect(useStore.getState().updateTaskDueDate(task.id, '2026-10-30').ok).toBe(true);
    actor(pm);
    expect(useStore.getState().updateTask(task.id, { status: 'Completed', attachmentLink: 'https://example.com/replacement' }).ok).toBe(false);
    expect(useStore.getState().requestRevision(task.id, 'Replace the output').ok).toBe(true);
    actor(staff);
    expect(useStore.getState().updateTaskAttachment(task.id, 'https://example.com/replacement').ok).toBe(true);
    expect(current().completionPercentage).toBe(50);
  });
  it('keeps final outputs stable while permitting internal handover notes on historic completed work', () => {
    useStore.setState({ tasks: [{ ...task, assignedTo: staff.id, status: 'Completed', isCompleted: true, clientApprovalStatus: 'Approved', attachmentLink: 'https://example.com/final' }] });
    actor(staff);
    expect(useStore.getState().updateTaskAttachment(task.id, 'https://example.com/replacement').ok).toBe(false);
    expect(useStore.getState().updateTask(task.id, { notes: 'Internal handover note' }).ok).toBe(true);
  });
});
