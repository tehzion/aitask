import type { Project, Task } from '../types';
import { getEffectiveTaskApprovalMode } from './projectManagement';
import { isTaskCompleted } from './taskCompletion';

/**
 * User-facing task stages. These are display groupings over the existing
 * lifecycle statuses; no status is added, renamed, or written back.
 *
 *   To do        Pending, Revision, and any custom open status
 *   In progress  In Progress
 *   In review    Waiting Approval ("Waiting for review") and Approved ("Review approved")
 *   Completed    Completed, or isCompleted
 *   Cancelled    Cancelled (only listed under All)
 *
 * Approved stays under In review: the reviewer has signed off, but the task is
 * not finished until completion is confirmed.
 */
export type TaskStage = 'todo' | 'in_progress' | 'review' | 'completed' | 'cancelled';

export const getTaskStage = (task: Pick<Task, 'status' | 'isCompleted'>): TaskStage => {
  if (isTaskCompleted(task)) return 'completed';
  if (task.status === 'Cancelled') return 'cancelled';
  if (task.status === 'Waiting Approval' || task.status === 'Approved') return 'review';
  if (task.status === 'In Progress') return 'in_progress';
  return 'todo';
};

/** List tabs: Active is every open stage; All also includes cancelled work. */
export type TaskStageFilter = 'active' | 'todo' | 'in_progress' | 'review' | 'completed' | 'all';

export const TASK_STAGE_FILTERS: readonly TaskStageFilter[] = ['active', 'todo', 'in_progress', 'review', 'completed', 'all'];

export const TASK_STAGE_FILTER_LABELS: Record<TaskStageFilter, string> = {
  active: 'Active work',
  todo: 'To do',
  in_progress: 'In progress',
  review: 'In review',
  completed: 'Completed',
  all: 'All tasks',
};

export const parseTaskStageFilter = (value: string | null | undefined): TaskStageFilter => (
  TASK_STAGE_FILTERS.includes(value as TaskStageFilter) ? value as TaskStageFilter : 'active'
);

export const isTaskInStageFilter = (task: Pick<Task, 'status' | 'isCompleted'>, filter: TaskStageFilter) => {
  if (filter === 'all') return true;
  const stage = getTaskStage(task);
  if (filter === 'active') return stage === 'todo' || stage === 'in_progress' || stage === 'review';
  return stage === filter;
};

export const countTasksByStageFilter = (tasks: readonly Pick<Task, 'status' | 'isCompleted'>[]) => {
  const counts: Record<TaskStageFilter, number> = { active: 0, todo: 0, in_progress: 0, review: 0, completed: 0, all: tasks.length };
  tasks.forEach(task => {
    const stage = getTaskStage(task);
    if (stage === 'cancelled') return;
    counts[stage] += 1;
    if (stage !== 'completed') counts.active += 1;
  });
  return counts;
};

/** Workflow steps for one task, following its configured review requirement. */
export type TaskWorkflowStep = 'todo' | 'in_progress' | 'review' | 'approved' | 'completed';

export const getTaskWorkflowSteps = (
  task: Pick<Task, 'status' | 'isCompleted' | 'approvalMode' | 'requiresInternalApproval' | 'projectId'>,
  projects: readonly Project[],
): { steps: TaskWorkflowStep[]; current: number } | null => {
  if (task.status === 'Cancelled' && !task.isCompleted) return null;
  const position: TaskWorkflowStep = isTaskCompleted(task)
    ? 'completed'
    : task.status === 'Approved'
      ? 'approved'
      : task.status === 'Waiting Approval'
        ? 'review'
        : task.status === 'In Progress'
          ? 'in_progress'
          : 'todo';
  // A task already in review keeps its review steps even when the current
  // setting no longer requires review, so its real position is never hidden.
  const hasReview = getEffectiveTaskApprovalMode(task, projects) !== 'none' || position === 'review' || position === 'approved';
  const steps: TaskWorkflowStep[] = hasReview
    ? ['todo', 'in_progress', 'review', 'approved', 'completed']
    : ['todo', 'in_progress', 'completed'];
  return { steps, current: steps.indexOf(position) };
};
