import { describe, expect, it } from 'vitest';
import type { Task, User } from '../types';
import { buildStaffWorkQueue, getLatestRevisionNote, getStaffFocusTask, getStaffGuidedAction, getTaskBlockers, getHodScopeTasks, getUnavailableTaskDependencyCount, isStaffGuidedActionEnabled, isTaskWaitingOnEarlierSteps } from './staffWorkspace';
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
      task({ id: 'blocked', dueDate: '2026-08-19', workState: { blocker: { reason: 'Waiting for footage', openedBy: 'staff-1', openedAt: '2026-08-19T00:00:00Z' } } as Task['workState'] }),
      task({ id: 'waiting', status: 'Waiting Approval' }),
      task({ id: 'done', status: 'Completed', isCompleted: true, completedAt: '2026-08-25T10:00:00Z' }),
      task({ id: 'cancelled', status: 'Cancelled' }),
    ], '2026-08-26');

    // Today order: overdue, due today, revisions, in progress; blocked last.
    expect(queue.needs_action.map(item => item.id)).toEqual(['overdue', 'today', 'revision', 'progress', 'blocked']);
    expect(queue.up_next.map(item => item.id)).toEqual(['future', 'undated']);
    expect(queue.waiting.map(item => item.id)).toEqual(['waiting']);
    expect(queue.done.map(item => item.id)).toEqual(['done', 'cancelled']);
    expect(getStaffFocusTask(queue)?.id).toBe('overdue');
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

  it('shows the next action as disabled when a pending task has no assignee', () => {
    const pm = { id: 'pm', name: 'PM', role: 'Project Manager', departments: ['Management'] } as User;
    expect(getStaffGuidedAction(task({ status: 'Pending', assignedTo: '' }), statuses, pm)).toMatchObject({ kind: 'advance', label: 'Start work', targetStatus: 'In Progress', disabled: true });
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

describe('revision note on the card', () => {
  it('shows the latest reviewer note only while the task is in revision', () => {
    const comments = [
      { id: 'c1', userId: 'pm', text: 'Revision requested: Fix the logo', createdAt: '2026-08-01T00:00:00Z' },
      { id: 'c2', userId: 'staff-1', text: 'On it', createdAt: '2026-08-02T00:00:00Z' },
      { id: 'c3', userId: 'pm', text: 'Revision requested: Use the new colours', createdAt: '2026-08-03T00:00:00Z' },
    ];
    expect(getLatestRevisionNote(task({ revisionCount: 2, comments }))).toBe('Use the new colours');
    expect(getLatestRevisionNote(task({ revisionCount: 0, comments }))).toBeUndefined();
    expect(getLatestRevisionNote(task({ revisionCount: 1, comments: [comments[1]] }))).toBeUndefined();
  });
});

describe('work waiting on earlier steps (role audit, 10 Nov 2026)', () => {
  const shooting = task({ id: 'shooting', title: '5. Shooting' });
  const editing = task({ id: 'editing', predecessorTaskIds: ['shooting'], dueDate: '2026-08-20' });
  const hidden = task({ id: 'hidden-pred', predecessorTaskIds: ['not-visible'], dueDate: '2026-08-21' });
  const hiddenDone = task({ id: 'hidden-done', predecessorTaskIds: ['not-visible'], workflowDependenciesReady: true });

  it('waits on open visible steps and on hidden steps the server has not confirmed done', () => {
    const visible = [shooting, editing, hidden, hiddenDone];
    expect(isTaskWaitingOnEarlierSteps(editing, visible)).toBe(true);
    expect(isTaskWaitingOnEarlierSteps(hidden, visible)).toBe(true);
    expect(isTaskWaitingOnEarlierSteps(hiddenDone, visible)).toBe(false);
    expect(isTaskWaitingOnEarlierSteps(shooting, visible)).toBe(false);
    expect(isTaskWaitingOnEarlierSteps(editing, [{ ...shooting, status: 'Completed', isCompleted: true }, editing])).toBe(false);
  });

  it('sorts waiting work last and never picks it as the focus task', () => {
    const later = task({ id: 'later', dueDate: '2026-09-10' });
    const visible = [shooting, editing, hidden, later];
    const isBlocked = (item: Task) => isTaskWaitingOnEarlierSteps(item, visible);
    const queue = buildStaffWorkQueue([editing, hidden, later], '2026-08-26', { isBlocked });
    expect(queue.needs_action.map(item => item.id)).toEqual(['editing', 'hidden-pred']);
    expect(getStaffFocusTask(queue, isBlocked)?.id).toBe('later');
    const allBlocked = buildStaffWorkQueue([editing, hidden], '2026-08-26', { isBlocked });
    expect(getStaffFocusTask(allBlocked, isBlocked)).toBeUndefined();
  });

  it('puts an HOD\'s hand-out decisions under Needs action', () => {
    const toAssign = task({ id: 'assign-me', dueDate: '2026-09-20', assignmentState: 'pending_hod', assignedTo: 'hod-1', responsibleHodId: 'hod-1' });
    const queue = buildStaffWorkQueue([toAssign], '2026-08-26', { needsAction: item => item.id === 'assign-me' });
    expect(queue.needs_action.map(item => item.id)).toEqual(['assign-me']);
    expect(buildStaffWorkQueue([toAssign], '2026-08-26').up_next.map(item => item.id)).toEqual(['assign-me']);
  });
});
