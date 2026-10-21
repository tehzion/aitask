import {
  addDays,
  endOfMonth,
  endOfDay,
  isBefore,
  isWithinInterval,
  startOfDay,
  startOfMonth,
} from 'date-fns';
import type {
  ClientServicePlan,
  Deliverable,
  Project,
  ServiceCycle,
  Task,
  User,
} from '../types';
import { getClientTaskStage } from './clientPortal';
import { assessProjectHealth, getPortfolioReviewQueues } from './pmDashboard';
import { projectStatus } from './projectManagement';
import { isTaskCompleted } from './taskCompletion';
import { isTaskOpen, isTaskOverdue } from './taskReporting';
import { parseOptionalDate } from './utils';

export type ManagementAttentionSeverity = 'information' | 'attention' | 'critical';

export interface ManagementAttentionItem {
  id: string;
  severity: ManagementAttentionSeverity;
  title: string;
  detail: string;
  to: string;
  dueDate?: string;
}

export interface ManagementProjectRow {
  project: Project;
  health: ReturnType<typeof assessProjectHealth>;
}

export interface ProjectManagerOverview {
  member: User;
  projects: number;
  overdueTasks: number;
  pendingReviews: number;
  atRiskProjects: number;
}

export interface ManagementSnapshot {
  activeProjects: number;
  completedProjects: number;
  atRiskProjects: number;
  overdueTasks: number;
  pendingApprovals: number;
  activeMonthlyPlans: number;
  upcomingRenewals: number;
  overdueRenewals: number;
  overdueDeliverables: number;
  projectRows: ManagementProjectRow[];
  projectManagers: ProjectManagerOverview[];
}

export interface MonthlyOperationalReport {
  monthStart: Date;
  monthEnd: Date;
  activeProjects: number;
  completedTasks: number;
  outstandingTasks: number;
  completedDeliverables: number;
  totalDeliverables: number;
  pendingApprovals: number;
  renewals: number;
  delayedMilestones: number;
  overdueItems: number;
  projectRows: Array<{
    project: Project;
    completedTasks: number;
    outstandingTasks: number;
    delayedMilestones: number;
    overdueItems: number;
  }>;
}

export interface ManagementIntelligenceInput {
  projects: readonly Project[];
  tasks: readonly Task[];
  deliverables: readonly Deliverable[];
  clientPlans: readonly ClientServicePlan[];
  serviceCycles: readonly ServiceCycle[];
  users?: readonly User[];
  now?: Date;
}

const planRenewalDate = (plan: ClientServicePlan) => parseOptionalDate(plan.nextCycleStart || plan.contractEndDate);

const cycleEndById = (cycles: readonly ServiceCycle[]) => new Map(
  cycles.map(cycle => [cycle.id, parseOptionalDate(cycle.periodEnd)]),
);

export const getOverdueDeliverables = (
  deliverables: readonly Deliverable[],
  serviceCycles: readonly ServiceCycle[],
  now = new Date(),
) => {
  const today = startOfDay(now);
  const ends = cycleEndById(serviceCycles);
  return deliverables.filter(deliverable => {
    if (deliverable.status === 'Delivered') return false;
    const cycleEnd = ends.get(deliverable.cycleId);
    return Boolean(cycleEnd && isBefore(cycleEnd, today));
  });
};

export const getManagementSnapshot = ({
  projects,
  tasks,
  deliverables,
  clientPlans,
  serviceCycles,
  users = [],
  now = new Date(),
}: ManagementIntelligenceInput): ManagementSnapshot => {
  const projectRows = projects
    .filter(project => projectStatus(project) !== 'Closed')
    .map(project => ({ project, health: assessProjectHealth(project, tasks, now) }));
  const activePlans = clientPlans.filter(plan => plan.status === 'Active');
  const today = startOfDay(now);
  const renewalWindowEnd = endOfDay(addDays(today, 30));
  const renewalDates = activePlans.map(planRenewalDate);
  const overdueDeliverables = getOverdueDeliverables(deliverables, serviceCycles, now);
  const projectManagerUsers = users.filter(user => user.role === 'Project Manager' && !user.directoryOnly);
  const projectManagers = projectManagerUsers.map(member => {
    const memberProjects = projects.filter(project => (
      project.projectManagerIds !== undefined
        ? project.projectManagerIds.includes(member.id)
        : project.createdBy === member.id
    ));
    const projectIds = new Set(memberProjects.map(project => project.id));
    const memberTasks = tasks.filter(task => task.projectId && projectIds.has(task.projectId));
    const memberRows = projectRows.filter(row => projectIds.has(row.project.id));
    return {
      member,
      projects: memberProjects.length,
      overdueTasks: memberTasks.filter(task => isTaskOverdue(task, now)).length,
      pendingReviews: getPortfolioReviewQueues(memberTasks).waitingCount,
      atRiskProjects: memberRows.filter(row => row.health.health === 'atRisk').length,
    };
  }).sort((left, right) => right.atRiskProjects - left.atRiskProjects
    || right.overdueTasks - left.overdueTasks
    || left.member.name.localeCompare(right.member.name));

  return {
    activeProjects: projects.filter(project => projectStatus(project) === 'Active').length,
    completedProjects: projects.filter(project => projectStatus(project) === 'Completed' || projectStatus(project) === 'Closed').length,
    atRiskProjects: projectRows.filter(row => row.health.health === 'atRisk').length,
    overdueTasks: tasks.filter(task => isTaskOverdue(task, now)).length,
    pendingApprovals: getPortfolioReviewQueues(tasks).waitingCount,
    activeMonthlyPlans: activePlans.length,
    upcomingRenewals: renewalDates.filter(date => Boolean(date && !isBefore(date, today) && date <= renewalWindowEnd)).length,
    overdueRenewals: renewalDates.filter(date => Boolean(date && isBefore(date, today))).length,
    overdueDeliverables: overdueDeliverables.length,
    projectRows,
    projectManagers,
  };
};

