import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.hoisted(() => {
  process.env.VITE_AITASK_BACKEND = 'supabase';
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
});
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), getUser: vi.fn() }));
vi.mock('../lib/supabaseClient', () => ({ supabase: { rpc: mocks.rpc, from: mocks.from, auth: { getUser: mocks.getUser, refreshSession: vi.fn() } }, shouldUseSecureSupabase: () => true, resolveAuthEmail: (x: string) => x }));
import { clearWorkspaceSession, useStore } from './index';
import { buildOperations, getRetainedSecureCommand, saveSecureWorkspace } from '../lib/secureWorkspace';
const initial = useStore.getState();
const authId = '00000000-0000-4000-8000-000000000001';
const stamp = '2026-10-08T00:00:00Z';
const member = { id: 'audit-boss', workspace_id: 'aitask-main', auth_user_id: authId, name: 'Boss Koo', email: 'boss@example.com', role: 'Project Manager', departments: ['Management'], department: 'Management', is_super_admin: true, version: 1, updated_at: stamp };
let entities: { entity_type: string; entity_id: string; workspace_id: string; data: Record<string,unknown>; version: number; updated_at: string }[];
let version: number;
let failGeneric: boolean;
let failService: boolean;
beforeEach(() => {
  const storage = new Map<string, string>();
  const fakeStorage = { getItem: (key: string) => storage.get(key) || null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) };
  vi.stubGlobal('localStorage', fakeStorage);
  vi.stubGlobal('window', { location: { hostname: 'example.test', pathname: '/' }, sessionStorage: fakeStorage, localStorage: fakeStorage, setTimeout, clearTimeout });
  clearWorkspaceSession();
  version = 1; failGeneric = false; failService = false;
  entities = [
    { entity_type: 'client', entity_id: 'client-1', workspace_id: 'aitask-main', version: 1, updated_at: stamp, data: { id:'client-1',clientName:'Old Company',createdBy:member.id,createdAt:stamp,updatedAt:stamp } },
    { entity_type: 'service_cycle', entity_id: 'cycle-1', workspace_id: 'aitask-main', version: 1, updated_at: stamp, data: { id:'cycle-1',clientId:'client-1',clientName:'Old Company',planId:'plan-1',planRevision:1,periodStart:'2026-10-01',periodEnd:'2026-10-31',status:'Published',currency:'MYR',serviceItems:[],addonSnapshots:[],discountType:'none',discountValue:0,taxRateBps:0,createdAt:stamp,updatedAt:stamp } },
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
    if (name === 'aitask_get_backend_capabilities') return {data:{ok:true,schemaVersion:4,workspaceOptimisticLock:true,serviceOperations:true,releaseNoticeAcknowledgements:true,memberPermissionManagement:true},error:null};
    if (name === 'aitask_read_notifications') return {data:{ok:true,memberId:member.id,items:[],unreadCount:0},error:null};
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
