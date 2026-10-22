import { isBefore } from 'date-fns/isBefore';
import { startOfDay } from 'date-fns/startOfDay';
import type {
  Project,
  ProjectApprovalMode,
  ProjectClosureWarningSnapshot,
  ProjectMilestone,
  Task,
  TaskApprovalMode,
  User,
} from '../types';
import { isAwaitingInternalReview } from './clientPortal';
import { isTaskCompleted } from './taskCompletion';
import { parseOptionalDate } from './utils';

export const projectStatus = (project: Project) => project.status || 'Active';

export const isClosedProject = (project: Project | null | undefined) => (
  Boolean(project && projectStatus(project) === 'Closed')
);

export const getProjectMemberIds = (project: Project) => new Set([
  ...(project.projectManagerIds || []),
  ...(project.hodMemberIds || []),
  ...(project.staffMemberIds || []),
]);

export const isProjectMember = (project: Project, memberId: string) => getProjectMemberIds(project).has(memberId);

export const getEffectiveTaskApprovalMode = (
  task: Pick<Task, 'approvalMode' | 'requiresInternalApproval' | 'projectId'>,
  projects: readonly Project[],
): ProjectApprovalMode => {
  if (task.approvalMode && task.approvalMode !== 'inherit') return task.approvalMode;
  if (task.approvalMode === 'inherit') {
    return projects.find(project => project.id === task.projectId)?.defaultApprovalMode || 'none';
  }
  // Compatibility rule: pre-feature tasks keep their exact boolean behaviour.
  return task.requiresInternalApproval === false ? 'none' : 'hod';
};

export const approvalModeRequiresReview = (mode: TaskApprovalMode | ProjectApprovalMode) => mode !== 'none';

export const milestoneTaskProgress = (milestoneId: string, tasks: readonly Task[]) => {
  const related = tasks.filter(task => task.milestoneId === milestoneId && task.status !== 'Cancelled');
  const completed = related.filter(isTaskCompleted).length;
  return {
    taskCount: related.length,
    completedCount: completed,
    percent: related.length ? Math.round((completed / related.length) * 100) : undefined,
  };
};

export const effectiveMilestoneStatus = (milestone: ProjectMilestone, tasks: readonly Task[]) => {
  const progress = milestoneTaskProgress(milestone.id, tasks);
  if (!progress.taskCount && milestone.status === 'Completed') return milestone.status;
  if (progress.taskCount > 0 && progress.completedCount === progress.taskCount) return 'Completed' as const;
  const target = parseOptionalDate(milestone.targetDate);
  if (target && isBefore(target, startOfDay(new Date()))) return 'Delayed' as const;
  if (!progress.taskCount) return milestone.status;
  return progress.completedCount > 0 ? 'In Progress' as const : 'Not Started' as const;
};

export const getProjectClosureWarnings = (
  project: Project,
  tasks: readonly Task[],
  now = new Date(),
): Omit<ProjectClosureWarningSnapshot, 'confirmedAt'> => {
  const today = startOfDay(now);
  const projectTasks = tasks.filter(task => task.projectId === project.id && task.status !== 'Cancelled');
  return {
    outstandingTasks: projectTasks.filter(task => !isTaskCompleted(task)).length,
    pendingApprovals: projectTasks.filter(isAwaitingInternalReview).length,
    overdueTasks: projectTasks.filter(task => {
      const due = parseOptionalDate(task.dueDate);
      return !isTaskCompleted(task) && Boolean(due && isBefore(due, today));
    }).length,
    incompleteMilestones: (project.milestones || []).filter(milestone => (
      effectiveMilestoneStatus(milestone, projectTasks) !== 'Completed'
    )).length,
  };
};

export const hasProjectClosureWarnings = (warnings: Omit<ProjectClosureWarningSnapshot, 'confirmedAt'>) => (
  Object.values(warnings).some(value => value > 0)
);

export const canManageProjectLifecycle = (actor: User | null | undefined, project: Project) => Boolean(
  actor && (actor.isSuperAdmin || (actor.role === 'Project Manager' && (
    project.projectManagerIds?.includes(actor.id) || (!project.projectManagerIds && project.createdBy === actor.id)
  )))
);

export const makeMilestoneId = () => `M-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
