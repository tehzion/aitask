import type { ClientServicePlan, Task } from '../types';
import { getContractDaysRemaining } from './dashboardData';
import { getTaskBlockers } from './staffWorkspace';
import { isTaskOpen } from './taskReporting';
import { getTodayInputDate } from './utils';

// The caller supplies its queue scope and all permission-visible dependency tasks.
export const getStaffDashboardMetrics = (
  tasks: Task[],
  visibleTasks: Task[],
  plans: ClientServicePlan[],
  today: Date,
) => {
  const todayKey = getTodayInputDate(today);
  const clientKeys = new Set(tasks.map(task => task.clientName.trim().toLowerCase()).filter(Boolean));
  const activePlans = plans.filter(plan => plan.status === 'Active' && clientKeys.has(plan.clientName.trim().toLowerCase()));
  return {
    blockedCount: tasks.filter(task => getTaskBlockers(task, visibleTasks).length > 0).length,
    assignedClientCount: clientKeys.size,
    activePlanCount: activePlans.length,
    renewals: activePlans.filter(plan => {
      const days = getContractDaysRemaining(plan.contractEndDate, today);
      return days !== null && days >= 0 && days <= 30;
    }).length,
    linkedOutputs: new Set(tasks.filter(task => task.status !== 'Cancelled').map(task => task.deliverableId).filter(Boolean)).size,
    dueToday: tasks.filter(task => isTaskOpen(task) && task.dueDate === todayKey).length,
    waitingReview: tasks.filter(task => isTaskOpen(task) && task.status === 'Waiting Approval').length,
    revisions: tasks.filter(task => isTaskOpen(task) && task.revisionCount > 0).length,
  };
};
