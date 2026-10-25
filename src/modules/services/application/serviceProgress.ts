import { prepareWorkflowTasks } from '../../../shared/rules/workflowReview';
import {
  type Deliverable,
  type ServiceCycle,
  type ServiceCycleStatus,
  type Task
} from '../../../shared/types/index';
import { type StoreState } from '../../../shared/types/workspaceStore';
import {
  resolveDeliverableStatus
} from '../domain/serviceManagement';
export const allowedServiceCycleTransitions: Record<ServiceCycleStatus, readonly ServiceCycleStatus[]> = {
  Draft: ['Published', 'Cancelled'],
  Published: ['Completed', 'Cancelled'],
  Completed: [],
  Cancelled: [],
};

export const deriveServiceProgress = (state: StoreState, tasks: Task[], deliverables: Deliverable[], cycles: ServiceCycle[]) => {
  tasks = prepareWorkflowTasks(tasks, state.tasks, state.currentUser, cycles, deliverables, state.backend.mode !== 'supabase', state.rolePermissions, { users: state.users, clients: state.clients, projects: state.projects });
  // Keep canonical progress when this actor cannot see the complete task list.
  // Complete snapshots still derive paired link/progress writes together.
  const visibleTaskIds = new Set(tasks.map(task => task.id));
  const partialDeliverables = new Set(state.backend.mode === 'supabase'
    ? deliverables.filter(item => item.taskIds.some(id => !visibleTaskIds.has(id))).map(item => item.id)
    : []);
  const now = new Date().toISOString();
  const nextDeliverables = deliverables.map(deliverable => {
    if (partialDeliverables.has(deliverable.id)) return deliverable;
    const status = resolveDeliverableStatus(deliverable, tasks, cycles);
    if (status === deliverable.status) return deliverable;
    return {
      ...deliverable,
      status,
      deliveredAt: status === 'Delivered' ? deliverable.deliveredAt || now : undefined,
      updatedAt: now,
    };
  });
  const nextCycles = cycles.map(cycle => {
    if (!['Published', 'Completed'].includes(cycle.status)) return cycle;
    const cycleDeliverables = nextDeliverables.filter(item => item.cycleId === cycle.id);
    if (cycleDeliverables.some(item => partialDeliverables.has(item.id))) return cycle;
    const completed = cycleDeliverables.length > 0 && cycleDeliverables.every(item => item.status === 'Delivered');
    const status: ServiceCycleStatus = completed ? 'Completed' : cycle.status === 'Completed' ? 'Published' : cycle.status;
    return status === cycle.status ? cycle : { ...cycle, status, updatedAt: now };
  });
  return { tasks, deliverables: nextDeliverables, serviceCycles: nextCycles };
};
