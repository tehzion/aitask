import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.VITE_AITASK_BACKEND = 'local';
  process.env.VITE_AITASK_SHOW_DEMO_LOGIN = 'true';
});

import { useStore } from './index';
import { LOCAL_SERVICE_DEMO_VERSION_KEY } from '../mock/localServiceDemo';

const initialState = useStore.getState();
const storage = new Map<string, string>();
const localWindow = {
  location: { hostname: '127.0.0.1' },
  localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
    removeItem: (key: string) => { storage.delete(key); },
  },
};

describe('local service demo reset', () => {
  beforeEach(() => {
    storage.clear();
    vi.stubGlobal('window', localWindow);
    const boss = initialState.users.find(user => user.id === 'u-boss')!;
    useStore.setState({
      ...initialState,
      currentUser: { ...boss, mustResetPassword: false },
      backend: { ...initialState.backend, mode: 'local' },
      clients: [{
        id: 'custom-client-kept', clientName: 'Existing local client', createdAt: '2026-08-16T00:00:00.000Z', updatedAt: '2026-08-16T00:00:00.000Z',
      }],
      tasks: [],
      servicePackages: [],
      clientPlans: [],
      serviceCycles: [],
      deliverables: [],
      cycleComments: [],
      addons: [],
      servicePricingSnapshots: [],
    });
  });

  afterEach(() => {
    useStore.setState(initialState);
    vi.unstubAllGlobals();
  });

  it('is idempotent and preserves non-demo local records', () => {
    const first = useStore.getState().resetLocalServiceDemo();
    const afterFirst = useStore.getState();
    const second = useStore.getState().resetLocalServiceDemo();
    const afterSecond = useStore.getState();

    expect(first).toEqual({ ok: true });
    expect(second).toEqual({ ok: true });
    expect(afterFirst.clients.some(client => client.id === 'custom-client-kept')).toBe(true);
    expect(afterSecond.clients.filter(client => client.id === 'demo-service-client-urban')).toHaveLength(1);
    expect(afterSecond.clientPlans.filter(plan => plan.id === 'demo-service-plan-urban-active')).toHaveLength(1);
    expect(afterSecond.serviceCycles.filter(cycle => cycle.id === 'demo-service-cycle-urban-current')).toHaveLength(1);
    expect(afterSecond.tasks.filter(task => task.id.startsWith('demo-service-task-')).length).toBeGreaterThan(10);
    expect(storage.get(LOCAL_SERVICE_DEMO_VERSION_KEY)).toBeTruthy();
  });

  it('loads the fixture once on an empty explicit-local workspace', () => {
    useStore.getState()._forceSyncMockData();
    const first = useStore.getState();
    const counts = {
      clients: first.clients.length,
      plans: first.clientPlans.length,
      cycles: first.serviceCycles.length,
      tasks: first.tasks.length,
    };

    useStore.getState()._forceSyncMockData();
    const second = useStore.getState();

    expect(first.clients.some(client => client.id === 'demo-service-client-urban')).toBe(true);
    expect(counts).toEqual({ clients: 4, plans: 4, cycles: 3, tasks: 12 });
    expect({ clients: second.clients.length, plans: second.clientPlans.length, cycles: second.serviceCycles.length, tasks: second.tasks.length }).toEqual(counts);
  });
});
