import { describe, expect, it } from 'vitest';
import type { Task, User } from '../types';
import { buildStaffWorkQueue, getStaffFocusTask, getStaffGuidedAction, getTaskBlockers, getHodScopeTasks, getUnavailableTaskDependencyCount, isStaffGuidedActionEnabled } from './staffWorkspace';
import { getTaskStatusControls } from './taskStatusControls';

const task = (overrides: Partial<Task>): Task => ({
  id: overrides.id || crypto.randomUUID(),
  clientName: 'UrbanEats',
  serviceType: 'Video',
  title: 'Edit video',
  description: '',
  department: 'Video Editor',
  assignedTo: 'staff-1',
  createdBy: 'admin-1',
  startDate: '2026-08-01',
  dueDate: '2026-08-30',
  priority: 'Medium',
  status: 'Pending',
  completionPercentage: 0,
  isCompleted: false,
  revisionCount: 0,
  clientApprovalStatus: 'Pending',
  isRecurring: false,
  ...overrides,
});

describe('staff workspace queue', () => {
  it('buckets and ranks revisions, overdue, today, in-progress, future and undated work', () => {
    const queue = buildStaffWorkQueue([
      task({ id: 'future', dueDate: '2026-09-02' }),
      task({ id: 'undated', dueDate: '' }),
      task({ id: 'today', dueDate: '2026-08-26' }),
      task({ id: 'overdue', dueDate: '2026-08-20' }),
      task({ id: 'revision', revisionCount: 1, dueDate: '2026-09-03' }),
      task({ id: 'progress', status: 'In Progress', dueDate: '2026-09-01' }),
      task({ id: 'waiting', status: 'Waiting Approval' }),
      task({ id: 'done', status: 'Completed', isCompleted: true, completedAt: '2026-08-25T10:00:00Z' }),
      task({ id: 'cancelled', status: 'Cancelled' }),
    ], '2026-08-26');

    expect(queue.needs_action.map(item => item.id)).toEqual(['revision', 'overdue', 'today', 'progress']);
    expect(queue.up_next.map(item => item.id)).toEqual(['future', 'undated']);
    expect(queue.waiting.map(item => item.id)).toEqual(['waiting']);
    expect(queue.done.map(item => item.id)).toEqual(['done', 'cancelled']);
    expect(getStaffFocusTask(queue)?.id).toBe('revision');
  });

  it('breaks equal urgency by priority and then update time', () => {
    const queue = buildStaffWorkQueue([
      task({ id: 'medium-old', dueDate: '2026-08-26', priority: 'Medium', updatedAt: '2026-08-20T00:00:00Z' }),
      task({ id: 'urgent', dueDate: '2026-08-26', priority: 'Urgent' }),
      task({ id: 'medium-new', dueDate: '2026-08-26', priority: 'Medium', updatedAt: '2026-08-25T00:00:00Z' }),
    ], '2026-08-26');

    expect(queue.needs_action.map(item => item.id)).toEqual(['urgent', 'medium-new', 'medium-old']);
  });

  it('orders future work by due date before priority and update time', () => {
    const queue = buildStaffWorkQueue([
      task({ id: 'due-sooner', dueDate: '2026-08-28', priority: 'High', updatedAt: '2026-08-20T00:00:00Z' }),
      task({ id: 'updated-later', dueDate: '2026-09-08', priority: 'High', updatedAt: '2026-08-25T00:00:00Z' }),
    ], '2026-08-26');

    expect(queue.up_next.map(item => item.id)).toEqual(['due-sooner', 'updated-later']);
  });
});

