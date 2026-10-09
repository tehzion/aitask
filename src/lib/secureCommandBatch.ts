import type { BaselineRow, BuildOperationsOptions, CommandResponse, EntityRow, MutationResult, PendingCommandBatch, SecureCommand, SecureCommandType, WorkspaceOperation } from './secureWorkspace';
const entityKey = (type: string, id: string) => `${type}:${id}`;
const stable = (value: unknown) => JSON.stringify(value);
type BatchApi = {
  isCurrent: () => boolean;
  superAdminOnlyEntityTypes: Set<string>;
  serviceCommandTypes: Set<SecureCommandType>;
  changedFields: (operation: WorkspaceOperation, current?: Record<string, unknown>) => string[];
  baseline: Map<string, BaselineRow>;
  retain: (command: SecureCommand) => void;
  complete: () => void;
  execute: (command: SecureCommand, version?: number) => Promise<MutationResult<CommandResponse>>;
  loadEntity: (operation: WorkspaceOperation) => Promise<{ data: EntityRow | null; error: unknown }>;
  canonicalRows: (collection: string, row: EntityRow) => BaselineRow[];
};

export const createCommandBatch = (commands: SecureCommand[], baseline: Map<string, BaselineRow>, workspaceVersion?: number): PendingCommandBatch => {
  const keys = new Set(commands.flatMap(command => command.operations).map(operation => entityKey(operation.entityType, operation.entityId)));
  for (const operation of commands.flatMap(command => command.operations).filter(operation => operation.entityType === 'task')) {
    for (const task of [baseline.get(entityKey('task', operation.entityId))?.data, operation.data]) {
      if (typeof task?.deliverableId === 'string') keys.add(entityKey('deliverable', task.deliverableId));
      if (typeof task?.serviceCycleId === 'string') keys.add(entityKey('service_cycle', task.serviceCycleId));
    }
  }
  for (const key of [...keys]) {
    const row = baseline.get(key);
    if (row?.entityType === 'deliverable' && typeof row.data.cycleId === 'string') keys.add(entityKey('service_cycle', row.data.cycleId));
  }
  return { commands, before: structuredClone([...keys].map(key => baseline.get(key)).filter((row): row is BaselineRow => Boolean(row))), cursor: 0, workspaceVersion, attempted: false };
};

