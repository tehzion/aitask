import type { ClientProfile, ClientServicePlan, Task } from '../types';
import { getContractDaysRemaining } from './dashboardData';
import { getTaskBlockers, getUnavailableTaskDependencyCount } from './staffWorkspace';
import { isTaskOpen } from './taskReporting';
import { getTodayInputDate } from './utils';

// The caller supplies its queue scope and all permission-visible dependency tasks.
export const getStaffDashboardMetrics = (
  tasks: Task[],
  visibleTasks: Task[],
  plans: ClientServicePlan[],
  today: Date,
  clients: Pick<ClientProfile, 'id' | 'clientName'>[] = [],
) => {
  const todayKey = getTodayInputDate(today);
  // IDs survive renames. Resolve name-only legacy records only when that name
  // identifies one company across the supplied profiles and work records.
  const idsByName = new Map<string, Set<string>>();
  const identityRecords = [...clients.map(client => ({ clientId: client.id, clientName: client.clientName })), ...tasks, ...plans];
  for (const record of identityRecords) {
    const name = record.clientName.trim().toLowerCase();
    if (!record.clientId || !name) continue;
    const ids = idsByName.get(name) || new Set<string>();
    ids.add(record.clientId);
    idsByName.set(name, ids);
  }
  const getClientKey = (record: { clientId?: string; clientName: string }) => {
    if (record.clientId) return `id:${record.clientId}`;
    const name = record.clientName.trim().toLowerCase();
    if (!name) return undefined;
    const ids = idsByName.get(name);
    return ids?.size === 1 ? `id:${[...ids][0]}` : `name:${name}`;
  };
  const clientKeys = new Set(tasks.map(getClientKey).filter((key): key is string => Boolean(key)));
  const activePlans = plans.filter(plan => {
    // A legacy assignment may still be counted by name, but an ambiguous
    // name cannot establish that an ID-less plan belongs to that company.
    if (!plan.clientId && (idsByName.get(plan.clientName.trim().toLowerCase())?.size || 0) > 1) return false;
    const key = getClientKey(plan);
    return plan.status === 'Active' && key !== undefined && clientKeys.has(key);
  });
  return {
    blockedCount: tasks.filter(task => getTaskBlockers(task, visibleTasks).length > 0).length,
    unavailableDependencyTaskCount: tasks.filter(task => getUnavailableTaskDependencyCount(task, visibleTasks) > 0).length,
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
