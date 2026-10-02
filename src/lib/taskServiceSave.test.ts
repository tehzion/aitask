import { afterEach, describe, expect, it, vi } from 'vitest';
const { rpc, from } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock('./supabaseClient', () => ({ supabase: { rpc, from, auth: { refreshSession: vi.fn() } } }));
import { buildOperations, discardSecureWorkspaceCommand, loadSecureWorkspace, saveSecureWorkspace } from './secureWorkspace';

const stamp = '2026-10-01T00:00:00.000Z';
const member = { id: 'staff', workspace_id: 'aitask-main', auth_user_id: 'auth-staff', name: 'Staff', role: 'Staff', department: 'Designer', departments: ['Designer'], permissions: {}, version: 1, updated_at: stamp };
const delivery = { id: 'delivery', clientId: 'client', clientName: 'Company', planId: 'plan', cycleId: 'cycle', serviceItemId: 'item', sequence: 1, title: 'Artwork', status: 'Planned', taskIds: ['task'], attachments: [], createdAt: stamp, updatedAt: stamp };
const cycle = { id: 'cycle', clientId: 'client', clientName: 'Company', planId: 'plan', planRevision: 1, status: 'Published', publishedAt: stamp, periodStart: '2026-10-01', periodEnd: '2026-10-31', currency: 'MYR', serviceItems: [], addonSnapshots: [], discountType: 'none', discountValue: 0, taxRateBps: 0, createdAt: stamp, updatedAt: stamp };
const task = { id: 'task', clientName: 'Company', title: 'Work', serviceType: 'Design', department: 'Designer', assignedTo: 'staff', createdBy: 'pm', startDate: '2026-10-01', dueDate: '', priority: 'Medium', status: 'Pending', deliverableId: 'delivery', serviceCycleId: 'cycle', completionPercentage: 0, isCompleted: false, revisionCount: 0, clientApprovalStatus: 'Pending', isRecurring: false, recurrenceFrequency: 'None' };
const row = (entity_type: string, data: Record<string, unknown>, version = 1) => ({ workspace_id: 'aitask-main', entity_type, entity_id: data.id, parent_id: entity_type === 'deliverable' ? 'cycle' : undefined, data, version, updated_at: stamp });

async function load(remoteDelivery = { ...delivery, status: 'In Progress' }) {
  rpc.mockReset();
  from.mockReset();
  from.mockImplementation((table: string) => {
    const query: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'neq', 'order', 'abortSignal']) query[method] = () => query;
    query.range = () => Promise.resolve({ data: table === 'aitask_members' ? [member] : [row('task', task), row('deliverable', delivery), row('service_cycle', cycle)], error: null });
    query.single = () => Promise.resolve({ data: table === 'aitask_workspaces' ? { version: 1, updated_at: stamp, sync_protocol_version: 1 } : row('deliverable', remoteDelivery, 2), error: null });
    return query;
  });
  rpc.mockResolvedValueOnce({ data: { ok: true, memberId: member.id, items: [], unreadCount: 0, nextCursor: null }, error: null });
  return (await loadSecureWorkspace({ id: member.auth_user_id } as never)).state;
}

afterEach(() => discardSecureWorkspaceCommand());

describe('task-derived delivery saves', () => {
  it('accepts progress already persisted by the task trigger without a second stale write', async () => {
    const state = await load();
    const next = { ...state, tasks: state.tasks.map(item => ({ ...item, status: 'In Progress' as const })), deliverables: state.deliverables.map(item => ({ ...item, status: 'In Progress' as const })) };
    rpc.mockResolvedValueOnce({ data: { ok: true, workspaceVersion: 2, changed: [{ entityType: 'task', entityId: 'task', version: 2 }] }, error: null });
    const saved = await saveSecureWorkspace(next, 'task.update', undefined, { actorMemberId: 'staff', excludeSuperAdminEntities: true });
    expect(saved.ok).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(2); // Notification feed plus task command.
    expect(buildOperations(next, { actorMemberId: 'staff', excludeSuperAdminEntities: true })).toEqual([]);
  });

  it('preserves conflict review when someone changes delivery content concurrently', async () => {
    const state = await load({ ...delivery, status: 'In Progress', title: 'Changed by another member' });
    const next = { ...state, tasks: state.tasks.map(item => ({ ...item, status: 'In Progress' as const })), deliverables: state.deliverables.map(item => ({ ...item, status: 'In Progress' as const })) };
    rpc.mockResolvedValueOnce({ data: { ok: true, workspaceVersion: 2, changed: [{ entityType: 'task', entityId: 'task', version: 2 }] }, error: null });
    rpc.mockResolvedValueOnce({ data: { ok: false, code: 'CONFLICT', error: 'A newer record is available.' }, error: null });
    expect(await saveSecureWorkspace(next, 'task.update', undefined, { actorMemberId: 'staff', excludeSuperAdminEntities: true })).toMatchObject({ ok: false, code: 'CONFLICT' });
    const sent = rpc.mock.calls.at(-1)?.[1].p_operations[0];
    expect(sent.expectedVersion).toBe(1);
  });

  it('orders delivery completion before an existing cycle update', async () => {
    const state = await load();
    const operations = buildOperations({ ...state, deliverables: state.deliverables.map(item => ({ ...item, status: 'Delivered' as const })), serviceCycles: state.serviceCycles.map(item => ({ ...item, status: 'Completed' as const })) });
    expect(operations.map(item => item.entityType)).toEqual(['deliverable', 'service_cycle']);
  });
});
