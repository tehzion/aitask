import type { BaselineRow, WorkspaceOperation } from './secureWorkspace';

/** PostgreSQL cleans these notices after authorizing the task deletion. */
export const withoutTaskCascadeNotificationDeletes = (
  operations: WorkspaceOperation[],
  baseline: ReadonlyMap<string, Pick<BaselineRow, 'data'>>,
): WorkspaceOperation[] => {
  const deletedTasks = new Set(operations
    .filter(operation => operation.entityType === 'task' && operation.action === 'delete')
    .map(operation => operation.entityId));
  return operations.filter(operation => {
    if (operation.entityType !== 'notification' || operation.action !== 'delete') return true;
    const route = baseline.get(`notification:${operation.entityId}`)?.data.route;
    return !route || typeof route !== 'object'
      || (route as Record<string, unknown>).page !== 'tasks'
      || !deletedTasks.has(String((route as Record<string, unknown>).entityId));
  });
};
