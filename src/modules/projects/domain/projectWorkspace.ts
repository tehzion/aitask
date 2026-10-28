import { addDays } from 'date-fns/addDays';
import { isBefore } from 'date-fns/isBefore';
import { startOfDay } from 'date-fns/startOfDay';
import { isAwaitingClientReview, isAwaitingInternalReview } from '../../../shared/authorization/clientPortal';
import { effectiveMilestoneStatus } from '../../../shared/rules/projectManagement';
import { isTaskCompleted } from '../../../shared/rules/taskCompletion';
import type { Project, ProjectMilestone, Task } from '../../../shared/types/index';
import { parseOptionalDate } from '../../../shared/utils/utils';
import { isTaskOpen } from '../../reports/domain/taskReporting';

export type ProjectTaskDueFilter = 'any' | 'overdue' | 'nextSevenDays' | 'noDate';

export interface ProjectTaskFilters {
  search: string;
  status: string;
  priority: string;
  assignee: string;
  due: ProjectTaskDueFilter;
}

export const getProjectWorkspaceSummary = (project: Project, sourceTasks: readonly Task[], now = new Date()) => {
  const tasks = sourceTasks.filter(task => task.projectId === project.id && task.status !== 'Cancelled');
  const today = startOfDay(now);
  const nextWeek = addDays(today, 7);
  const open = tasks.filter(isTaskOpen);
  const overdue = open.filter(task => {
    const due = parseOptionalDate(task.dueDate);
    return Boolean(due && isBefore(due, today));
  });
  const pendingReviews = tasks.filter(task => isAwaitingInternalReview(task) || isAwaitingClientReview(task));
  const upcoming = open.filter(task => {
    const due = parseOptionalDate(task.dueDate);
    return Boolean(due && !isBefore(due, today) && due <= nextWeek);
  });

  return {
    total: tasks.length,
    completed: tasks.filter(isTaskCompleted).length,
    open: open.length,
    overdue,
    pendingReviews,
    upcoming,
    progressPercent: tasks.length ? Math.round((tasks.filter(isTaskCompleted).length / tasks.length) * 100) : undefined,
  };
};

export const getNextProjectMilestone = (project: Project, tasks: readonly Task[]): ProjectMilestone | undefined => (
  (project.milestones || [])
    .filter(milestone => effectiveMilestoneStatus(milestone, tasks.filter(task => task.projectId === project.id)) !== 'Completed')
    .slice()
    .sort((left, right) => (parseOptionalDate(left.targetDate)?.getTime() ?? Number.MAX_SAFE_INTEGER)
      - (parseOptionalDate(right.targetDate)?.getTime() ?? Number.MAX_SAFE_INTEGER))[0]
);

export const filterProjectTasks = (
  tasks: readonly Task[],
  filters: ProjectTaskFilters,
  now = new Date(),
) => {
  const today = startOfDay(now);
  const nextWeek = addDays(today, 7);
  const query = filters.search.trim().toLocaleLowerCase();
  return tasks.filter(task => {
    if (filters.status && filters.status !== 'All' && task.status !== filters.status) return false;
    if (filters.priority && filters.priority !== 'All' && task.priority !== filters.priority) return false;
    if (filters.assignee && task.assignedTo !== filters.assignee) return false;
    if (query && !`${task.title} ${task.description}`.toLocaleLowerCase().includes(query)) return false;
    if (filters.due === 'any') return true;
    const due = parseOptionalDate(task.dueDate);
    if (filters.due === 'noDate') return !due;
    if (!due) return false;
    if (filters.due === 'overdue') return isTaskOpen(task) && isBefore(due, today);
    return isTaskOpen(task) && !isBefore(due, today) && due <= nextWeek;
  });
};

export const getProjectAttentionTasks = (tasks: readonly Task[], now = new Date()) => {
  const today = startOfDay(now);
  const nextWeek = addDays(today, 7);
  const isOverdue = (task: Task) => {
    const due = parseOptionalDate(task.dueDate);
    return Boolean(isTaskOpen(task) && due && isBefore(due, today));
  };
  const overdueIds = new Set(tasks.filter(isOverdue).map(task => task.id));
  const pendingReviewIds = new Set(tasks
    .filter(task => !overdueIds.has(task.id) && (isAwaitingInternalReview(task) || isAwaitingClientReview(task)))
    .map(task => task.id));
  const revisionIds = new Set(tasks
    .filter(task => isTaskOpen(task) && task.status === 'Revision' && !overdueIds.has(task.id) && !pendingReviewIds.has(task.id))
    .map(task => task.id));
  const upcomingIds = new Set(tasks.filter(task => {
    const due = parseOptionalDate(task.dueDate);
    return Boolean(isTaskOpen(task) && due && !isBefore(due, today) && due <= nextWeek
      && !overdueIds.has(task.id) && !pendingReviewIds.has(task.id) && !revisionIds.has(task.id));
  }).map(task => task.id));
  const unassignedIds = new Set(tasks
    .filter(task => isTaskOpen(task) && (!task.assignedTo?.trim() || task.assignmentState === 'needs_hod' || task.assignmentState === 'pending_hod')
      && !overdueIds.has(task.id) && !pendingReviewIds.has(task.id) && !revisionIds.has(task.id) && !upcomingIds.has(task.id))
    .map(task => task.id));

  return [
    ...tasks.filter(task => overdueIds.has(task.id)).map(task => ({ task, kind: 'overdue' as const })),
    ...tasks.filter(task => pendingReviewIds.has(task.id)).map(task => ({ task, kind: 'review' as const })),
    ...tasks.filter(task => revisionIds.has(task.id)).map(task => ({ task, kind: 'revision' as const })),
    ...tasks.filter(task => upcomingIds.has(task.id)).map(task => ({ task, kind: 'upcoming' as const })),
    ...tasks.filter(task => unassignedIds.has(task.id)).map(task => ({ task, kind: 'assignment' as const })),
  ];
};
