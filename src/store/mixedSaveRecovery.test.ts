import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.hoisted(() => {
  process.env.VITE_AITASK_BACKEND = 'supabase';
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
});
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), getUser: vi.fn() }));
vi.mock('../lib/supabaseClient', () => ({ supabase: { rpc: mocks.rpc, from: mocks.from, auth: { getUser: mocks.getUser, refreshSession: vi.fn() } }, shouldUseSecureSupabase: () => true, resolveAuthEmail: (x: string) => x }));
import { clearWorkspaceSession, useStore, automaticRecoveryPolicy } from './index';
import { buildOperations, getRetainedSecureCommand, saveSecureWorkspace, transientRetryPolicy } from '../lib/secureWorkspace';
const initial = useStore.getState();
const authId = '00000000-0000-4000-8000-000000000001';
const stamp = '2026-10-08T00:00:00Z';
const member = { id: 'audit-boss', workspace_id: 'aitask-main', auth_user_id: authId, name: 'Boss Koo', email: 'boss@example.com', role: 'Project Manager', departments: ['Management'], department: 'Management', is_super_admin: true, version: 1, updated_at: stamp };
let entities: { entity_type: string; entity_id: string; workspace_id: string; data: Record<string,unknown>; version: number; updated_at: string }[];
let version: number;
let failGeneric: boolean;
let failService: boolean;
beforeEach(() => {
  // These cases cover the manual retry path after an outage.
  transientRetryPolicy.attempts = 0;
  // These tests exercise the explicit Retry path.
  automaticRecoveryPolicy.delaysMs = [];
  const storage = new Map<string, string>();
  const fakeStorage = { getItem: (key: string) => storage.get(key) || null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) };
  vi.stubGlobal('localStorage', fakeStorage);
  vi.stubGlobal('window', { location: { hostname: 'example.test', pathname: '/' }, sessionStorage: fakeStorage, localStorage: fakeStorage, setTimeout, clearTimeout });
  clearWorkspaceSession();
  version = 1; failGeneric = false; failService = false;
  entities = [
    { entity_type: 'client', entity_id: 'client-1', workspace_id: 'aitask-main', version: 1, updated_at: stamp, data: { id:'client-1',clientName:'Old Company',createdBy:member.id,createdAt:stamp,updatedAt:stamp } },
    { entity_type: 'service_cycle', entity_id: 'cycle-1', workspace_id: 'aitask-main', version: 1, updated_at: stamp, data: { id:'cycle-1',clientId:'client-1',clientName:'Old Company',planId:'plan-1',planRevision:1,periodStart:'2026-10-01',periodEnd:'2026-10-31',status:'Published',currency:'MYR',serviceItems:[],discountType:'none',discountValue:0,taxRateBps:0,createdAt:stamp,updatedAt:stamp } },
  ];
  mocks.rpc.mockReset(); mocks.from.mockReset();
  mocks.getUser.mockResolvedValue({ data:{user:{id:authId}},error:null });
  mocks.from.mockImplementation((table: string) => {
    const q: Record<string, (...args: unknown[]) => unknown> = {};
    for (const m of ['select','eq','neq','order','abortSignal']) q[m] = () => q;
    q.single = () => Promise.resolve({data:{version,updated_at:stamp,sync_protocol_version:1},error:null});
    q.range = (from: number, to: number) => Promise.resolve({data: (table === 'aitask_members' ? [member] : entities).slice(from,to+1),error:null});
    return q;
  });
  mocks.rpc.mockImplementation(async (name: string, args: Record<string,unknown>) => {
    if (name === 'aitask_get_backend_capabilities') return {data:{ok:true,schemaVersion:5,workspaceOptimisticLock:true,serviceOperations:true,releaseNoticeAcknowledgements:true,memberPermissionManagement:true,workflowReviewGate:true},error:null};
    if (name === 'aitask_read_notifications') return {data:{ok:true,memberId:member.id,items:[],unreadCount:0},error:null};
    if (name === 'aitask_get_workflow_task_context') return {data:{ok:true,tasks:[]},error:null};
    if (name === 'aitask_execute_command' || name === 'aitask_execute_service_command') {
      if (name === 'aitask_execute_service_command' && failService) { failService = false; throw new Error('Lost service connection'); }
      if (name === 'aitask_execute_command' && failGeneric) { failGeneric = false; throw new Error('Lost connection'); }
      const changed: unknown[] = [];
      for (const op of args.p_operations as {entityType:string;entityId:string;data:Record<string,unknown>;action:string}[]) {
        let row = entities.find(e => e.entity_type === op.entityType && e.entity_id === op.entityId);
        if (!row && op.action === 'insert') { row = {entity_type:op.entityType,entity_id:op.entityId,workspace_id:'aitask-main',data:op.data,version:0,updated_at:stamp}; entities.push(row); }
        if (row) { row.data = structuredClone(op.data); row.version += 1; changed.push({entityType:op.entityType,entityId:op.entityId,version:row.version,updatedAt:stamp}); }
      }
      version += 1;
      return {data:{ok:true,workspaceVersion:version,commandId:args.p_command_id,changed},error:null};
    }
    throw new Error(`Unexpected RPC ${name}`);
  });
  useStore.setState({ ...initial,currentUser:{id:member.id,authUserId:authId,name:member.name,role:'Project Manager',departments:['Management'],isSuperAdmin:true},backend:{...initial.backend,mode:'supabase',status:'live',isConfigured:true,isLoading:false,isSaving:false,isPulling:false,hasLocalChanges:false,pendingMutations:0,workspaceVersion:1}},true);
});
afterEach(() => vi.unstubAllGlobals());

