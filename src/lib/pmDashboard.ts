import { addDays } from 'date-fns/addDays';
import { isBefore } from 'date-fns/isBefore';
import { isWithinInterval } from 'date-fns/isWithinInterval';
import { startOfDay } from 'date-fns/startOfDay';
import type { CustomRole, Project, Task, User } from '../types';
import type { VisibilityScope } from './access';
import { isAwaitingClientReview, isAwaitingInternalReview } from './clientPortal';
import { isTaskCompleted } from './taskCompletion';
import { isTaskOpen } from './taskReporting';
import { parseOptionalDate } from './utils';
import { effectiveMilestoneStatus, milestoneTaskProgress, projectStatus } from './projectManagement';
import { getInternalReviewLane, isAwaitingMyInternalReview, isReadyForMyCompletion } from './taskWorkflowAccess';

// Internal submission, PM completion, and customer acceptance are distinct
// stages. Visibility alone does not tell us who is waiting to review.
export const getPortfolioReviewQueues = (tasks: readonly Task[]) => {
  const internal = tasks.filter(isAwaitingInternalReview);
  const completion = tasks.filter(task => task.status === 'Approved' && !task.isCompleted);
  const client = tasks.filter(isAwaitingClientReview);
  const waitingCount = new Set([...internal, ...completion, ...client].map(task => task.id)).size;
  return { internal, completion, client, waitingCount };
};

// The same stages, split by who must act next. `mine` and `completion` are
// decisions this user can take now; `department` is submitted work waiting on
// an HOD or review cover, shown for follow-up only.
export const getPersonalReviewQueues = (
  tasks: readonly Task[],
  context: { user: User | null | undefined; users: readonly User[]; roles?: CustomRole[]; scope?: VisibilityScope },
) => {
  const { user, users, roles = [], scope = {} } = context;
  const mine = tasks.filter(task => isAwaitingMyInternalReview(user, task, users, roles, scope));
  const mineIds = new Set(mine.map(task => task.id));
  const completion = tasks.filter(task => isReadyForMyCompletion(user, task, roles, scope));
  const completionIds = new Set(completion.map(task => task.id));
  const department = tasks.filter(task => isAwaitingInternalReview(task) && !task.isCompleted
    && !mineIds.has(task.id) && !completionIds.has(task.id)
    && getInternalReviewLane(task, users, roles, scope) !== 'none');
  const client = tasks.filter(isAwaitingClientReview);
  return { mine, completion, department, client, actionableCount: new Set([...mineIds, ...completionIds]).size };
};

export type ProjectHealth = 'onTrack' | 'attentionRequired' | 'atRisk';

export const assessProjectHealth = (project: Project, allTasks: readonly Task[], now = new Date()) => {
  const today = startOfDay(now);
  const taskList = allTasks.filter(task => task.projectId === project.id && task.status !== 'Cancelled');
  const openTasks = taskList.filter(isTaskOpen);
  const completedTasks = taskList.filter(isTaskCompleted);
  const overdueTasks = openTasks.filter(task => {
    const due = parseOptionalDate(task.dueDate);
    return Boolean(due && isBefore(due, today));
  });
  const nextWeek = addDays(today, 7);
  const upcomingTasks = openTasks.filter(task => {
    const due = parseOptionalDate(task.dueDate);
    return Boolean(due && isWithinInterval(due, { start: today, end: nextWeek }));
  });
  const pendingApprovals = openTasks.filter(isAwaitingInternalReview);
  const milestones = project.milestones || [];
  const incompleteMilestones = milestones.filter(milestone => effectiveMilestoneStatus(milestone, taskList) !== 'Completed');
  const delayedMilestones = incompleteMilestones.filter(milestone => effectiveMilestoneStatus(milestone, taskList) === 'Delayed');
  const upcomingMilestones = incompleteMilestones.filter(milestone => {
    const target = parseOptionalDate(milestone.targetDate);
    return Boolean(target && isWithinInterval(target, { start: today, end: nextWeek }));
  });
  const projectDeadline = parseOptionalDate(project.deadline);
  const projectDeadlinePassed = Boolean(projectDeadline && isBefore(projectDeadline, today) && openTasks.length > 0);
  const health: ProjectHealth = overdueTasks.length > 0 || delayedMilestones.length > 0 || projectDeadlinePassed
    ? 'atRisk'
    : upcomingTasks.length > 0 || upcomingMilestones.length > 0 || pendingApprovals.length > 0
      ? 'attentionRequired'
      : 'onTrack';
  const nextDueDate = [
    projectDeadline && !isBefore(projectDeadline, today) ? project.deadline : undefined,
    ...openTasks.map(task => task.dueDate).filter(value => {
      const due = parseOptionalDate(value);
      return Boolean(due && !isBefore(due, today));
    }),
  ].filter((value): value is string => Boolean(value)).sort((left, right) => (
    (parseOptionalDate(left)?.getTime() || Number.MAX_SAFE_INTEGER)
    - (parseOptionalDate(right)?.getTime() || Number.MAX_SAFE_INTEGER)
  ))[0];

  return {
    health,
    taskCount: taskList.length,
    completedCount: completedTasks.length,
    openCount: openTasks.length,
    overdueCount: overdueTasks.length,
    upcomingCount: upcomingTasks.length,
    pendingApprovalCount: pendingApprovals.length,
    milestoneCount: milestones.length,
    incompleteMilestoneCount: incompleteMilestones.length,
    delayedMilestoneCount: delayedMilestones.length,
    milestoneProgressPercent: milestones.length
      ? Math.round(milestones.reduce((sum, milestone) => sum + (milestoneTaskProgress(milestone.id, taskList).percent
        ?? (effectiveMilestoneStatus(milestone, taskList) === 'Completed' ? 100 : 0)), 0) / milestones.length)
      : undefined,
    progressPercent: taskList.length ? Math.round((completedTasks.length / taskList.length) * 100) : undefined,
    projectStatus: projectStatus(project),
    nextDueDate,
    assignedMemberIds: Array.from(new Set(openTasks.map(task => task.assignedTo).filter((id): id is string => Boolean(id)))),
  };
};
