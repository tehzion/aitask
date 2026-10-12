import type { Deliverable, Task } from '../types';

export const isTaskLinkedToDeliverable = (task: Pick<Task, 'id' | 'deliverableId'>, deliverables: readonly Deliverable[]) =>
  Boolean(task.deliverableId || deliverables.some(item => item.taskIds?.includes(task.id)));

export const hasInvalidDeliveryLink = (task: Pick<Task, 'id' | 'clientId' | 'deliverableId' | 'serviceCycleId'>, deliverables: readonly Deliverable[]) => {
  const links = deliverables.filter(item => item.id === task.deliverableId || item.taskIds?.includes(task.id));
  return Boolean((task.deliverableId && !links.some(item => item.id === task.deliverableId))
    || links.length > 1 || links.some(item => item.clientId !== task.clientId
      || (task.serviceCycleId && item.cycleId !== task.serviceCycleId)));
};