it('retries the complete company rename including its service group', async () => {
  await useStore.getState().pullBackendNow({force:true});
  expect(useStore.getState().backend.error).toBeUndefined();
  // Provision the same default role/status/workflow rows as a complete workspace.
  expect((await saveSecureWorkspace(useStore.getState())).ok).toBe(true);
  await useStore.getState().pullBackendNow({force:true});
  mocks.rpc.mockClear();
  expect(useStore.getState().serviceCycles[0].clientName).toBe('Old Company');
  expect(useStore.getState().renameClient('Old Company','New Company')).toEqual({ok:true});
  expect(useStore.getState().serviceCycles[0].clientName).toBe('New Company');
  failGeneric = true;
  expect(await useStore.getState().commitPendingMutation()).toMatchObject({ok:false});
  expect(getRetainedSecureCommand()?.operations.map(op=>op.entityType)).toContain('client');
  expect(getRetainedSecureCommand()?.operations.map(op=>op.entityType)).not.toContain('service_cycle');
  expect(await useStore.getState().retryPendingSave()).toEqual({ok:true});
  expect(useStore.getState().clients[0].clientName).toBe('New Company');
  expect(useStore.getState().serviceCycles[0].clientName).toBe('New Company');
  expect(useStore.getState().backend).toMatchObject({status:'live',hasLocalChanges:false,pendingMutations:0});
  expect(mocks.rpc.mock.calls.filter(([name])=>name==='aitask_execute_service_command')).toHaveLength(1);
  expect(buildOperations(useStore.getState())).toEqual([]);
});

it('retains the later service group when company persistence already succeeded', async () => {
  await useStore.getState().pullBackendNow({force:true});
  expect((await saveSecureWorkspace(useStore.getState())).ok).toBe(true);
  await useStore.getState().pullBackendNow({force:true});
  mocks.rpc.mockClear();
  useStore.getState().renameClient('Old Company','New Company');
  failService = true;
  expect(await useStore.getState().commitPendingMutation()).toMatchObject({ok:false});
  const id = getRetainedSecureCommand()?.id;
  expect(getRetainedSecureCommand()?.operations.map(op=>op.entityType)).toContain('service_cycle');
  expect(await useStore.getState().retryPendingSave()).toEqual({ok:true});
  expect(useStore.getState().serviceCycles[0].clientName).toBe('New Company');
  const generic = mocks.rpc.mock.calls.filter(([name])=>name==='aitask_execute_command');
  const service = mocks.rpc.mock.calls.filter(([name])=>name==='aitask_execute_service_command');
  expect(generic).toHaveLength(1);
  expect(service.map(([,args])=>args.p_command_id)).toEqual([id,id]);
});

