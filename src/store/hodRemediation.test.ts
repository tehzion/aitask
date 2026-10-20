import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from './index';
import type { AttachmentRef, Deliverable, Task, User } from '../types';
import { canReviewTaskInternally, getDepartmentReviewers, taskTransitionError } from '../lib/taskWorkflowAccess';
import { hasTaskEvidence } from '../lib/staffWorkflow';
import { parseTask } from '../lib/security';

const initial = useStore.getState();
const pm: User = { id: 'remed-pm', name: 'PM', role: 'Project Manager', departments: [] };
const hod: User = { id: 'remed-hod', name: 'HOD', role: 'HOD', departments: ['Designer'] };
const staff: User = { id: 'remed-staff', name: 'Worker', role: 'Staff', departments: ['Designer'] };
const task: Task = { id: 'remed-task', title: 'Artwork', description: '', clientId: 'company', clientName: 'Company', serviceType: 'Design', department: 'Designer', assignedTo: staff.id, createdBy: pm.id, startDate: '2026-10-01', dueDate: '', priority: 'Medium', status: 'In Progress', isCompleted: false, completionPercentage: 30, clientApprovalStatus: 'Pending', revisionCount: 0, isRecurring: false };
const file: AttachmentRef = { id: 'output-file', bucket: 'client-service-files', path: 'aitask-main/company/cycle/output.pdf', fileName: 'Artwork.pdf', mimeType: 'application/pdf', sizeBytes: 12, uploadedBy: staff.id, uploadedAt: '2026-10-14T00:00:00Z' };
const output = { id: 'output', clientId: 'company', clientName: 'Company', cycleId: 'cycle', taskIds: [task.id], attachments: [], status: 'In Progress' } as unknown as Deliverable;
const scope = { users: [pm, hod, staff] };
beforeEach(() => useStore.setState({ ...initial, currentUser: hod, users: scope.users, tasks: [task], clients: [], projects: [], rolePermissions: [], notifications: [], deliverables: [], serviceCycles: [], clientPlans: [], backend: { ...initial.backend, mode: 'local', status: 'local', pendingMutations: 0, hasLocalChanges: false } }));