// Mutation-only work is loaded on demand; the retained intent stays in the eager adapter.
export const runCommandBatch = async (batch: PendingCommandBatch, options: BuildOperationsOptions, api: BatchApi): Promise<MutationResult<CommandResponse>> => {
  try {
  const original = new Map(batch.before.map(row => [entityKey(row.entityType, row.entityId), row]));
  const pendingOperations = batch.commands.flatMap(command => command.operations);
  let lastResult: MutationResult<CommandResponse> | null = null;
  let version = batch.workspaceVersion;
  // Task triggers already persist derived delivery progress. A later service
  // group must compare that result before sending the old row version again.
  const touchedDeliverables = new Set<string>();
  const touchedCycles = new Set<string>();
  pendingOperations.filter(operation => operation.entityType === 'task').forEach(operation => {
    const previous = original.get(entityKey('task', operation.entityId))?.data;
    for (const task of [previous, operation.data]) {
      if (typeof task?.deliverableId === 'string') touchedDeliverables.add(task.deliverableId);
      if (typeof task?.serviceCycleId === 'string') touchedCycles.add(task.serviceCycleId);
    }
  });
  touchedDeliverables.forEach(id => {
    const cycleId = original.get(entityKey('deliverable', id))?.data.cycleId;
    if (typeof cycleId === 'string') touchedCycles.add(cycleId);
  });

  while (batch.cursor < batch.commands.length) {
    const group = batch.commands[batch.cursor];
    if (!api.isCurrent()) return { ok: false, code: 'FORBIDDEN', error: 'Your session changed. Sign in again.' };
    let pendingOperations = group.operations;
    if (options.excludeSuperAdminEntities && pendingOperations.some(operation => api.superAdminOnlyEntityTypes.has(operation.entityType)
      || (operation.entityType === 'member' && operation.entityId !== options.actorMemberId))) {
      return { ok: false, code: 'FORBIDDEN', error: 'This action is not allowed for your account.' };
    }
    if (options.excludedEntityTypes && pendingOperations.some(operation => options.excludedEntityTypes?.has(operation.entityType))) {
      return { ok: false, code: 'FORBIDDEN', error: 'This action is not allowed for your account.' };
    }
    if (!batch.attempted && batch.cursor > 0 && !api.serviceCommandTypes.has(batch.commands[0].type)) {
      const reconciled: WorkspaceOperation[] = [];
      for (const operation of pendingOperations) {
        const touched = operation.entityType === 'deliverable'
          ? touchedDeliverables.has(operation.entityId)
          : operation.entityType === 'service_cycle' && touchedCycles.has(operation.entityId);
        const previous = original.get(entityKey(operation.entityType, operation.entityId));
        const fields = operation.entityType === 'deliverable'
          ? new Set(['status', 'deliveredAt', 'updatedAt'])
          : new Set(['status', 'updatedAt']);
        const localFields = previous ? api.changedFields(operation, previous.data) : [];
        if (!touched || operation.action !== 'update' || !previous || !operation.data
          || !localFields.every(field => fields.has(field))) {
          reconciled.push(operation);
          continue;
        }
        const query = await api.loadEntity(operation);
        if (!api.isCurrent()) return { ok: false, code: 'FORBIDDEN', error: 'Your session changed. Sign in again.' };
        if (query.error || !query.data) {
          reconciled.push(operation);
          continue;
        }
        const row = query.data as EntityRow;
        const collection = operation.entityType === 'deliverable' ? 'deliverables' : 'serviceCycles';
        const canonical = api.canonicalRows(collection, row).find(item => item.entityType === operation.entityType && item.entityId === operation.entityId);
        if (!canonical || canonical.data.status !== operation.data.status
          || !api.changedFields({ ...operation, data: canonical.data }, previous.data)
          .every(field => fields.has(field))) {
          // Another member changed more than derived progress: keep the old
          // version so the ordinary conflict review protects their changes.
          reconciled.push(operation);
          continue;
        }
        const remainingFields = api.changedFields(operation, canonical.data).filter(field => field !== 'updatedAt');
        if (remainingFields.length === 0) {
          api.baseline.set(entityKey(operation.entityType, operation.entityId), {
            ...canonical, data: operation.data,
            serialized: stable({ parentId: operation.parentId || null, data: operation.data }),
          });
        } else if (remainingFields.every(field => field === 'deliveredAt')
          && stable(canonical.data.deliveredAt) === stable(previous.data.deliveredAt)) {
          reconciled.push({ ...operation, expectedVersion: Number(row.version) });
        } else {
          reconciled.push(operation);
        }
      }
      pendingOperations = reconciled;
    }
    if (pendingOperations.length > 0) {
      group.operations = pendingOperations;
      batch.attempted = true;
      api.retain(group);
      const result = await api.execute(group, version);
      if (!api.isCurrent()) return { ok: false, code: 'FORBIDDEN', error: 'Your session changed. Sign in again.' };
      if (result.ok === false) {
        if (batch.commands.length === 1 && !['OFFLINE', 'CONFLICT', 'RETRY_REQUIRED'].includes(result.code)) {
          api.complete();
        } else api.retain(group);
        return result;
      }
      lastResult = result;
      version = result.workspaceVersion;
      const deleted = new Set((result.data.deleted || []).map(item => entityKey(item.entityType, item.entityId)));
      const following = batch.commands.slice(batch.cursor + 1).map(next => ({ ...next,
        operations: next.operations.filter(operation => !deleted.has(entityKey(operation.entityType, operation.entityId))),
      })).filter(next => next.operations.length > 0);
      batch.commands.splice(batch.cursor + 1, batch.commands.length, ...following);
    }
    batch.cursor += 1;
    batch.attempted = false;
    batch.workspaceVersion = version;
    while (batch.cursor < batch.commands.length && batch.commands[batch.cursor].operations.length === 0) batch.cursor += 1;
    if (batch.cursor < batch.commands.length) api.retain(batch.commands[batch.cursor]);
  }
  api.complete();
  return lastResult ?? {
    ok: true,
    data: { ok: true, workspaceVersion: version ?? 1 },
    commandId: crypto.randomUUID(),
    workspaceVersion: version ?? 1,
  };
  } catch {
    if (!api.isCurrent()) return { ok: false, code: 'FORBIDDEN', error: 'Your session changed. Sign in again.' };
    if (batch.commands[batch.cursor]) api.retain(batch.commands[batch.cursor]);
    return { ok: false, code: 'RETRY_REQUIRED', error: 'Supabase could not be reached. Your change is retained for retry.' };
  }
};
