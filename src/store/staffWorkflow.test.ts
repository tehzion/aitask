import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useStore } from './index';
import type { Deliverable, Task, User } from '../types';
import { parseTask } from '../lib/security';
import { serializeClientProjectedTask } from '../lib/secureWorkspace';

const initial = useStore.getState();
const staff: User = { id: 'staff-work', name: 'Staff', role: 'Staff', department: 'Designer', departments: ['Designer'] };
const hod: User = { id: 'hod-work', name: 'HOD', role: 'HOD', department: 'Designer', departments: ['Designer'] };
const owner: User = { id: 'owner-work', name: 'Owner', role: 'Project Manager', department: 'Designer', departments: ['Designer'], isSuperAdmin: true };
const task: Task = { id: 'work-task', title: 'Artwork', description: '', clientId: 'company', clientName: 'Company', serviceType: 'Design', department: 'Designer', createdBy: owner.id, assignedBy: owner.id, assignedTo: staff.id, startDate: '2026-10-01', dueDate: '', priority: 'Medium', status: 'Pending', isCompleted: false, completionPercentage: 0, revisionCount: 0, clientApprovalStatus: 'Pending', isRecurring: false };
const output = { id: 'output', clientId: 'company', cycleId: 'cycle', taskIds: [task.id], attachments: [], status: 'Planned' } as unknown as Deliverable;
beforeEach(() => useStore.setState({ ...initial, currentUser: staff, users: [staff, owner, hod], tasks: [structuredClone(task)], clients: [], projects: [], deliverables: [], serviceCycles: [], rolePermissions: [], notifications: [], backend: { ...initial.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 } }, true));
afterEach(() => useStore.setState(initial, true));
describe('staff work lifecycle', () => {
  it('requires evidence through quick status and Full edit, including reverse deliverable links', () => {
    useStore.setState({ deliverables: [output] });
    expect(useStore.getState().updateTaskStatus(task.id, 'Waiting Approval').ok).toBe(false);
    expect(useStore.getState().updateTask(task.id, { status: 'Completed' }).ok).toBe(false);
    expect(useStore.getState().tasks[0].status).toBe('Pending');
    expect(useStore.getState().updateTask(task.id, { status: 'Waiting Approval', attachmentLink: 'https://example.com/artwork' }).ok).toBe(true);
    expect(useStore.getState().tasks[0].workState).toMatchObject({ reviewRequestedBy: staff.id });
    expect(useStore.getState().tasks[0].workState?.reviewRequestedAt).toBeTruthy();
  });
  it('keeps administrative submissions flexible and legacy completed edits available', () => {
    expect(useStore.getState().updateTaskStatus(task.id, 'Waiting Approval').ok).toBe(true);
    useStore.setState({ tasks: [{ ...task, status: 'Completed', isCompleted: true }] });
    useStore.setState({ deliverables: [output] });
    expect(useStore.getState().updateTask(task.id, { notes: 'Handover instructions' }).ok).toBe(true);
  });
  it('rejects invalid evidence and does not use another company’s uploaded file', () => {
    useStore.setState({ tasks: [{ ...task, deliverableId: output.id }], deliverables: [{ ...output, clientId: 'other-company', attachments: [{ id: 'file', bucket: 'client-service-files', path: 'other/file' } as never] }] });
    expect(useStore.getState().updateTask(task.id, { status: 'Completed', attachmentLink: 'javascript:alert(1)' }).ok).toBe(false);
    expect(useStore.getState().updateTaskStatus(task.id, 'Completed').ok).toBe(false);
  });
  it('accepts valid linked deliverable files as evidence for submission', () => {
    useStore.setState({ deliverables: [{ ...output, attachments: [{ id: 'file', bucket: 'client-service-files', path: 'company/file' } as never] }] });
    expect(useStore.getState().updateTaskStatus(task.id, 'Waiting Approval').ok).toBe(true);
  });
  it('only the assignee accepts work, while the owner can manage a help request', () => {
    useStore.setState({ currentUser: owner });
    expect(useStore.getState().updateTaskWork(task.id, { kind: 'accept' }).ok).toBe(false);
    useStore.setState({ currentUser: staff });
    expect(useStore.getState().updateTaskWork(task.id, { kind: 'accept' }).ok).toBe(true);
    expect(useStore.getState().updateTaskWork(task.id, { kind: 'block', reason: ' Need assets ' }).ok).toBe(true);
    expect(useStore.getState().tasks[0].workState?.blocker).toMatchObject({ reason: 'Need assets', openedBy: staff.id });
    expect(useStore.getState().notifications.some(item => item.targetUserId === owner.id)).toBe(true);
    useStore.setState({ currentUser: owner });
    expect(useStore.getState().updateTaskWork(task.id, { kind: 'unblock' }).ok).toBe(true);
    expect(useStore.getState().tasks[0].workState?.blocker).toBeUndefined();
  });
  it('reassignment clears acceptance and inherited blockers, retaining attributed history', () => {
    useStore.getState().updateTaskWork(task.id, { kind: 'accept' });
    useStore.getState().updateTaskWork(task.id, { kind: 'block', reason: 'Need handover' });
    useStore.setState({ currentUser: owner });
    expect(useStore.getState().updateTaskAssignee(task.id, owner.id).ok).toBe(true);
    const updated = useStore.getState().tasks[0];
    expect(updated.workState?.acceptedBy).toBeUndefined(); expect(updated.workState?.blocker).toBeUndefined();
    expect(updated.workHistory?.at(-1)).toMatchObject({ userId: owner.id, fields: ['assignedTo', 'acceptedBy', 'blocker'] });
  });
  it('generic edits cannot forge acceptance, submission time, or history; metadata survives safe parsing and stays out of client projections', () => {
    useStore.getState().updateTaskWork(task.id, { kind: 'accept' });
    const before = useStore.getState().tasks[0];
    const forged = { notes: 'Updated', workState: { acceptedBy: 'forged' }, workHistory: [] };
    expect(useStore.getState().updateTask(task.id, forged).ok).toBe(true);
    const updated = useStore.getState().tasks[0];
    expect(updated.workState?.acceptedBy).toBe(staff.id);
    expect(updated.workHistory!.length).toBe(before.workHistory!.length + 1);
    expect(parseTask(updated)?.workState?.acceptedBy).toBe(staff.id);
    expect(serializeClientProjectedTask(updated)).not.toHaveProperty('workState');
    expect(serializeClientProjectedTask(updated)).not.toHaveProperty('workHistory');
  });
  it('blocks help actions on closed work and requires nonempty bounded reasons', () => {
    expect(useStore.getState().updateTaskWork(task.id, { kind: 'block', reason: ' ' }).ok).toBe(false);
    expect(useStore.getState().updateTaskWork(task.id, { kind: 'block', reason: 'x'.repeat(2001) }).ok).toBe(false);
    useStore.setState({ currentUser: owner });
    expect(useStore.getState().updateTaskStatus(task.id, 'Completed').ok).toBe(true);
    useStore.setState({ currentUser: staff });
    expect(useStore.getState().updateTaskWork(task.id, { kind: 'accept' }).ok).toBe(false);
  });
});
