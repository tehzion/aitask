import { describe, expect, it } from 'vitest';
import type { Project, Task } from '../../../shared/types/index';
import { filterProjectTasks, getNextProjectMilestone, getProjectAttentionTasks, getProjectWorkspaceSummary } from './projectWorkspace';

const project: Project = {
  id: 'p-1', clientId: 'c-1', clientName: 'Northstar', projectName: 'Website refresh', services: ['Website'],
  startDate: '2026-10-01', deadline: '2026-11-30', status: 'Active', milestones: [
    { id: 'm-later', name: 'Launch', targetDate: '2026-11-30', status: 'Not Started', createdAt: '', updatedAt: '' },
    { id: 'm-sooner', name: 'Review', targetDate: '2026-10-27', status: 'Not Started', createdAt: '', updatedAt: '' },
  ],
};

const task = (id: string, overrides: Partial<Task> = {}): Task => ({
  id, clientId: 'c-1', projectId: 'p-1', clientName: 'Northstar', projectName: 'Website refresh',
  title: id, description: '', serviceType: 'Website', department: 'Designer', assignedTo: 'staff-1',
  createdBy: 'pm-1', startDate: '2026-10-20', dueDate: '', priority: 'Medium', status: 'Pending',
  completionPercentage: 0, isCompleted: false, revisionCount: 0, clientApprovalStatus: 'Pending',
  isRecurring: false, ...overrides,
});

describe('project workspace data', () => {
  it('summarizes only this project and excludes cancelled work from progress', () => {
    const tasks = [
      task('done', { status: 'Completed', isCompleted: true, completionPercentage: 100 }),
      task('overdue', { dueDate: '2026-10-20', status: 'In Progress' }),
      task('cancelled', { status: 'Cancelled' }),
      task('other-project', { projectId: 'p-2' }),
    ];
    expect(getProjectWorkspaceSummary(project, tasks, new Date('2026-10-25T12:00:00')))
      .toMatchObject({ total: 2, completed: 1, open: 1, progressPercent: 50, overdue: [expect.objectContaining({ id: 'overdue' })] });
  });

  it('counts internal reviews once and orders attention by urgency', () => {
    const tasks = [
      task('review', { status: 'Waiting Approval', dueDate: '2026-10-29' }),
      task('late', { status: 'In Progress', dueDate: '2026-10-20' }),
      task('revision', { status: 'Revision', revisionCount: 1 }),
      task('soon', { status: 'In Progress', dueDate: '2026-10-28' }),
    ];
    const now = new Date('2026-10-25T12:00:00');
    expect(getProjectWorkspaceSummary(project, tasks, now).pendingReviews).toHaveLength(1);
    expect(getProjectAttentionTasks(tasks, now).map(item => [item.task.id, item.kind])).toEqual([
      ['late', 'overdue'], ['review', 'review'], ['revision', 'revision'], ['soon', 'upcoming'],
    ]);
  });

  it('filters tasks by text, status, priority, assignee, and due-date bucket', () => {
    const tasks = [
      task('urgent design', { title: 'Urgent design', status: 'In Progress', priority: 'Urgent', assignedTo: 'staff-2', dueDate: '2026-10-28' }),
      task('later', { title: 'Later copy', dueDate: '2026-11-20' }),
      task('no date', { title: 'No deadline' }),
    ];
    expect(filterProjectTasks(tasks, {
      search: 'design', status: 'In Progress', priority: 'Urgent', assignee: 'staff-2', due: 'nextSevenDays',
    }, new Date('2026-10-25T12:00:00'))).toEqual([tasks[0]]);
    expect(filterProjectTasks(tasks, { search: '', status: 'All', priority: 'All', assignee: '', due: 'noDate' })).toEqual([tasks[2]]);
  });

  it('selects the next incomplete milestone using project task-linked status', () => {
    const tasks = [task('milestone-task', { milestoneId: 'm-sooner', status: 'Completed', isCompleted: true })];
    expect(getNextProjectMilestone(project, tasks)?.id).toBe('m-later');
  });
});