it('restores both command groups after a module reload and fences another account', async () => {
  await useStore.getState().pullBackendNow({force:true});
  await saveSecureWorkspace(useStore.getState());
  await useStore.getState().pullBackendNow({force:true});
  useStore.getState().renameClient('Old Company','New Company');
  failGeneric = true;
  expect(await useStore.getState().commitPendingMutation()).toMatchObject({ok:false});
  const originalId = getRetainedSecureCommand()?.id;
  vi.resetModules();
  const adapter = await import('../lib/secureWorkspace');
  expect(adapter.restoreSecureWorkspaceCommand('another-account')).toBeNull();
  const restored = adapter.restoreSecureWorkspaceCommand(authId);
  expect(restored?.id).toBe(originalId);
  const loaded = await adapter.loadSecureWorkspace({ id: authId } as Parameters<typeof adapter.loadSecureWorkspace>[0], { preserveRetainedCommand: true });
  const overlaid = adapter.overlayRetainedWorkspaceEntities(loaded.state, loaded.state, adapter.getRetainedSecureCommand()!.operations);
  expect(overlaid.clients[0].clientName).toBe('New Company');
  expect(overlaid.serviceCycles[0].clientName).toBe('New Company');
  expect((await adapter.retrySecureWorkspaceCommand()).ok).toBe(true);
  expect(entities.find(row=>row.entity_type==='service_cycle')?.data.clientName).toBe('New Company');
  expect(adapter.getRetainedSecureCommand()).toBeNull();
});

it('keeps edits made while a retry is being acknowledged', async () => {
  await useStore.getState().pullBackendNow({force:true});
  await saveSecureWorkspace(useStore.getState());
  await useStore.getState().pullBackendNow({force:true});
  useStore.getState().renameClient('Old Company','New Company');
  failGeneric = true;
  await useStore.getState().commitPendingMutation();
  const originalRpc = mocks.rpc.getMockImplementation()!;
  let edited = false;
  mocks.rpc.mockImplementation(async (...args) => {
    const result = await originalRpc(...args);
    if (args[0] === 'aitask_execute_service_command' && !edited) {
      edited = true;
      useStore.setState(state=>({ clients: state.clients.map(client=>({...client,clientName:'Newest Company'})), serviceCycles: state.serviceCycles.map(cycle=>({...cycle,clientName:'Newest Company'})) }));
    }
    return result;
  });
  expect(await useStore.getState().retryPendingSave()).toEqual({ok:true});
  expect(useStore.getState().clients[0].clientName).toBe('Newest Company');
  expect(useStore.getState().serviceCycles[0].clientName).toBe('Newest Company');
});

it('rebases only the original intended fields, preserving a concurrent contact edit', async () => {
  await useStore.getState().pullBackendNow({force:true});
  await saveSecureWorkspace(useStore.getState());
  await useStore.getState().pullBackendNow({force:true});
  useStore.getState().renameClient('Old Company','New Company');
  failGeneric = true;
  await useStore.getState().commitPendingMutation();
  const originalRpc = mocks.rpc.getMockImplementation()!;
  let conflict = true;
  mocks.rpc.mockImplementation(async (...args) => {
    if (args[0] === 'aitask_execute_command' && conflict) {
      conflict = false;
      const client = entities.find(row=>row.entity_type==='client')!;
      client.data.contactPerson = 'Remote contact';
      client.version += 1;
      return { data: { ok: false, code: 'CONFLICT', error: 'Record changed', conflict: { entityType:'client',entityId:client.entity_id,expectedVersion:1,actualVersion:client.version,current:client.data } }, error:null };
    }
    return originalRpc(...args);
  });
  expect(await useStore.getState().retryPendingSave()).toMatchObject({ok:false});
  expect(useStore.getState().backend.conflict?.changedFields).not.toContain('contactPerson');
  expect(await useStore.getState().retryPendingSave()).toEqual({ok:true});
  expect(useStore.getState().clients[0]).toMatchObject({clientName:'New Company',contactPerson:'Remote contact'});
});

