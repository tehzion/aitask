import { describe, expect, it } from 'vitest';
import { createCommandBatch, runCommandBatch } from './secureCommandBatch';
import type { BaselineRow, SecureCommand, WorkspaceOperation } from './secureWorkspace';

const row = (entityType: string, entityId: string, data: Record<string, unknown>, version = 1) => ({
  entityType, entityId, parentId: null, version, data, serialized: JSON.stringify({ parentId: null, data }),
}) as unknown as BaselineRow;
const changedFields = (operation: WorkspaceOperation, current?: Record<string, unknown>) => {
  const next = (operation.data || {}) as Record<string, unknown>;
  return [...new Set([...Object.keys(next), ...Object.keys(current || {})])]
    .filter(key => JSON.stringify(next[key]) !== JSON.stringify(current?.[key]));
};

const linkBatch = (serverDeliverable: Record<string, unknown>) => {
  const task = { id: 't', clientId: 'co' };
  const deliverable = { id: 'd', clientId: 'co', cycleId: 'c', status: 'Planned', taskIds: [], title: 'Poster' };
  const baseline = new Map([['task:t', row('task', 't', task)], ['deliverable:d', row('deliverable', 'd', deliverable)]]);
  const commands: SecureCommand[] = [
    { id: '1', type: 'task.update', operations: [{ kind: 'entity', action: 'update', entityType: 'task', entityId: 't', expectedVersion: 1, data: { ...task, deliverableId: 'd', serviceCycleId: 'c' } } as WorkspaceOperation] },
    { id: '2', type: 'deliverable.manage', operations: [{ kind: 'entity', action: 'update', entityType: 'deliverable', entityId: 'd', expectedVersion: 1, data: { ...deliverable, status: 'In Progress', taskIds: ['t'] } } as WorkspaceOperation] },
  ];
  const sent: SecureCommand[] = [];
  const api = {
    isCurrent: () => true, superAdminOnlyEntityTypes: new Set<string>(), serviceCommandTypes: new Set(['deliverable.manage'] as const),
    changedFields, baseline, retain: () => undefined, complete: () => undefined,
    execute: async (command: SecureCommand) => { sent.push(structuredClone(command)); return { ok: true as const, data: { ok: true, workspaceVersion: sent.length + 1 }, commandId: command.id, workspaceVersion: sent.length + 1 }; },
    // The task trigger already re-derived the deliverable's progress.
    loadEntity: async () => ({ data: { entity_type: 'deliverable', entity_id: 'd', parent_id: null, data: serverDeliverable, version: 2, updated_at: '' } as never, error: null }),
    canonicalRows: (_collection: string, entity: { data: Record<string, unknown> }) => [row('deliverable', 'd', entity.data, 2)],
  };
  return { batch: createCommandBatch(commands, baseline, 1), api, sent };
};

describe('linking a task after its trigger re-derived the deliverable', () => {
  it('re-sends the link on the derived version instead of conflicting', async () => {
    const { batch, api, sent } = linkBatch({ id: 'd', clientId: 'co', cycleId: 'c', status: 'In Progress', taskIds: [], title: 'Poster' });
    expect((await runCommandBatch(batch, {}, api as never)).ok).toBe(true);
    expect(sent[1].operations[0]).toMatchObject({ expectedVersion: 2, data: { taskIds: ['t'], status: 'In Progress' } });
  });
  it('keeps the old version when another member changed more than progress', async () => {
    const { batch, api, sent } = linkBatch({ id: 'd', clientId: 'co', cycleId: 'c', status: 'In Progress', taskIds: [], title: 'Renamed' });
    await runCommandBatch(batch, {}, api as never);
    expect(sent[1].operations[0].expectedVersion).toBe(1);
  });
});
