import { describe, expect, it } from 'vitest';
import { isMergeableConflict } from './index';

const conflict = (local: string[], server?: string[]) => ({
  entityType: 'task', entityId: 't', expectedVersion: 1, actualVersion: 2,
  current: { id: 't' }, changedFields: local, serverChangedFields: server,
});

describe('automatic conflict resolution', () => {
  it('merges edits to different fields of the same record', () => {
    expect(isMergeableConflict(conflict(['dueDate', 'workHistory', 'updatedAt'], ['priority', 'workHistory', 'updatedAt']))).toBe(true);
  });
  it('asks the user when both people changed the same field', () => {
    expect(isMergeableConflict(conflict(['dueDate'], ['dueDate']))).toBe(false);
  });
  it('asks the user when it cannot tell what the other person changed', () => {
    expect(isMergeableConflict(conflict(['dueDate']))).toBe(false);
    expect(isMergeableConflict({ ...conflict(['dueDate'], ['priority']), current: undefined })).toBe(false);
  });
  it('never auto-merges a workspace-level conflict', () => {
    expect(isMergeableConflict({ ...conflict(['dueDate'], ['priority']), entityType: 'workspace' })).toBe(false);
  });
});
