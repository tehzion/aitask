import { describe, expect, it } from 'vitest';
import type { WorkspaceOperation } from './secureWorkspace';
import { withoutTaskCascadeNotificationDeletes } from './secureTaskDelete';

const operation = (entityType: string, entityId: string, action: WorkspaceOperation['action'] = 'delete'): WorkspaceOperation => ({
  kind: 'entity', entityType, entityId, action, expectedVersion: 1,
});
const baseline = new Map([
  ['notification:linked', { data: { route: { page: 'tasks', entityId: 'owned-task' } } }],
  ['notification:foreign', { data: { route: { page: 'tasks', entityId: 'other-task' } } }],
  ['notification:project', { data: { route: { page: 'projects', entityId: 'owned-task' } } }],
]);

describe('task notification cleanup commands', () => {
  it('sends the authorized task deletion without an unauthorized notice deletion', () => {
    expect(withoutTaskCascadeNotificationDeletes([operation('task', 'owned-task'), operation('notification', 'linked')], baseline))
      .toEqual([operation('task', 'owned-task')]);
  });
  it('does not suppress unrelated notification deletions or other routes', () => {
    const operations = [operation('task', 'owned-task'), operation('notification', 'foreign'), operation('notification', 'project')];
    expect(withoutTaskCascadeNotificationDeletes(operations, baseline)).toEqual(operations);
  });
  it('does not treat a task update as a deletion', () => {
    const operations = [operation('task', 'owned-task', 'update'), operation('notification', 'linked')];
    expect(withoutTaskCascadeNotificationDeletes(operations, baseline)).toEqual(operations);
  });
  it('preserves notification inserts, read updates, and unknown notices', () => {
    const operations = [operation('task', 'owned-task'), operation('notification', 'linked', 'insert'), operation('notification', 'linked', 'update'), operation('notification', 'unknown')];
    expect(withoutTaskCascadeNotificationDeletes(operations, baseline)).toEqual(operations);
  });
});
