import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '../types';
import { useStore } from './index';

const initial = useStore.getState();
const pm: User = { id: 'monthly-pm', name: 'Monthly PM', role: 'Project Manager', department: 'Management', departments: ['Management'] };
const setDay = (year: number, month: number, day: number) => vi.setSystemTime(new Date(year, month - 1, day, 12));
const createPlan = (startDate = '2026-09-09', billingDay = 9) => {
  const created = useStore.getState().createClientWithPlan({
    clientName: `Monthly Company ${useStore.getState().clients.length + 1}`, planName: 'Monthly Plan', origin: 'custom', startDate, billingDay,
    serviceItems: [{ id: 'monthly-service', name: 'Management', platforms: [], unit: 'month', quantity: 2, unitPriceMinor: 225000 }],
    discountType: 'percent', discountValue: 1000, taxRateBps: 800,
  });
  expect(created.ok).toBe(true);
  return created.planId!;
};

beforeEach(() => {
  vi.useFakeTimers(); setDay(2026, 10, 8);
  useStore.setState({ ...initial, currentUser: pm, users: [pm], clients: [], projects: [], tasks: [], clientPlans: [], serviceCycles: [], deliverables: [], addons: [], servicePricingSnapshots: [], rolePermissions: [],
    backend: { ...initial.backend, mode: 'local', status: 'local', isLoading: false, hasLocalChanges: false, pendingMutations: 0 } }, true);
});
afterEach(() => { useStore.setState(initial, true); vi.useRealTimers(); });