export const getManagementAttentionItems = ({
  projects,
  tasks,
  deliverables,
  clientPlans,
  serviceCycles,
  now = new Date(),
  persona,
  userId,
}: ManagementIntelligenceInput & { persona: 'boss' | 'projectManager' | 'operation' | 'account' | 'production' | 'client'; userId?: string }) => {
  const today = startOfDay(now);
  const inThreeDays = endOfDay(addDays(today, 3));
  const items: ManagementAttentionItem[] = [];
  const seen = new Set<string>();
  const add = (item: ManagementAttentionItem) => {
    if (seen.has(item.id)) return;
    seen.add(item.id);
    items.push(item);
  };

  const visibleTasks = userId && persona === 'production'
    ? tasks.filter(task => task.assignedTo === userId)
    : userId && persona === 'client'
      ? tasks.filter(task => getClientTaskStage(task) === 'awaiting_review')
      : tasks;
  const projectRows = projects.map(project => ({ project, health: assessProjectHealth(project, tasks, now) }));
  const overdueDeliverables = getOverdueDeliverables(deliverables, serviceCycles, now);
  const cycleEndByIdMap = cycleEndById(serviceCycles);
  const activePlans = clientPlans.filter(plan => plan.status === 'Active');

  if (persona === 'boss' || persona === 'projectManager') {
    projectRows
      .filter(row => row.health.health === 'atRisk')
      .sort((left, right) => right.health.overdueCount - left.health.overdueCount)
      .forEach(row => add({
        id: `project-risk:${row.project.id}`,
        severity: 'critical',
        title: `${row.project.projectName} needs attention`,
        detail: `${row.health.overdueCount} overdue · ${row.health.openCount} open`,
        to: `/tasks?projectId=${encodeURIComponent(row.project.id)}`,
      }));
    getPortfolioReviewQueues(visibleTasks).internal.slice(0, 6).forEach(task => add({
      id: `review:${task.id}`,
      severity: 'attention',
      title: task.title,
      detail: `${task.clientName} · waiting for internal review`,
      to: `/tasks?taskId=${encodeURIComponent(task.id)}`,
      dueDate: task.dueDate,
    }));
    activePlans
      .map(plan => ({ plan, renewal: planRenewalDate(plan) }))
      .filter(item => Boolean(item.renewal && item.renewal <= inThreeDays))
      .sort((left, right) => (left.renewal?.getTime() || 0) - (right.renewal?.getTime() || 0))
      .forEach(({ plan, renewal }) => add({
        id: `renewal:${plan.id}`,
        severity: renewal && isBefore(renewal, today) ? 'critical' : 'attention',
        title: plan.clientName,
        detail: `${plan.name} · renewal ${renewal?.toISOString().slice(0, 10) || 'date missing'}`,
        to: `/clients/${encodeURIComponent(plan.clientId)}`,
        dueDate: planRenewalDate(plan)?.toISOString(),
      }));
    overdueDeliverables.forEach(deliverable => add({
      id: `deliverable:${deliverable.id}`,
      severity: 'critical',
      title: deliverable.title,
      detail: `${deliverable.clientName} · cycle ended`,
      to: `/clients/${encodeURIComponent(deliverable.clientId)}`,
      dueDate: cycleEndByIdMap.get(deliverable.cycleId)?.toISOString(),
    }));
  } else if (persona === 'client') {
    visibleTasks.slice(0, 8).forEach(task => add({
      id: `client-review:${task.id}`,
      severity: 'attention',
      title: task.title,
      detail: `${task.clientName} · ready for your review`,
      to: `/tasks?taskId=${encodeURIComponent(task.id)}`,
      dueDate: task.dueDate,
    }));
  } else {
    visibleTasks
      .filter(task => isTaskOpen(task) && (isTaskOverdue(task, now) || parseOptionalDate(task.dueDate) && parseOptionalDate(task.dueDate)! <= inThreeDays || task.revisionCount > 0 || task.workState?.blocker || task.status === 'Waiting Approval'))
      .sort((left, right) => Number(isTaskOverdue(right, now)) - Number(isTaskOverdue(left, now))
        || (parseOptionalDate(left.dueDate)?.getTime() || Number.MAX_SAFE_INTEGER) - (parseOptionalDate(right.dueDate)?.getTime() || Number.MAX_SAFE_INTEGER))
      .forEach(task => add({
        id: `task:${task.id}`,
        severity: isTaskOverdue(task, now) || task.workState?.blocker ? 'critical' : 'attention',
        title: task.title,
        detail: task.workState?.blocker ? 'Blocked work' : task.status === 'Waiting Approval' ? 'Waiting review' : task.revisionCount > 0 ? `Revision ${task.revisionCount}` : task.clientName,
        to: `/tasks?taskId=${encodeURIComponent(task.id)}`,
        dueDate: task.dueDate,
      }));
  }

  return items.slice(0, 8);
};