it('recovers a dropped save by itself without showing a retry banner', async () => {
  automaticRecoveryPolicy.delaysMs = [0];
  try {
    await useStore.getState().pullBackendNow({force:true});
    expect((await saveSecureWorkspace(useStore.getState())).ok).toBe(true);
    await useStore.getState().pullBackendNow({force:true});
    expect(useStore.getState().renameClient('Old Company','Recovered Company')).toEqual({ok:true});
    failGeneric = true;
    expect(await useStore.getState().commitPendingMutation()).toEqual({ok:true});
    expect(useStore.getState().backend).toMatchObject({status:'live',hasLocalChanges:false,pendingMutations:0});
    expect(useStore.getState().backend.error).toBeUndefined();
    expect(getRetainedSecureCommand()).toBeNull();
  } finally {
    automaticRecoveryPolicy.delaysMs = [];
  }
});

it('keeps resending a dropped save past the old three attempts, without a retry banner', async () => {
  automaticRecoveryPolicy.delaysMs = [0];
  try {
    await useStore.getState().pullBackendNow({force:true});
    expect((await saveSecureWorkspace(useStore.getState())).ok).toBe(true);
    await useStore.getState().pullBackendNow({force:true});
    const originalRpc = mocks.rpc.getMockImplementation()!;
    let drops = 7;
    mocks.rpc.mockImplementation(async (...args) => {
      if (args[0] === 'aitask_execute_command' && drops > 0) { drops -= 1; throw new Error('Lost connection'); }
      return originalRpc(...args);
    });
    expect(useStore.getState().renameClient('Old Company','Patient Company')).toEqual({ok:true});
    expect(await useStore.getState().commitPendingMutation()).toEqual({ok:true});
    expect(drops).toBe(0);
    expect(useStore.getState().backend).toMatchObject({status:'live',hasLocalChanges:false,pendingMutations:0});
    expect(getRetainedSecureCommand()).toBeNull();
  } finally {
    automaticRecoveryPolicy.delaysMs = [];
  }
});

it('lets the form finish while a dropped save is resent, then saves it and the next edit', async () => {
  automaticRecoveryPolicy.delaysMs = [20];
  automaticRecoveryPolicy.queueAfterMs = 0;
  try {
    await useStore.getState().pullBackendNow({force:true});
    expect((await saveSecureWorkspace(useStore.getState())).ok).toBe(true);
    await useStore.getState().pullBackendNow({force:true});
    const originalRpc = mocks.rpc.getMockImplementation()!;
    let drops = 3;
    mocks.rpc.mockImplementation(async (...args) => {
      if (args[0] === 'aitask_execute_command' && drops > 0) { drops -= 1; throw new Error('Lost connection'); }
      return originalRpc(...args);
    });
    expect(useStore.getState().renameClient('Old Company','Queued Company')).toEqual({ok:true});
    expect(await useStore.getState().commitPendingMutation()).toEqual({ok:true,queued:true});
    expect(useStore.getState().backend).toMatchObject({status:'saving',hasLocalChanges:true});
    expect(useStore.getState().backend.error).toBeUndefined();
    // A second edit during the outage is accepted too, and saved after the first.
    expect(useStore.getState().renameClient('Queued Company','Final Company')).toEqual({ok:true});
    expect(await useStore.getState().commitPendingMutation()).toMatchObject({ok:true});
    await vi.waitFor(() => expect(useStore.getState().backend).toMatchObject({status:'live',hasLocalChanges:false,pendingMutations:0}), {timeout:3000});
    expect(entities.find(entity => entity.entity_id === 'client-1')!.data.clientName).toBe('Final Company');
  } finally {
    automaticRecoveryPolicy.delaysMs = [];
    automaticRecoveryPolicy.queueAfterMs = 8000;
  }
});

