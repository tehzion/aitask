import type { Deliverable, Task } from '../types';

export const isTaskLinkedToDeliverable = (task: Pick<Task, 'id' | 'deliverableId'>, deliverables: readonly Deliverable[]) =>
  Boolean(task.deliverableId || deliverables.some(item => item.taskIds?.includes(task.id)));

export const hasInvalidDeliveryLink = (task: Pick<Task, 'id' | 'clientId' | 'deliverableId' | 'serviceCycleId'>, deliverables: readonly Deliverable[]) => {
  const links = deliverables.filter(item => item.id === task.deliverableId || item.taskIds?.includes(task.id));
  return Boolean((task.deliverableId && !links.some(item => item.id === task.deliverableId))
    || links.length > 1 || links.some(item => item.clientId !== task.clientId
      || (task.serviceCycleId && item.cycleId !== task.serviceCycleId)));
};

/**
 * The shared client/cycle/delivered/single-link rules for attaching a task to a
 * deliverable, used by task creation, task editing, and the explicit linker so
 * every path enforces the same boundary. Returns an error string, or undefined
 * when the link is valid. Callers layer their own reopen/unlink rules on top.
 */
export const deliverableLinkError = (
  task: Pick<Task, 'id' | 'clientId' | 'deliverableId' | 'serviceCycleId'>,
  deliverable: Deliverable | undefined,
  deliverables: readonly Deliverable[],
): string | undefined => {
  if (!deliverable) return 'Choose a deliverable from this client and cycle.';
  if (deliverable.clientId !== task.clientId || deliverable.cycleId !== task.serviceCycleId) {
    return 'The task and deliverable must belong to the same client and cycle.';
  }
  if (deliverable.status === 'Delivered' && !deliverable.taskIds?.includes(task.id)) {
    return 'Reopen the delivery before adding task links.';
  }
  if (deliverables.some(item => item.id !== deliverable.id && item.taskIds?.includes(task.id))) {
    return 'This task is already linked to another deliverable.';
  }
  return undefined;
};
