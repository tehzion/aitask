import { defaultRolePermissions } from '../lib/access';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task, User } from '../types';
import { useStore } from './index';
import { nextRevisionBoundary } from '../lib/serviceManagement';

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
    expect(useStore.getState().scheduleClientPlanRevision(revision.planId!, '2026-10-09').ok).toBe(true);
    setDay(2026, 11, 9);
    useStore.getState().generateDueLocalServiceCycles();
    expect(useStore.getState().clientPlans.find(item => item.id === id)?.status).toBe('Ended');
    expect(useStore.getState().clientPlans.find(item => item.id === revision.planId)).toMatchObject({ status: 'Active', nextCycleStart: '2026-12-09' });
    expect(useStore.getState().serviceCycles[0]).toEqual(oldCycle);
    expect(useStore.getState().serviceCycles.slice(1).map(item => item.planId)).toEqual([revision.planId, revision.planId]);
    expect(useStore.getState().deliverables).toHaveLength(8);
  });

  it('schedules a draft created before a cycle rolled over for the next upcoming boundary', () => {
    const id = createPlan();
    useStore.getState().activateClientPlan(id);
    const revision = useStore.getState().createClientPlanRevision(id);
    expect(useStore.getState().clientPlans.find(item => item.id === revision.planId)?.effectiveFromCycleStart).toBe('2026-10-09');
    setDay(2026, 11, 4);
    useStore.getState().generateDueLocalServiceCycles();
    const source = useStore.getState().clientPlans.find(item => item.id === id)!;
    expect(source.nextCycleStart).toBe('2026-11-09');
    expect(nextRevisionBoundary(source, '2026-11-04')).toBe('2026-11-09');
    expect(useStore.getState().scheduleClientPlanRevision(revision.planId!, '2026-10-09').ok).toBe(false);
    expect(useStore.getState().scheduleClientPlanRevision(revision.planId!, '2026-11-09').ok).toBe(true);
    expect(useStore.getState().clientPlans.find(item => item.id === revision.planId)).toMatchObject({ revisionScheduleStatus: 'scheduled', effectiveFromCycleStart: '2026-11-09' });
  });

  it('starts a revision on a later billing date the person chose, and not before it', () => {
    const id = createPlan();
    useStore.getState().activateClientPlan(id);
    const revision = useStore.getState().createClientPlanRevision(id).planId!;
    const draft = () => useStore.getState().clientPlans.find(item => item.id === revision)!;
    // Not one of the plan's billing dates, or too far ahead.
    expect(useStore.getState().updateDraftClientPlan(revision, { startDate: '2026-12-15' })).toMatchObject({ ok: false, error: expect.stringContaining('billing dates') });
    expect(useStore.getState().updateDraftClientPlan(revision, { startDate: '2027-12-09' }).ok).toBe(false);
    expect(useStore.getState().updateDraftClientPlan(revision, { startDate: '2026-12-09', name: 'Later scope' }).ok).toBe(true);
    // The saved choice, not the first boundary, is what can now be scheduled.
    expect(useStore.getState().scheduleClientPlanRevision(revision, '2026-10-09').ok).toBe(false);
    expect(useStore.getState().scheduleClientPlanRevision(revision, '2026-12-09').ok).toBe(true);
    expect(draft()).toMatchObject({ revisionScheduleStatus: 'scheduled', startDate: '2026-12-09', effectiveFromCycleStart: '2026-12-09' });

    for (const [month, day] of [[10, 9], [11, 9]] as const) {
      setDay(2026, month, day); useStore.getState().generateDueLocalServiceCycles();
      expect(useStore.getState().clientPlans.find(item => item.id === id)?.status).toBe('Active');
      expect(draft().status).toBe('Draft');
    }
    setDay(2026, 12, 9); useStore.getState().generateDueLocalServiceCycles();
    expect(useStore.getState().clientPlans.find(item => item.id === id)?.status).toBe('Ended');
    expect(draft().status).toBe('Active');
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

  it('carries unresolved work into the next cycle without changing the source task', () => {
    const id = createPlan();
    const activated = useStore.getState().activateClientPlan(id);
    setDay(2026, 10, 9);
    useStore.getState().generateDueLocalServiceCycles();
    const state = useStore.getState();
    const sourceCycle = state.serviceCycles.find(cycle => cycle.id === activated.cycleId)!;
    const targetCycle = state.serviceCycles.find(cycle => cycle.id !== sourceCycle.id)!;
    const sourceDeliverable = state.deliverables.find(item => item.cycleId === sourceCycle.id)!;
    const sourceTask: Task = {
      id: 'carry-source', clientId: sourceCycle.clientId, clientName: sourceCycle.clientName,
      serviceCycleId: sourceCycle.id, deliverableId: sourceDeliverable.id, serviceType: 'Management',
      title: 'Unresolved handoff', description: 'Needs another cycle', department: 'Operation',
      assignedTo: '', createdBy: pm.id, startDate: sourceCycle.periodStart, dueDate: sourceCycle.periodEnd,
      priority: 'High', status: 'In Progress', completionPercentage: 40, isCompleted: false,
      revisionCount: 0, clientApprovalStatus: 'Pending', isRecurring: false,
    };
    useStore.setState(current => ({ tasks: [...current.tasks, sourceTask] }));

    const first = useStore.getState().carryForwardTaskToCycle(sourceTask.id, targetCycle.id);
    const second = useStore.getState().carryForwardTaskToCycle(sourceTask.id, targetCycle.id);
    expect(first.ok).toBe(true);
    expect(second).toEqual(first);
    const carried = useStore.getState().tasks.find(task => task.id === first.taskId)!;
    expect(carried).toMatchObject({ carriedFromTaskId: sourceTask.id, carriedFromCycleId: sourceCycle.id, serviceCycleId: targetCycle.id, status: 'Pending', completionPercentage: 0 });
    expect(useStore.getState().tasks.find(task => task.id === sourceTask.id)).toEqual(sourceTask);
    expect(useStore.getState().tasks.filter(task => task.carriedFromTaskId === sourceTask.id)).toHaveLength(1);
  });

  it('renews an ended plan as a new reviewed snapshot', () => {
    const id = createPlan('2026-09-30', 30);
    useStore.getState().activateClientPlan(id);
    expect(useStore.getState().setClientPlanStatus(id, 'Ended').ok).toBe(true);
    const source = structuredClone(useStore.getState().clientPlans.find(plan => plan.id === id)!);
    const renewal = useStore.getState().createClientPlanRevision(id);
    expect(renewal.ok).toBe(true);
    const draft = useStore.getState().clientPlans.find(plan => plan.id === renewal.planId)!;
    expect(draft).toMatchObject({ status: 'Draft', supersedesPlanId: source.id, startDate: '2026-10-30', billingDay: 30 });
    expect(useStore.getState().activateClientPlan(draft.id)).toMatchObject({ ok: true });
    const latest = useStore.getState().clientPlans.find(plan => plan.id === draft.id)!;
    expect(latest.status).toBe('Active');
    expect(useStore.getState().clientPlans.find(plan => plan.id === source.id)).toEqual(source);
    expect(useStore.getState().serviceCycles.map(cycle => cycle.periodStart)).toEqual(['2026-09-30', '2026-10-30']);
  });

  it('keeps carry-forward restricted to authorised cycle managers', () => {
    const id = createPlan();
    const activated = useStore.getState().activateClientPlan(id);
    setDay(2026, 10, 9);
    useStore.getState().generateDueLocalServiceCycles();
    const state = useStore.getState();
    const sourceCycle = state.serviceCycles.find(cycle => cycle.id === activated.cycleId)!;
    const targetCycle = state.serviceCycles.find(cycle => cycle.id !== sourceCycle.id)!;
    const sourceTask: Task = {
      id: 'restricted-carry-source', clientId: sourceCycle.clientId, clientName: sourceCycle.clientName,
      serviceCycleId: sourceCycle.id, serviceType: 'Management', title: 'Restricted handoff', description: '', department: 'Operation',
      assignedTo: '', createdBy: pm.id, startDate: sourceCycle.periodStart, dueDate: sourceCycle.periodEnd, priority: 'Medium',
      status: 'In Progress', completionPercentage: 20, isCompleted: false, revisionCount: 0, clientApprovalStatus: 'Pending', isRecurring: false,
    };
    useStore.setState(current => ({ tasks: [...current.tasks, sourceTask], currentUser: { ...pm, role: 'Staff' } }));
    expect(useStore.getState().carryForwardTaskToCycle(sourceTask.id, targetCycle.id).ok).toBe(false);
  });
  it('edits one pending revision while leaving a paused source and all existing months intact', () => {
    const id = createPlan(); useStore.getState().activateClientPlan(id);
    useStore.getState().setClientPlanStatus(id, 'Paused');
    const source = structuredClone(useStore.getState().clientPlans.find(plan => plan.id === id));
    const history = structuredClone(useStore.getState().serviceCycles);
    const revision = useStore.getState().createClientPlanRevision(id);
    expect(revision.ok).toBe(true);
    expect(useStore.getState().createClientPlanRevision(id)).toEqual(revision);
    expect(useStore.getState().updateDraftClientPlan(revision.planId!, { name: 'Future terms', billingDay: 15, taxRateBps: 600, discountType: 'fixed', discountValue: 1000 }).ok).toBe(true);
    expect(useStore.getState().scheduleClientPlanRevision(revision.planId!, '2026-10-09').ok).toBe(false);
    setDay(2026, 10, 10); useStore.getState().generateDueLocalServiceCycles();
    expect(useStore.getState().clientPlans.find(plan => plan.id === id)).toEqual(source);
    expect(useStore.getState().serviceCycles).toEqual(history);
  });

});