describe('staff guided task actions', () => {
  const statuses = ['Pending', 'In Progress', 'Waiting Approval', 'Completed', 'Cancelled'];

  it('maps standard workflow states to one next action', () => {
    expect(getStaffGuidedAction(task({ status: 'Pending' }), statuses)).toMatchObject({ label: 'Start work', targetStatus: 'In Progress' });
    expect(getStaffGuidedAction(task({ status: 'Pending', revisionCount: 2 }), statuses)).toMatchObject({ label: 'Start revision', targetStatus: 'In Progress' });
    expect(getStaffGuidedAction(task({ status: 'In Progress' }), statuses)).toMatchObject({ label: 'Send for review', targetStatus: 'Waiting Approval' });
    expect(getStaffGuidedAction(task({ status: 'Waiting Approval' }), statuses)).toMatchObject({ label: 'Waiting for review', disabled: true });
  });

  it('lets the assigned Staff member complete an explicit no-approval task', () => {
    const actor = { id: 'staff-1', name: 'Staff', role: 'Staff', departments: ['Video Editor'] } as User;
    expect(getStaffGuidedAction(task({ status: 'In Progress', requiresInternalApproval: false }), statuses, actor, [], { users: [actor] }))
      .toMatchObject({ label: 'Complete task', targetStatus: 'Completed', disabled: false });
  });

  it('falls back to the status picker for custom or incomplete workflows', () => {
    expect(getStaffGuidedAction(task({ status: 'QA review' }), statuses)).toMatchObject({ kind: 'picker', label: 'Update status' });
    expect(getStaffGuidedAction(task({ status: 'Pending' }), ['Pending', 'Completed'])).toMatchObject({ kind: 'picker' });
  });

  it('renders completed and cancelled work as terminal states', () => {
    expect(getStaffGuidedAction(task({ status: 'Completed', isCompleted: true }), statuses)).toEqual({ kind: 'terminal', label: 'Completed', disabled: true });
    expect(getStaffGuidedAction(task({ status: 'Cancelled' }), statuses)).toEqual({ kind: 'terminal', label: 'Cancelled', disabled: true });
  });
});


describe('HOD oversight', () => {
  it('keeps older overdue deadlines ahead of newer urgent work', () => {
    const queue = buildStaffWorkQueue([
      task({ id: 'oldest', dueDate: '2026-08-01', priority: 'Low' }),
      task({ id: 'urgent', dueDate: '2026-08-25', priority: 'Urgent', updatedAt: '2026-08-26' }),
    ], '2026-08-26');
    expect(getStaffFocusTask(queue)?.id).toBe('oldest');
  });

  it('counts only open, visible predecessors of open tasks', () => {
    const work = task({ predecessorTaskIds: ['open', 'completed', 'cancelled', 'hidden'] });
    const visible = [
      task({ id: 'open' }),
      task({ id: 'completed', status: 'Completed', isCompleted: false }),
      task({ id: 'cancelled', status: 'Cancelled', isCompleted: false }),
    ];
    expect(getTaskBlockers(work, visible).map(item => item.id)).toEqual(['open']);
    expect(getTaskBlockers({ ...work, isCompleted: true }, visible)).toEqual([]);
    expect(getTaskBlockers({ ...work, status: 'Cancelled' }, visible)).toEqual([]);
  });

  it('separates personal assignments from created or reassigned delegation', () => {
    const visible = [
      task({ id: 'mine', assignedTo: 'hod', createdBy: 'pm' }),
      task({ id: 'created', assignedTo: 'staff', createdBy: 'hod' }),
      task({ id: 'reassigned', assignedTo: 'staff', assignedBy: 'hod', createdBy: 'pm' }),
      task({ id: 'unassigned', assignedTo: '', createdBy: 'hod' }),
      task({ id: 'oversight', assignedTo: 'staff', createdBy: 'pm' }),
    ];
    expect(getHodScopeTasks(visible, 'hod', 'mine').map(item => item.id)).toEqual(['mine']);
    expect(getHodScopeTasks(visible, 'hod', 'delegated').map(item => item.id)).toEqual(['created', 'reassigned']);
    expect(getHodScopeTasks(visible, 'hod', 'department')).toEqual(visible);
    expect(getHodScopeTasks(visible, undefined, 'delegated')).toEqual([]);
  });
});


describe('unavailable task dependencies', () => {
  it('counts unique unavailable predecessors without inferring hidden status', () => {
    const work = task({ predecessorTaskIds: ['visible', 'hidden', 'hidden', 'missing'] });
    const visible = [task({ id: 'visible', status: 'Completed' })];
    expect(getUnavailableTaskDependencyCount(work, visible)).toBe(2);
    expect(getUnavailableTaskDependencyCount({ ...work, status: 'Completed' }, visible)).toBe(0);
    expect(getUnavailableTaskDependencyCount({ ...work, status: 'Cancelled' }, visible)).toBe(0);
    expect(getUnavailableTaskDependencyCount(task({}), visible)).toBe(0);
  });
});

describe('approved work ownership', () => {
  it('keeps HOD-approved work in the waiting bucket and out of the Staff action queue', () => {
    const approved = task({ status: 'Approved', completionPercentage: 80 });
    const queue = buildStaffWorkQueue([approved], '2026-08-26');
    expect(queue.waiting).toEqual([approved]);
    expect(queue.needs_action).toEqual([]);
    expect(queue.up_next).toEqual([]);
  });
});

