import { BACKEND_UPGRADE_REQUIRED_MESSAGE } from './secureWorkspace';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('./supabaseClient', () => ({ supabase: { from: mocks.from, rpc: mocks.rpc, auth: { refreshSession: vi.fn() } }, shouldUseSecureSupabase: () => true }));
import { buildOperations, loadSecureWorkspace, WORKSPACE_ENTITY_TYPES } from './secureWorkspace';
import { invalidateWorkspaceSession } from './workspaceSession';
const authId = '00000000-0000-4000-8000-000000000001';
const member = { id: 'loading-admin', workspace_id: 'aitask-main', auth_user_id: authId, name: 'Loading Admin', email: 'admin@example.com', role: 'Project Manager', departments: ['Management'], department: 'Management', is_super_admin: true, version: 1, updated_at: '2026-09-30T00:00:00Z' };
const entities = Array.from({ length: 501 }, (_, index) => ({ workspace_id: 'aitask-main', entity_type: 'task', entity_id: `task-${String(index).padStart(3, '0')}`, parent_id: null, version: 1, updated_at: '2026-09-30T00:00:00Z', data: { id: `task-${String(index).padStart(3, '0')}`, title: `Task ${index}`, clientName: 'Client', serviceType: 'Design', department: 'Designer', assignedTo: '', createdBy: member.id, startDate: '2026-09-01', dueDate: '2026-09-30', priority: 'Medium', status: 'Pending' } }));
let revisions: number[];
let reads: number;
let memberReads: number;
let stalled: boolean;
const signals: AbortSignal[] = [];
const entityFilters: string[] = [];
beforeEach(() => {
  invalidateWorkspaceSession(); vi.useRealTimers(); revisions = [1, 1, 1]; reads = 0; memberReads = 0; stalled = false; signals.length = 0; entityFilters.length = 0;
  mocks.rpc.mockReset(); mocks.from.mockReset();
  mocks.rpc.mockResolvedValue({ data: { ok: true, memberId: member.id, tasks: [], items: [], unreadCount: 0 }, error: null });
  mocks.from.mockImplementation((table: string) => {
    const query: Record<string, (...args: never[]) => unknown> = {};
    let entityType: string | undefined;
    for (const method of ['select', 'neq', 'order']) query[method] = () => query;
    query.eq = (column: string, value: string) => {
      if (column === 'entity_type') { entityType = value; entityFilters.push(value); }
      return query;
    };
    query.abortSignal = (signal: AbortSignal) => { signals.push(signal); return query; };
    query.single = () => Promise.resolve({ data: { version: revisions.shift() || 1, updated_at: '2026-09-30T00:00:00Z', sync_protocol_version: 1 }, error: null });
    query.range = (from: number, to: number) => {
      if (table === 'aitask_members') { memberReads += 1; return Promise.resolve({ data: [member], error: null }); }
      reads += 1;
      if (stalled) return new Promise(() => undefined);
      return Promise.resolve({ data: entities.filter(row => row.entity_type === entityType).slice(from, to + 1), error: null });
    };
    return query;
  });
});
afterEach(() => vi.useRealTimers());
describe('consistent cancellable workspace paging', () => {
  it('hydrates canonical review context without staging server-owned metadata', async () => {
    const data = entities[0].data as Record<string, unknown>;
    data.generatedFromDeliverable = true;
    data.workflowStepId = 'review-step';
    try {
      mocks.rpc.mockImplementation(async (name: string) => ({ data: name === 'aitask_get_workflow_task_context' ? { ok: true, tasks: [{ id: entities[0].entity_id, workflowStepKind: 'internal_review', workflowOutputVersion: 4, workflowDependenciesReady: true, internalReview: { decisionId: 'canonical-decision', reviewedBy: member.id, reviewedAt: '2026-10-13T01:00:00Z', inputVersions: [{ taskId: 'hidden-task', outputVersion: 5 }] } }] } : { ok: true, memberId: member.id, tasks: [], items: [], unreadCount: 0 }, error: null }));
      const loaded = await loadSecureWorkspace({ id: authId } as never);
      expect(loaded.state.tasks[0]).toMatchObject({ workflowStepKind: 'internal_review', workflowOutputVersion: 4, workflowDependenciesReady: true, internalReview: { reviewedBy: member.id } });
      expect(buildOperations(loaded.state)).toEqual([]);
      const approvalDraft = { ...loaded.state, tasks: loaded.state.tasks.map((task, index) => index ? task : { ...task, internalReview: { ...task.internalReview!, decisionId: undefined } }) };
      const signOff = buildOperations(approvalDraft);
      expect(signOff).toHaveLength(1);
      expect(signOff[0]).toMatchObject({ action: 'update', entityId: entities[0].entity_id });
      expect(signOff[0].data).not.toHaveProperty('internalReview');
      const changed = { ...loaded.state, tasks: loaded.state.tasks.map((task, index) => index ? task : { ...task, status: 'Completed', isCompleted: true }) };
      const operation = buildOperations(changed).find(item => item.entityId === entities[0].entity_id)!;
      expect(operation.data).not.toHaveProperty('internalReview');
      expect(operation.data).not.toHaveProperty('workflowStepKind');
      expect(operation.data).not.toHaveProperty('workflowOutputVersion');
      expect(operation.data).not.toHaveProperty('workflowDependenciesReady');
    } finally { delete data.generatedFromDeliverable; delete data.workflowStepId; }
  });
  it('loads more than one page without dropping or duplicating rows', async () => {
    const loaded = await loadSecureWorkspace({ id: authId } as never);
    expect(loaded.state.tasks).toHaveLength(501);
    expect(new Set(loaded.state.tasks.map(task => task.id)).size).toBe(501);
    expect(reads).toBe(WORKSPACE_ENTITY_TYPES.length + 1);
    expect(new Set(entityFilters)).toEqual(new Set(WORKSPACE_ENTITY_TYPES));
    expect(entityFilters).not.toContain('notification');
    expect(buildOperations(loaded.state)).toEqual([]);
  });
  it('keeps original row versions when a local edit supersedes a refresh', async () => {
    const original = await loadSecureWorkspace({ id: authId } as never);
    const row = entities[0];
    const originalTitle = row.data.title;
    try {
      row.version = 2; row.data.title = 'Concurrent remote edit';
      await loadSecureWorkspace({ id: authId } as never, { preserveRetainedCommand: true, shouldApplySnapshot: () => false });
      const edited = { ...original.state, tasks: original.state.tasks.map((task, index) => index ? task : { ...task, title: 'Local draft' }) };
      const operations = buildOperations(edited);
      expect(operations).toHaveLength(1);
      expect(operations[0]).toMatchObject({ action: 'update', entityId: row.entity_id, expectedVersion: 1, data: { title: 'Local draft' } });
    } finally { row.version = 1; row.data.title = originalTitle; }
  });
  it('rejects missing canonical context rather than trusting old review metadata', async () => {
    const data = entities[0].data as Record<string, unknown>;
    data.generatedFromDeliverable = true;
    data.workflowStepId = 'review-step';
    data.internalReview = { reviewedBy: member.id, reviewedAt: '2026-10-13T01:00:00Z', inputVersions: [] };
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === 'aitask_get_workflow_task_context' ? { ok: true, tasks: [] } : { ok: true, memberId: member.id, tasks: [], items: [], unreadCount: 0 }, error: null }));
    try {
      await expect(loadSecureWorkspace({ id: authId } as never)).rejects.toThrow(BACKEND_UPGRADE_REQUIRED_MESSAGE);
    } finally { delete data.generatedFromDeliverable; delete data.workflowStepId; delete data.internalReview; }
  });
  it('retries a workspace whose revision changed during reading', async () => {
    revisions = [1, 1, 2, 2, 2, 2];
    const loaded = await loadSecureWorkspace({ id: authId } as never);
    expect(loaded.revision.version).toBe(2);
    expect(reads).toBe((WORKSPACE_ENTITY_TYPES.length + 1) * 2);
    expect(memberReads).toBe(2);
  });
  it('stops after two consistency retries and offers a recoverable error', async () => {
    revisions = [1, 1, 2, 2, 2, 3, 3, 3, 4];
    await expect(loadSecureWorkspace({ id: authId } as never)).rejects.toThrow('Workspace changed during loading. Please retry.');
    expect(memberReads).toBe(3);
  });
  it('cancels page requests immediately on sign-out', async () => {
    stalled = true;
    const request = loadSecureWorkspace({ id: authId } as never);
    const rejection = expect(request).rejects.toThrow('Workspace session changed.');
    await vi.waitFor(() => expect(reads).toBe(3));
    invalidateWorkspaceSession();
    await rejection;
    expect(signals.at(-1)?.aborted).toBe(true);
  });
  it('bounds stalled page reads and aborts their transport', async () => {
    vi.useFakeTimers(); stalled = true;
    const request = loadSecureWorkspace({ id: authId } as never);
    const rejection = expect(request).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(20_001);
    await rejection;
    expect(signals.some(signal => signal.aborted)).toBe(true);
  });
  it('bounds the entire load even when individual pages keep arriving below their timeout', async () => {
    vi.useFakeTimers();
    const original = mocks.from.getMockImplementation()!;
    mocks.from.mockImplementation((table: string) => {
      const query = original(table);
      if (table === 'aitask_entities') query.range = () => new Promise(resolve => setTimeout(() => resolve({ data: entities.slice(0, 500), error: null }), 15000));
      return query;
    });
    const request = loadSecureWorkspace({ id: authId } as never);
    const rejection = expect(request).rejects.toThrow('Workspace loading timed out. Please retry.');
    await vi.advanceTimersByTimeAsync(90001); await rejection;
    expect(signals.some(signal => signal.aborted)).toBe(true);
  });

});