describe('PM scope-only plan changes', () => {
  it('preserves prices and discounts when the PM cannot view prices', () => {
    const id = createPlan();
    const before = structuredClone(useStore.getState().clientPlans.find(plan => plan.id === id)!);
    const pricing = structuredClone(useStore.getState().servicePricingSnapshots);
    useStore.setState({ currentUser: { ...pm, permissions: { ...defaultRolePermissions['Project Manager'], viewServicePrices: false } } });
    expect(useStore.getState().updateDraftClientPlan(id, {
      name: 'Scope only', serviceItems: before.serviceItems.map(item => ({ ...item, quantity: 3, unitPriceMinor: 0 })),
      discountType: 'none', discountValue: 0, taxRateBps: 0,
    }).ok).toBe(true);
    const saved = useStore.getState().clientPlans.find(plan => plan.id === id)!;
    expect(saved.serviceItems[0]).toMatchObject({ quantity: 3, unitPriceMinor: before.serviceItems[0].unitPriceMinor });
    expect([saved.discountType, saved.discountValue, saved.taxRateBps]).toEqual([before.discountType, before.discountValue, before.taxRateBps]);
    expect(useStore.getState().servicePricingSnapshots).toEqual(pricing);
  });
  it('rejects a PM outside the company portfolio without changing the plan', () => {
    const id = createPlan();
    const before = useStore.getState().clientPlans;
    useStore.setState({ currentUser: { ...pm, id: 'outside-pm' } });
    expect(useStore.getState().updateDraftClientPlan(id, { name: 'Unauthorized' }).ok).toBe(false);
    expect(useStore.getState().clientPlans).toBe(before);
  });
});