describe('explicit revision action', () => {
  it('guides returned work back to execution without pretending it is complete', () => {
    expect(getStaffGuidedAction(task({ status: 'Revision', completionPercentage: 50 }), ['Pending', 'In Progress', 'Waiting Approval', 'Completed'])).toMatchObject({ label: 'Start revision', targetStatus: 'In Progress', disabled: false });
  });
});

describe('reviewer-aware queue', () => {
  it('keeps submitted work waiting by default and reclassifies it when the predicate says it is actionable', () => {
    const waiting = task({ id: 'waiting', status: 'Waiting Approval' });
    expect(buildStaffWorkQueue([waiting], '2026-08-26').waiting.map(item => item.id)).toEqual(['waiting']);
    const reviewerQueue = buildStaffWorkQueue([waiting], '2026-08-26', { isActionable: () => true });
    expect(reviewerQueue.needs_action.map(item => item.id)).toEqual(['waiting']);
    expect(reviewerQueue.waiting).toEqual([]);
    expect(getStaffFocusTask(reviewerQueue)?.id).toBe('waiting');
  });

  it('agrees with the guided action for a department reviewer', () => {
    const actor = { id: 'reviewer-hod', name: 'HOD', role: 'HOD', departments: ['Video Editor'], hasLogin: true } as User;
    const statuses = ['Pending', 'In Progress', 'Waiting Approval', 'Approved', 'Completed'];
    const reviewable = task({ status: 'Waiting Approval', department: 'Video Editor', assignedTo: 'staff-1' });
    const isActionable = (item: Task) => getStaffGuidedAction(item, statuses, actor, [], { users: [actor] }).kind === 'advance';
    expect(getStaffGuidedAction(reviewable, statuses, actor, [], { users: [actor] }).kind).toBe('advance');
    expect(buildStaffWorkQueue([reviewable], '2026-08-26', { isActionable }).needs_action.map(item => item.id)).toEqual([reviewable.id]);
  });

  it('keeps linked review work actionable without an output', () => {
    const actor = { id: 'gated-hod', name: 'HOD', role: 'HOD', departments: ['Video Editor'], hasLogin: true } as User;
    const statuses = ['Pending', 'In Progress', 'Waiting Approval', 'Approved', 'Completed'];
    const scope = { users: [actor] };
    const linked = task({ status: 'Waiting Approval', department: 'Video Editor', deliverableId: 'output' });
    const plain = task({ status: 'Waiting Approval', department: 'Video Editor' });
    const workflow = { tasks: [linked, plain], cycles: [], deliverables: [] };
    expect(getStaffGuidedAction(linked, statuses, actor, [], scope).kind).toBe('advance');
    expect(isStaffGuidedActionEnabled(linked, statuses, actor, [], scope, workflow)).toBe(true);
    expect(isStaffGuidedActionEnabled(plain, statuses, actor, [], scope, workflow)).toBe(true);
  });

  it('does not block any review-ready status on a missing output', () => {
    const statuses = ['Pending', 'In Progress', 'Waiting Approval', 'Approved', 'Completed'];
    const hod = { id: 'evidence-hod', name: 'HOD', role: 'HOD', departments: ['Video Editor'], hasLogin: true } as User;
    const staff = { id: 'evidence-staff', name: 'Staff', role: 'Staff', departments: ['Video Editor'], hasLogin: true } as User;
    const pm = { id: 'evidence-pm', name: 'PM', role: 'Project Manager', departments: ['Management'], hasLogin: true } as User;

    const reviewTask = task({ status: 'Waiting Approval', department: 'Video Editor', deliverableId: 'output', assignedTo: staff.id });
    const reviewControls = getTaskStatusControls(hod, reviewTask, statuses, [], { users: [hod, staff] }, { tasks: [reviewTask], cycles: [], deliverables: [] });
    expect(reviewControls.find(option => option.status === 'Approved')?.disabledReason).toBeUndefined();

    const submitTask = task({ status: 'In Progress', department: 'Video Editor', deliverableId: 'output', assignedTo: staff.id });
    const submitControls = getTaskStatusControls(staff, submitTask, statuses, [], { users: [staff] }, { tasks: [submitTask], cycles: [], deliverables: [] });
    expect(submitControls.find(option => option.status === 'Waiting Approval')?.disabledReason).toBeUndefined();

    const completeTask = task({ status: 'Approved', department: 'Video Editor', deliverableId: 'output', assignedTo: staff.id, createdBy: pm.id });
    const completeControls = getTaskStatusControls(pm, completeTask, statuses, [], { users: [pm, staff] }, { tasks: [completeTask], cycles: [], deliverables: [] });
    expect(completeControls.find(option => option.status === 'Completed')?.disabledReason).toBeUndefined();
  });
});