it('accepts an edit made while an earlier save is still on its way and saves it next', async () => {
  await useStore.getState().pullBackendNow({force:true});
  expect((await saveSecureWorkspace(useStore.getState())).ok).toBe(true);
  await useStore.getState().pullBackendNow({force:true});
  const originalRpc = mocks.rpc.getMockImplementation()!;
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let heldOnce = false;
  mocks.rpc.mockImplementation(async (...args) => {
    if (args[0] === 'aitask_execute_command' && !heldOnce) { heldOnce = true; await held; }
    return originalRpc(...args);
  });
  expect(useStore.getState().upsertClientProfile('Old Company', { phone: '111' }).ok).toBe(true);
  const firstSave = useStore.getState().commitPendingMutation();
  await vi.waitFor(() => expect(heldOnce).toBe(true));
  // A slow first save must not refuse the next edit (the form sends the whole profile).
  expect(useStore.getState().upsertClientProfile('Old Company', { phone: '111', address: 'Level 2' })).toMatchObject({ ok: true });
  release();
  expect(await firstSave).toEqual({ ok: true });
  expect(await useStore.getState().commitPendingMutation()).toEqual({ ok: true });
  const saved = entities.find(e => e.entity_type === 'client')!.data;
  expect(saved).toMatchObject({ phone: '111', address: 'Level 2' });
  expect(useStore.getState().backend).toMatchObject({ status: 'live', hasLocalChanges: false });
});

it('saves a cycle change made while an earlier task update is being resent', async () => {
  automaticRecoveryPolicy.delaysMs = [50];
  automaticRecoveryPolicy.queueAfterMs = 0;
  try {
    entities.push({ entity_type: 'task', entity_id: 'task-mixed', workspace_id: 'aitask-main', version: 1, updated_at: stamp, data: {
      id: 'task-mixed', title: 'Original task', description: '', clientId: 'client-1', clientName: 'Old Company',
      serviceType: 'Design', department: 'Designer', priority: 'Medium', status: 'Pending', isCompleted: false,
      startDate: '2026-10-01', dueDate: '2026-10-30', visibility: 'internal', assignedTo: member.id,
      createdBy: member.id, revisionCount: 0, completionPercentage: 0, createdAt: stamp, updatedAt: stamp,
    } });
    await useStore.getState().pullBackendNow({ force: true });
    expect((await saveSecureWorkspace(useStore.getState())).ok).toBe(true);
    await useStore.getState().pullBackendNow({ force: true });
    mocks.rpc.mockClear();
    expect(useStore.getState().tasks.some(task => task.id === 'task-mixed')).toBe(true);
    failGeneric = true;
    expect(useStore.getState().updateTask('task-mixed', { title: 'Edited task' })).toEqual({ ok: true });
    expect(await useStore.getState().commitPendingMutation('task.update')).toEqual({ ok: true, queued: true });
    expect(useStore.getState().setServiceCycleStatus('cycle-1', 'Cancelled')).toEqual({ ok: true });
    await useStore.getState().commitPendingMutation('service_cycle.manage');
    await vi.waitFor(() => {
      expect(entities.find(row => row.entity_id === 'task-mixed')?.data.title).toBe('Edited task');
      expect(entities.find(row => row.entity_id === 'cycle-1')?.data.status).toBe('Cancelled');
      expect(useStore.getState().backend).toMatchObject({ status: 'live', hasLocalChanges: false });
    }, { timeout: 5000 });
    const calls = mocks.rpc.mock.calls.filter(([name]) => name === 'aitask_execute_command' || name === 'aitask_execute_service_command');
    expect(calls.some(([name, args]) => name === 'aitask_execute_command' && args.p_operations.some((op: { entityType: string }) => op.entityType === 'task'))).toBe(true);
    expect(calls.some(([name, args]) => name === 'aitask_execute_service_command' && args.p_operations.some((op: { entityType: string }) => op.entityType === 'service_cycle'))).toBe(true);
    expect(calls.every(([name, args]) => name !== 'aitask_execute_command' || args.p_operations.every((op: { entityType: string }) => op.entityType !== 'service_cycle'))).toBe(true);
  } finally {
    automaticRecoveryPolicy.delaysMs = [];
    automaticRecoveryPolicy.queueAfterMs = 8000;
  }
});