export const getMonthlyOperationalReport = ({
  month,
  projects,
  tasks,
  deliverables,
  clientPlans,
  serviceCycles,
  now = new Date(),
}: ManagementIntelligenceInput & { month: Date }) : MonthlyOperationalReport => {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const inMonth = (value?: string) => {
    const date = parseOptionalDate(value);
    return Boolean(date && isWithinInterval(date, { start: monthStart, end: monthEnd }));
  };
  const monthTasks = tasks.filter(task => {
    const due = parseOptionalDate(task.dueDate);
    const updated = parseOptionalDate(task.updatedAt);
    return Boolean((due && due <= monthEnd) || (updated && updated <= monthEnd));
  });
  const completedTasks = monthTasks.filter(task => isTaskCompleted(task) && inMonth(task.completedAt));
  const outstandingTasks = monthTasks.filter(task => isTaskOpen(task));
  const completedDeliverables = deliverables.filter(item => item.status === 'Delivered' && inMonth(item.deliveredAt));
  const reportDeliverables = deliverables.filter(item => {
    const cycle = serviceCycles.find(candidate => candidate.id === item.cycleId);
    return Boolean(cycle && (inMonth(cycle.periodStart) || inMonth(cycle.periodEnd)));
  });
  const pendingApprovals = getPortfolioReviewQueues(monthTasks).waitingCount;
  const renewals = clientPlans.filter(plan => inMonth(plan.nextCycleStart || plan.contractEndDate)).length;
  const projectRows = projects.map(project => {
    const projectTasks = monthTasks.filter(task => task.projectId === project.id);
    const projectDeliverables = reportDeliverables.filter(item => item.clientId === project.clientId);
    const projectOverdue = projectTasks.filter(task => isTaskOverdue(task, now)).length
      + getOverdueDeliverables(projectDeliverables, serviceCycles, now).length;
    const delayedMilestones = (project.milestones || []).filter(milestone => (
      inMonth(milestone.targetDate) && milestone.status !== 'Completed'
    )).length;
    return {
      project,
      completedTasks: projectTasks.filter(task => isTaskCompleted(task) && inMonth(task.completedAt)).length,
      outstandingTasks: projectTasks.filter(isTaskOpen).length,
      delayedMilestones,
      overdueItems: projectOverdue,
    };
  }).filter(row => row.completedTasks || row.outstandingTasks || row.delayedMilestones || row.overdueItems);

  return {
    monthStart,
    monthEnd,
    activeProjects: projects.filter(project => projectStatus(project) === 'Active').length,
    completedTasks: completedTasks.length,
    outstandingTasks: outstandingTasks.length,
    completedDeliverables: completedDeliverables.length,
    totalDeliverables: reportDeliverables.length,
    pendingApprovals,
    renewals,
    delayedMilestones: projectRows.reduce((sum, row) => sum + row.delayedMilestones, 0),
    overdueItems: projectRows.reduce((sum, row) => sum + row.overdueItems, 0),
    projectRows,
  };
};

export const getSharedEmployeeWorkload = (
  tasks: readonly Task[],
  users: readonly User[],
  now = new Date(),
) => users
  .filter(user => user.role !== 'Client' && !user.directoryOnly)
  .map(member => {
    const assigned = tasks.filter(task => task.assignedTo === member.id);
    const open = assigned.filter(isTaskOpen);
    const overdue = open.filter(task => isTaskOverdue(task, now));
    const dueSoon = open.filter(task => {
      const due = parseOptionalDate(task.dueDate);
      return Boolean(due && due >= startOfDay(now) && due <= endOfDay(addDays(now, 7)));
    });
    const projectIds = new Set(assigned.map(task => task.projectId).filter(Boolean));
    const signal = overdue.length > 0 || dueSoon.length >= 5 || open.length >= 12
      ? 'overloaded'
      : dueSoon.length >= 2 || open.length >= 6
        ? 'busy'
        : 'available';
    return { member, open: open.length, overdue: overdue.length, dueSoon: dueSoon.length, projects: projectIds.size, signal } as const;
  });

