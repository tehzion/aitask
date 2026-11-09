import { describe, expect, it } from 'vitest';
import type { Deliverable, ServiceCycle, Task } from '../types';
import { getCurrentPublishedCycle, getLinkableDeliverables, getTaskDeliverable, getUnlinkedOpenTasks, suggestDeliverableForTask } from './deliveryLinks';
import { getAssignmentStateLabel, isAwaitingHodAssignment, isHandledByHod, projectHasNoHod } from './taskWorkflowAccess';

const cycle = (id: string, status: ServiceCycle['status'], periodStart: string, periodEnd: string, clientId = 'c1') => (
  { id, clientId, status, periodStart, periodEnd } as ServiceCycle
);
const deliverable = (id: string, title: string, extra: Partial<Deliverable> = {}) => (
  { id, title, cycleId: 'nov', clientId: 'c1', status: 'Planned', taskIds: [], ...extra } as Deliverable
);
const task = (id: string, extra: Partial<Task> = {}) => (
  { id, title: id, clientId: 'c1', status: 'Pending', isCompleted: false, ...extra } as Task
);

describe('team feedback F2: counting project tasks toward the month', () => {
  const cycles = [
    cycle('oct', 'Completed', '2026-10-01', '2026-10-31'),
    cycle('nov-draft', 'Draft', '2026-11-01', '2026-11-30', 'c2'),
    cycle('nov', 'Published', '2026-11-01', '2026-11-30'),
  ];

  it('finds only the client\'s published month that covers today', () => {
    expect(getCurrentPublishedCycle(cycles, 'c1', '2026-11-09')?.id).toBe('nov');
    expect(getCurrentPublishedCycle(cycles, 'c1', '2026-12-01')).toBeUndefined();
    expect(getCurrentPublishedCycle(cycles, 'c2', '2026-11-09')).toBeUndefined();
    expect(getCurrentPublishedCycle(cycles, undefined, '2026-11-09')).toBeUndefined();
  });

  it('offers open, manual deliverables in that month, in name order', () => {
    const items = [
      deliverable('d10', 'Social Posts 10'),
      deliverable('d2', 'Social Posts 2'),
      deliverable('done', 'Reel 1', { status: 'Delivered' }),
      deliverable('flow', 'Video 1', { workflowGeneratedAt: '2026-11-02' }),
      deliverable('other', 'Social Posts 1', { cycleId: 'oct' }),
    ];
    expect(getLinkableDeliverables(items, 'nov').map(item => item.id)).toEqual(['d2', 'd10']);
    expect(getLinkableDeliverables(items, undefined)).toEqual([]);
  });

  it('suggests the first deliverable with no tasks whose name matches the title', () => {
    const items = [
      deliverable('taken', 'Social Posts 1', { taskIds: ['t0'] }),
      deliverable('free', 'Social Posts 2'),
      deliverable('reel', 'Reel 1'),
    ];
    expect(suggestDeliverableForTask('November posts for Instagram', items)?.id).toBe('free');
    expect(suggestDeliverableForTask('Shoot the reel', items)?.id).toBe('reel');
    expect(suggestDeliverableForTask('Client call', items)).toBeUndefined();
    expect(suggestDeliverableForTask('', items)).toBeUndefined();
  });

  it('lists open, unlinked, hand-made tasks of the client, earliest due first', () => {
    const items = [deliverable('d1', 'Posts 1', { taskIds: ['linked-by-deliverable'] })];
    const tasks = [
      task('late', { dueDate: '2026-11-20' }),
      task('early', { dueDate: '2026-11-05' }),
      task('no-date'),
      task('done', { isCompleted: true, status: 'Completed' }),
      task('linked', { deliverableId: 'd1' }),
      task('linked-by-deliverable'),
      task('generated', { generatedFromDeliverable: true }),
      task('other-client', { clientId: 'c2' }),
    ];
    expect(getUnlinkedOpenTasks(tasks, items, 'c1').map(item => item.id)).toEqual(['early', 'late', 'no-date']);
  });
});

describe('team feedback F4: HOD assignment state', () => {
  const hodHeld = { assignmentState: 'pending_hod' as const, assignedTo: 'mabel', responsibleHodId: 'mabel' };

  it('treats a pending_hod task the HOD has started as handled by the HOD', () => {
    expect(isHandledByHod(task('t', { ...hodHeld, status: 'In Progress' }))).toBe(true);
    expect(isAwaitingHodAssignment(task('t', { ...hodHeld, status: 'In Progress' }))).toBe(false);
    expect(getAssignmentStateLabel(task('t', { ...hodHeld, status: 'In Progress' }))).toBe('Handled by HOD');
  });

  it('keeps a not-yet-started pending_hod task in the HOD queue', () => {
    expect(isAwaitingHodAssignment(task('t', { ...hodHeld, status: 'Pending' }))).toBe(true);
    expect(getAssignmentStateLabel(task('t', { ...hodHeld, status: 'Pending' }))).toBe('Pending HOD Assignment');
  });

  it('never counts finished work as waiting for assignment', () => {
    const finished = task('t', { ...hodHeld, status: 'Completed', isCompleted: true });
    expect(isAwaitingHodAssignment(finished)).toBe(false);
    expect(getAssignmentStateLabel(finished)).toBe('Handled by HOD');
  });

  it('labels the other states as before', () => {
    expect(getAssignmentStateLabel(task('t', { assignmentState: 'assigned_staff' }))).toBe('Assigned to Staff');
    expect(getAssignmentStateLabel(task('t', { assignmentState: 'needs_hod' }))).toBe('Awaiting HOD');
  });
});

describe('team feedback F2/F4 leftovers', () => {
  it('finds the deliverable a task counts toward from either side of the link', () => {
    const items = [deliverable('d1', 'Posts 1', { taskIds: ['by-list'] }), deliverable('d2', 'Posts 2')];
    expect(getTaskDeliverable(task('by-field', { deliverableId: 'd2' }), items)?.id).toBe('d2');
    expect(getTaskDeliverable(task('by-list'), items)?.id).toBe('d1');
    expect(getTaskDeliverable(task('loose'), items)).toBeUndefined();
  });

  it('says the PM assigns directly on a project with no HOD', () => {
    const open = task('t', { assignmentState: 'needs_hod' });
    expect(projectHasNoHod({ hodMemberIds: [] })).toBe(true);
    expect(projectHasNoHod({ hodMemberIds: undefined })).toBe(true);
    expect(projectHasNoHod({ hodMemberIds: ['mabel'] })).toBe(false);
    expect(projectHasNoHod(undefined)).toBe(false);
    expect(getAssignmentStateLabel(open, { hodMemberIds: [] })).toBe('PM assigns directly');
    expect(getAssignmentStateLabel(open, { hodMemberIds: ['mabel'] })).toBe('Awaiting HOD');
    expect(getAssignmentStateLabel(task('t', { assignmentState: 'assigned_staff' }), { hodMemberIds: [] })).toBe('Assigned to Staff');
  });
});
