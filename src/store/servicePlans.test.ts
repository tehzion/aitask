import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { User } from '../types';
import { SHORT_VIDEO_WORKFLOW_TEMPLATE, snapshotWorkflow } from '../lib/serviceManagement';
import { useStore } from './index';

const initialState = useStore.getState();
const admin: User = { id: 'admin-service', name: 'Service Admin', role: 'Admin', departments: ['Management'], department: 'Management' };

describe('client service plan store', () => {
  beforeEach(() => {
    useStore.setState({
      ...initialState, currentUser: admin, users: [admin], clients: [], projects: [], tasks: [], servicePackages: [], clientPlans: [], serviceCycles: [], deliverables: [], cycleComments: [], addons: [], serviceWorkflowTemplates: [structuredClone(SHORT_VIDEO_WORKFLOW_TEMPLATE)], servicePricingSnapshots: [],
      backend: { ...initialState.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 },
    }, true);
  });
  afterEach(() => useStore.setState(initialState, true));

  it('creates a client and draft plan atomically, then activates one cycle', () => {
    const created = useStore.getState().createClientWithPlan({
      clientName: 'Acme', planName: 'Growth', origin: 'custom',
      serviceItems: [{ id: 'service-1', name: 'Design', platforms: ['Instagram'], unit: 'post', quantity: 2, unitPriceMinor: 10000 }],
      startDate: '2026-08-15', billingDay: 15, discountType: 'none', discountValue: 0, taxRateBps: 0,
    });
    expect(created.ok).toBe(true);
    expect(useStore.getState().clients).toHaveLength(1);
    expect(useStore.getState().clientPlans[0]?.status).toBe('Draft');

    const activated = useStore.getState().activateClientPlan(created.planId!);
    expect(activated.ok).toBe(true);
    expect(useStore.getState().clientPlans[0]?.status).toBe('Active');
    expect(useStore.getState().serviceCycles).toHaveLength(1);
    expect(useStore.getState().deliverables).toHaveLength(2);

    expect(useStore.getState().activateClientPlan(created.planId!).ok).toBe(false);
    expect(useStore.getState().serviceCycles).toHaveLength(1);
  });

  it('keeps commercial actions admin-only', () => {
    useStore.setState({ currentUser: { ...admin, role: 'Staff', departments: ['Designer'], department: 'Designer' } });
    const result = useStore.getState().createClientWithPlan({
      clientName: 'Blocked', planName: 'Plan', origin: 'custom', serviceItems: [], startDate: '2026-08-15', billingDay: 15,
      discountType: 'none', discountValue: 0, taxRateBps: 0,
    });
    expect(result.ok).toBe(false);
    expect(useStore.getState().clients).toEqual([]);
  });

  it('creates an idempotent frozen task chain and derives delivery progress', () => {
    const created = useStore.getState().createClientWithPlan({
      clientName: 'Video Client', planName: 'Video Plan', origin: 'custom',
      serviceItems: [{ id: 'video-service', name: 'Short Video', platforms: ['TikTok'], unit: 'video', quantity: 1, unitPriceMinor: 25000, workflow: snapshotWorkflow(SHORT_VIDEO_WORKFLOW_TEMPLATE) }],
      startDate: '2026-08-15', billingDay: 15, discountType: 'none', discountValue: 0, taxRateBps: 0,
    });
    const activated = useStore.getState().activateClientPlan(created.planId!);
    const cycleId = activated.cycleId!;
    useStore.getState().setServiceCycleStatus(cycleId, 'Published');
    const deliverableId = useStore.getState().deliverables[0].id;
    const first = useStore.getState().generateDeliverableTaskChain(deliverableId);
    const second = useStore.getState().generateDeliverableTaskChain(deliverableId);
    expect(first.ok).toBe(true);
    expect(second.taskIds).toEqual(first.taskIds);
    expect(useStore.getState().tasks).toHaveLength(10);
    expect(useStore.getState().tasks.every(task => task.assignedTo === '')).toBe(true);
    expect(useStore.getState().tasks.filter(task => task.visibility === 'client-visible')).toHaveLength(3);
    expect(useStore.getState().tasks[1].predecessorTaskIds).toEqual([useStore.getState().tasks[0].id]);

    useStore.getState().tasks.forEach(task => useStore.getState().updateTaskStatus(task.id, 'Completed'));
    expect(useStore.getState().deliverables[0].status).toBe('Ready');
    useStore.getState().updateDeliverableStatus(deliverableId, 'Delivered');
    expect(useStore.getState().serviceCycles[0].status).toBe('Completed');
    useStore.getState().updateTaskStatus(useStore.getState().tasks[0].id, 'In Progress');
    expect(useStore.getState().deliverables[0].status).toBe('In Progress');
    expect(useStore.getState().serviceCycles[0].status).toBe('Published');
  });

  it('schedules active-plan revisions for the next cycle without changing history', () => {
    const created = useStore.getState().createClientWithPlan({
      clientName: 'Revision Client', planName: 'Growth', origin: 'custom',
      serviceItems: [{ id: 'service-1', name: 'Design', platforms: ['Instagram'], unit: 'post', quantity: 2, unitPriceMinor: 10000 }],
      startDate: '2026-08-15', billingDay: 15, discountType: 'none', discountValue: 0, taxRateBps: 0,
    });
    useStore.getState().activateClientPlan(created.planId!);
    const active = useStore.getState().clientPlans.find(plan => plan.id === created.planId)!;
    const historicalCycle = structuredClone(useStore.getState().serviceCycles[0]);
    const revision = useStore.getState().createClientPlanRevision(active.id);
    expect(revision.ok).toBe(true);
    const draft = useStore.getState().clientPlans.find(plan => plan.id === revision.planId)!;
    expect(draft.supersedesPlanId).toBe(active.id);
    expect(draft.effectiveFromCycleStart).toBe(active.nextCycleStart);
    useStore.getState().updateDraftClientPlan(draft.id, { serviceItems: [{ ...draft.serviceItems[0], quantity: 5, unitPriceMinor: 12000 }] });
    expect(useStore.getState().clientPlans.find(plan => plan.id === active.id)?.serviceItems[0].quantity).toBe(2);
    expect(useStore.getState().serviceCycles[0]).toEqual(historicalCycle);
  });
});
