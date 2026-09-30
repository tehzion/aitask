import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('./supabaseClient', () => ({ supabase: { from: mocks.from, rpc: mocks.rpc, auth: { refreshSession: vi.fn() } }, shouldUseSecureSupabase: () => true }));
import { buildOperations, loadSecureWorkspace } from './secureWorkspace';
import { invalidateWorkspaceSession } from './workspaceSession';
const authId = '00000000-0000-4000-8000-000000000001';
const member = { id: 'loading-admin', workspace_id: 'aitask-main', auth_user_id: authId, name: 'Loading Admin', email: 'admin@example.com', role: 'Project Manager', departments: ['Management'], department: 'Management', is_super_admin: true, version: 1, updated_at: '2026-09-30T00:00:00Z' };
const entities = Array.from({ length: 501 }, (_, index) => ({ workspace_id: 'aitask-main', entity_type: 'task', entity_id: `task-${String(index).padStart(3, '0')}`, parent_id: null, version: 1, updated_at: '2026-09-30T00:00:00Z', data: { id: `task-${String(index).padStart(3, '0')}`, title: `Task ${index}`, clientName: 'Client', serviceType: 'Design', department: 'Designer', assignedTo: '', createdBy: member.id, startDate: '2026-09-01', dueDate: '2026-09-30', priority: 'Medium', status: 'Pending' } }));
let revisions: number[];
let reads: number;
let memberReads: number;
let stalled: boolean;
const signals: AbortSignal[] = [];
beforeEach(() => {
  invalidateWorkspaceSession(); vi.useRealTimers(); revisions = [1, 1, 1]; reads = 0; memberReads = 0; stalled = false; signals.length = 0;
  mocks.rpc.mockReset(); mocks.from.mockReset();
  mocks.rpc.mockResolvedValue({ data: { ok: true, memberId: member.id, items: [], unreadCount: 0 }, error: null });
  mocks.from.mockImplementation((table: string) => {
    const query: Record<string, (...args: never[]) => unknown> = {};
    for (const method of ['select', 'eq', 'neq', 'order']) query[method] = () => query;
    query.abortSignal = (signal: AbortSignal) => { signals.push(signal); return query; };
    query.single = () => Promise.resolve({ data: { version: revisions.shift() || 1, updated_at: '2026-09-30T00:00:00Z', sync_protocol_version: 1 }, error: null });
    query.range = (from: number, to: number) => {
      if (table === 'aitask_members') { memberReads += 1; return Promise.resolve({ data: [member], error: null }); }
      reads += 1;
      if (stalled) return new Promise(() => undefined);
      return Promise.resolve({ data: entities.slice(from, to + 1), error: null });
    };
    return query;
  });
});
afterEach(() => vi.useRealTimers());
describe('consistent cancellable workspace paging', () => {
  it('loads more than one page without dropping or duplicating rows', async () => {
    const loaded = await loadSecureWorkspace({ id: authId } as never);
    expect(loaded.state.tasks).toHaveLength(501);
    expect(new Set(loaded.state.tasks.map(task => task.id)).size).toBe(501);
    expect(reads).toBe(2);
    expect(buildOperations(loaded.state)).toEqual([]);
  });
  it('retries a workspace whose revision changed during reading', async () => {
    revisions = [1, 1, 2, 2, 2, 2];
    const loaded = await loadSecureWorkspace({ id: authId } as never);
    expect(loaded.revision.version).toBe(2);
    expect(reads).toBe(4);
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
    await vi.waitFor(() => expect(reads).toBe(1));
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