it('continues a ten-minute hidden-tab outage with capped retries and resumes on visibility', async () => {
  await useStore.getState().pullBackendNow({ force: true });
  expect((await saveSecureWorkspace(useStore.getState())).ok).toBe(true);
  await useStore.getState().pullBackendNow({ force: true });
  vi.useFakeTimers();
  const windowListeners = new Map<string, () => void>();
  const documentListeners = new Map<string, () => void>();
  const windowObject = window as unknown as { addEventListener: (name: string, listener: () => void) => void };
  windowObject.addEventListener = (name, listener) => { windowListeners.set(name, listener); };
  const documentObject = { visibilityState: 'hidden', addEventListener: (name: string, listener: () => void) => { documentListeners.set(name, listener); } };
  vi.stubGlobal('document', documentObject);
  vi.stubGlobal('navigator', { onLine: true });
  automaticRecoveryPolicy.delaysMs = [1000, 3000, 6000, 10_000, 15_000, 30_000];
  automaticRecoveryPolicy.queueAfterMs = 0;
  const originalRpc = mocks.rpc.getMockImplementation()!;
  const attempts: number[] = [];
  let blocked = true;
  mocks.rpc.mockImplementation(async (...args) => {
    if (args[0] === 'aitask_execute_command') {
      attempts.push(Date.now());
      if (blocked) throw new Error('Lost connection');
    }
    return originalRpc(...args);
  });
  try {
    expect(useStore.getState().upsertClientProfile('Old Company', { phone: '600000' }).ok).toBe(true);
    const save = useStore.getState().commitPendingMutation();
    await vi.advanceTimersByTimeAsync(100);
    expect(await save).toMatchObject({ ok: true, queued: true });
    await vi.advanceTimersByTimeAsync(600_000);
    expect(attempts.length).toBeGreaterThan(20);
    expect(Math.max(...attempts.slice(1).map((time, index) => time - attempts[index]))).toBeLessThanOrEqual(30_000);
    expect(useStore.getState().backend).toMatchObject({ status: 'saving', hasLocalChanges: true });
    expect(useStore.getState().backend.error).toBeUndefined();
    blocked = false;
    const beforeVisible = attempts.length;
    windowListeners.get('online')?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(attempts).toHaveLength(beforeVisible);
    documentObject.visibilityState = 'visible';
    documentListeners.get('visibilitychange')?.();
    await vi.advanceTimersByTimeAsync(100);
    expect(attempts.length).toBeGreaterThan(beforeVisible);
    expect(entities.find(row => row.entity_id === 'client-1')?.data.phone).toBe('600000');
    expect(useStore.getState().backend).toMatchObject({ status: 'live', hasLocalChanges: false });
  } finally {
    vi.useRealTimers();
    automaticRecoveryPolicy.delaysMs = [];
    automaticRecoveryPolicy.queueAfterMs = 8000;
  }
});

it('says plainly that a change is not saved yet after a long outage (G6)', async () => {
  automaticRecoveryPolicy.delaysMs = [50];
  automaticRecoveryPolicy.queueAfterMs = 0;
  const escalate = automaticRecoveryPolicy.escalateAfterMs;
  automaticRecoveryPolicy.escalateAfterMs = 0;
  try {
    await useStore.getState().pullBackendNow({force:true});
    expect((await saveSecureWorkspace(useStore.getState())).ok).toBe(true);
    await useStore.getState().pullBackendNow({force:true});
    const originalRpc = mocks.rpc.getMockImplementation()!;
    let drops = 2;
    mocks.rpc.mockImplementation(async (...args) => {
      if (args[0] === 'aitask_execute_command' && drops > 0) { drops -= 1; throw new Error('Lost connection'); }
      return originalRpc(...args);
    });
    expect(useStore.getState().renameClient('Old Company','Slow Company')).toEqual({ok:true});
    expect(await useStore.getState().commitPendingMutation()).toEqual({ok:true,queued:true});
    expect(useStore.getState().backend.message).toBe('Still not saved. Keep this tab open; it keeps trying.');
    await vi.waitFor(() => expect(useStore.getState().backend).toMatchObject({status:'live',hasLocalChanges:false}), { timeout: 3000 });
  } finally {
    automaticRecoveryPolicy.delaysMs = [];
    automaticRecoveryPolicy.queueAfterMs = 8000;
    automaticRecoveryPolicy.escalateAfterMs = escalate;
  }
});