describe('monthly service cycle rollover', () => {
  it('waits for the billing day, then creates fresh slots once while preserving progress, files and prices', () => {
    const id = createPlan();
    useStore.getState().activateClientPlan(id);
    useStore.setState(state => ({ deliverables: state.deliverables.map(item => ({ ...item, status: 'Delivered', attachments: [{ id: 'prior-file' } as never] })) }));
    const previous = structuredClone(useStore.getState().serviceCycles[0]);
    const previousSlots = structuredClone(useStore.getState().deliverables);
    useStore.getState().generateDueLocalServiceCycles();
    expect(useStore.getState().serviceCycles).toHaveLength(1);

    setDay(2026, 10, 9);
    useStore.getState().generateDueLocalServiceCycles();
    const state = useStore.getState();
    expect(state.serviceCycles).toHaveLength(2);
    expect(state.serviceCycles[0]).toEqual(previous);
    expect(state.deliverables.slice(0, 2)).toEqual(previousSlots);
    expect(state.serviceCycles[1]).toMatchObject({ periodStart: '2026-10-09', periodEnd: '2026-11-08', status: 'Draft' });
    expect(state.deliverables.slice(2)).toHaveLength(2);
    state.deliverables.slice(2).forEach(item => expect(item).toMatchObject({ status: 'Planned', attachments: [], taskIds: [] }));
    expect(state.servicePricingSnapshots.find(item => item.id === state.serviceCycles[1].pricingSnapshotId)).toMatchObject({ totalMinor: 437400 });
    expect(state.clientPlans[0].nextCycleStart).toBe('2026-11-09');
    useStore.getState().generateDueLocalServiceCycles();
    expect(useStore.getState().serviceCycles).toBe(state.serviceCycles);
  });

  it('catches up missed months and uses the last day of short months without drifting', () => {
    const id = createPlan('2027-01-31', 31);
    useStore.getState().activateClientPlan(id);
    setDay(2027, 3, 31);
    useStore.getState().generateDueLocalServiceCycles();
    expect(useStore.getState().serviceCycles.map(item => [item.periodStart, item.periodEnd])).toEqual([
      ['2027-01-31', '2027-02-27'], ['2027-02-28', '2027-03-30'], ['2027-03-31', '2027-04-29'],
    ]);
    expect(useStore.getState().clientPlans[0].nextCycleStart).toBe('2027-04-30');
  });

  it('switches to a scheduled revision and keeps old monthly snapshots intact', () => {
    const id = createPlan();
    useStore.getState().activateClientPlan(id);
    const oldCycle = structuredClone(useStore.getState().serviceCycles[0]);
    const revision = useStore.getState().createClientPlanRevision(id);
    useStore.getState().updateDraftClientPlan(revision.planId!, { name: 'New scope', serviceItems: [{ id: 'next-service', name: 'Video', quantity: 3, unit: 'video', platforms: [], unitPriceMinor: 100 }] });
    setDay(2026, 11, 9);
    useStore.getState().generateDueLocalServiceCycles();
    expect(useStore.getState().clientPlans.find(item => item.id === id)?.status).toBe('Ended');
    expect(useStore.getState().clientPlans.find(item => item.id === revision.planId)).toMatchObject({ status: 'Active', nextCycleStart: '2026-12-09' });
    expect(useStore.getState().serviceCycles[0]).toEqual(oldCycle);
    expect(useStore.getState().serviceCycles.slice(1).map(item => item.planId)).toEqual([revision.planId, revision.planId]);
    expect(useStore.getState().deliverables).toHaveLength(8);
  });

  it.each(['Draft', 'Paused', 'Ended'] as const)('does not renew a %s plan', status => {
    const id = createPlan();
    if (status !== 'Draft') {
      useStore.getState().activateClientPlan(id);
      useStore.getState().setClientPlanStatus(id, status);
    }
    const previous = useStore.getState();
    setDay(2027, 10, 9);
    useStore.getState().generateDueLocalServiceCycles();
    expect(useStore.getState().serviceCycles).toBe(previous.serviceCycles);
    expect(useStore.getState().clientPlans).toBe(previous.clientPlans);
  });

  it('retains the next boundary when changing billing day and uses the new day for following cycles', () => {
    const id = createPlan(); useStore.getState().activateClientPlan(id);
    useStore.getState().updateActivePlanDates(id, { billingDay: 20, contractEndDate: '2026-09-30' });
    setDay(2026, 11, 20);
    useStore.getState().generateDueLocalServiceCycles();
    expect(useStore.getState().serviceCycles.map(item => [item.periodStart, item.periodEnd])).toEqual([
      ['2026-09-09', '2026-10-08'], ['2026-10-09', '2026-10-19'], ['2026-10-20', '2026-11-19'], ['2026-11-20', '2026-12-19'],
    ]);
  });

  it('never runs the browser generator against a shared workspace', () => {
    const id = createPlan(); useStore.getState().activateClientPlan(id);
    setDay(2026, 12, 9);
    useStore.setState(state => ({ backend: { ...state.backend, mode: 'supabase' } }));
    const previous = useStore.getState();
    useStore.getState().generateDueLocalServiceCycles();
    expect(useStore.getState().clientPlans).toBe(previous.clientPlans);
    expect(useStore.getState().serviceCycles).toBe(previous.serviceCycles);
  });

  it('only renews clients in the current project manager’s portfolio', () => {
    const ownId = createPlan(); useStore.getState().activateClientPlan(ownId);
    const otherPm = { ...pm, id: 'other-monthly-pm', name: 'Other PM' };
    useStore.setState({ currentUser: otherPm, users: [pm, otherPm] });
    const otherId = createPlan(); useStore.getState().activateClientPlan(otherId);
    useStore.setState({ currentUser: pm });
    setDay(2026, 10, 9); useStore.getState().generateDueLocalServiceCycles();
    expect(useStore.getState().serviceCycles.filter(item => item.planId === ownId)).toHaveLength(2);
    expect(useStore.getState().serviceCycles.filter(item => item.planId === otherId)).toHaveLength(1);
    expect(useStore.getState().clientPlans.find(item => item.id === otherId)?.nextCycleStart).toBe('2026-10-09');
  });

  it('does not allow staff to generate commercial records', () => {
    const id = createPlan(); useStore.getState().activateClientPlan(id);
    useStore.setState({ currentUser: { ...pm, role: 'Staff' } });
    setDay(2026, 10, 9); useStore.getState().generateDueLocalServiceCycles();
    expect(useStore.getState().serviceCycles).toHaveLength(1);
  });

  it('copies effective monthly add-ons and excludes one-off work from the new cycle', () => {
    const id = createPlan(); const activation = useStore.getState().activateClientPlan(id);
    const plan = useStore.getState().clientPlans[0];
    for (const billingMode of ['monthly', 'one_off'] as const) useStore.getState().addAddon({
      clientId: plan.clientId, clientName: plan.clientName, planId: id, name: billingMode, platforms: [], quantity: 1, unitPriceMinor: 100,
      billingMode, targetCycleId: billingMode === 'one_off' ? activation.cycleId : undefined, effectiveFrom: '2026-10-09', isActive: true,
    });
    setDay(2026, 10, 9); useStore.getState().generateDueLocalServiceCycles();
    expect(useStore.getState().serviceCycles[1].addonSnapshots.map(item => item.name)).toEqual(['monthly']);
  });
});