describe('independent reachable HOD review', () => {
  it('routes HOD-owned or HOD-submitted work to the responsible PM', () => {
    for (const patch of [{ assignedTo: hod.id }, { workState: { reviewRequestedBy: hod.id } }]) {
      const owned = { ...task, ...patch };
      expect(getDepartmentReviewers(scope.users, owned, [], scope).map(user => user.id)).toEqual([pm.id]);
      expect(canReviewTaskInternally(hod, owned, [], scope)).toBe(false);
      expect(canReviewTaskInternally(pm, owned, [], scope)).toBe(true);
    }
  });
  it('ignores an unlinked HOD while retaining HOD and responsible PM review authority', () => {
    expect(getDepartmentReviewers([pm, { ...hod, hasLogin: false }], task).map(user => user.id)).toEqual([pm.id]);
    expect(getDepartmentReviewers([pm, hod], task).map(user => user.id)).toEqual([hod.id, pm.id]);
  });
  it('gives temporary independent cover authority until expiry', () => {
    const covered = { ...task, reviewCover: { reviewerId: pm.id, expiresAt: new Date(Date.now() + 60000).toISOString() } };
    expect(getDepartmentReviewers(scope.users, covered, [], scope).map(user => user.id)).toEqual([pm.id]);
    expect(canReviewTaskInternally(hod, covered, [], scope)).toBe(false);
    expect(canReviewTaskInternally(pm, covered, [], scope)).toBe(true);
    expect(getDepartmentReviewers(scope.users, { ...covered, reviewCover: { ...covered.reviewCover, expiresAt: '2000-01-01T00:00:00Z' } }).map(user => user.id)).toEqual([hod.id, pm.id]);
  });
  it('denies out-of-department reviewer transitions while leaving routine editing available', () => {
    const foreign = { ...task, department: 'Video Editor' as const, assignedTo: hod.id, status: 'Waiting Approval' };
    useStore.setState({ tasks: [foreign] });
    expect(useStore.getState().updateTaskPriority(task.id, 'High').ok).toBe(true);
    expect(useStore.getState().requestRevision(task.id).ok).toBe(false);
    expect(useStore.getState().updateTaskStatus(task.id, 'Revision').ok).toBe(false);
  });
  it('requires an explicit Boss reason for self approval', () => {
    const boss = { ...pm, isSuperAdmin: true };
    const owned = { ...task, assignedTo: boss.id, status: 'Waiting Approval' };
    expect(taskTransitionError(boss, owned, { ...owned, status: 'Approved' })).toBeTruthy();
    useStore.setState({ currentUser: boss, users: [boss], tasks: [owned] });
    expect(useStore.getState().updateTask(task.id, { status: 'Approved', reviewOverrideReason: 'Emergency independent reviewer unavailable' }).ok).toBe(true);
    expect(useStore.getState().tasks[0].reviewDecision).toMatchObject({ reviewedBy: boss.id, overrideReason: 'Emergency independent reviewer unavailable' });
  });
  it('keeps ordinary review provenance through completion and clears it on revision', () => {
    useStore.setState({ tasks: [{ ...task, status: 'Waiting Approval' }] });
    expect(useStore.getState().updateTaskStatus(task.id, 'Approved').ok).toBe(true);
    const decision = useStore.getState().tasks[0].reviewDecision;
    expect(decision?.reviewedBy).toBe(hod.id);
    useStore.setState({ currentUser: pm });
    expect(useStore.getState().updateTaskStatus(task.id, 'Completed').ok).toBe(true);
    expect(useStore.getState().tasks[0].reviewDecision).toEqual(decision);
    expect(useStore.getState().requestRevision(task.id).ok).toBe(true);
    expect(useStore.getState().tasks[0].reviewDecision).toBeUndefined();
  });
  it('only permits PM configuration and retains a named lead after delegation', async () => {
    expect((await useStore.getState().setTaskReviewConfig(task.id, { accountableLeadId: hod.id })).ok).toBe(false);
    useStore.setState({ currentUser: pm });
    expect((await useStore.getState().setTaskReviewConfig(task.id, { accountableLeadId: hod.id, cover: { reviewerId: pm.id, expiresAt: new Date(Date.now() + 86400000).toISOString() } })).ok).toBe(true);
    expect(useStore.getState().updateTaskAssignee(task.id, hod.id).ok).toBe(true);
    expect(useStore.getState().tasks[0].accountableLeadId).toBe(hod.id);
    expect((await useStore.getState().setTaskReviewConfig(task.id, { cover: null })).ok).toBe(true);
    expect(useStore.getState().tasks[0].reviewCover).toBeNull();
  });
});

describe('accepted output and file submission', () => {
  it('keeps customer acceptance in both unchanged-status update entry points', () => {
    for (const full of [false, true]) {
      useStore.setState({ tasks: [{ ...task, status: 'Approved', clientApprovalStatus: 'Approved', completionPercentage: 80 }] });
      expect((full ? useStore.getState().updateTask(task.id, { status: 'Approved', priority: 'High' }) : useStore.getState().updateTaskStatus(task.id, 'Approved')).ok).toBe(true);
      expect(useStore.getState().tasks[0]).toMatchObject({ status: 'Approved', clientApprovalStatus: 'Approved', completionPercentage: 80 });
    }
  });
  it('allows worker files to supply review evidence and rejects foreign/missing links', async () => {
    const linked = { ...task, deliverableId: output.id, serviceCycleId: output.cycleId };
    useStore.setState({ currentUser: staff, tasks: [linked], deliverables: [output] });
    expect((await useStore.getState().attachTaskOutput(task.id, { ...file, path: 'aitask-main/other/cycle/file.pdf' })).ok).toBe(false);
    expect((await useStore.getState().attachTaskOutput(task.id, file)).ok).toBe(true);
    expect(hasTaskEvidence(useStore.getState().tasks[0], [output])).toBe(true);
    expect((await useStore.getState().attachTaskOutput(task.id, file)).ok).toBe(true);
    expect(useStore.getState().tasks[0].outputAttachments).toHaveLength(1);
    expect(useStore.getState().updateTaskStatus(task.id, 'Waiting Approval').ok).toBe(true);
    expect((await useStore.getState().attachTaskOutput(task.id, { ...file, id: 'replace', path: 'aitask-main/company/cycle/new.pdf' })).ok).toBe(false);
    expect(parseTask(useStore.getState().tasks[0])?.outputAttachments).toHaveLength(1);
  });
});
