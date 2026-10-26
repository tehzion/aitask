import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { User } from '../types';
import { SHORT_VIDEO_WORKFLOW_TEMPLATE, snapshotWorkflow } from '../lib/serviceManagement';
import { useStore } from './index';

const initialState = useStore.getState();
const admin: User = { id: 'admin-service', name: 'Service Project Manager', role: 'Project Manager', departments: ['Management'], department: 'Management' };

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

  it('tracks task-free management services manually and keeps progress based on delivery', () => {
    const created = useStore.getState().createClientWithPlan({
      clientName: 'Ads Client', planName: 'Ads Management', origin: 'custom',
      serviceItems: [{ id: 'ads-fee', name: 'ADS Management Fee', platforms: [], unit: 'month', quantity: 1, unitPriceMinor: 10000 }],
      startDate: '2026-10-01', billingDay: 1, discountType: 'none', discountValue: 0, taxRateBps: 0,
    });
    expect(created.ok).toBe(true);
    const activated = useStore.getState().activateClientPlan(created.planId!);
    expect(activated.ok).toBe(true);
    const cycleId = activated.cycleId!;
    expect(useStore.getState().setServiceCycleStatus(cycleId, 'Published').ok).toBe(true);
    const deliverableId = useStore.getState().deliverables[0].id;

    for (const status of ['In Progress', 'Ready', 'Planned', 'Delivered', 'In Progress'] as const) {
      expect(useStore.getState().updateDeliverableStatus(deliverableId, status)).toEqual({ ok: true });
      expect(useStore.getState().deliverables[0]).toMatchObject({
        status, taskIds: [], deliveredAt: status === 'Delivered' ? expect.any(String) : undefined,
      });
      expect(useStore.getState().serviceCycles[0].status).toBe(status === 'Delivered' ? 'Completed' : 'Published');
    }
  });

  it('rejects impossible cycle transitions and incomplete completion', () => {
    const created = useStore.getState().createClientWithPlan({
      clientName: 'Cycle Guard Co', planName: 'Guarded cycle', origin: 'custom',
      serviceItems: [{ id: 'guarded-service', name: 'Design', platforms: [], unit: 'post', quantity: 1, unitPriceMinor: 10000 }],
      startDate: '2026-10-01', billingDay: 1, discountType: 'none', discountValue: 0, taxRateBps: 0,
    });
    const activation = useStore.getState().activateClientPlan(created.planId!);
    const cycleId = activation.cycleId!;

    expect(useStore.getState().setServiceCycleStatus(cycleId, 'Completed')).toEqual({
      ok: false,
      error: 'This cycle status transition is not allowed.',
    });
    expect(useStore.getState().setServiceCycleStatus(cycleId, 'Published').ok).toBe(true);
    expect(useStore.getState().setServiceCycleStatus(cycleId, 'Completed')).toEqual({
      ok: false,
      error: 'Complete every required delivery before completing this cycle.',
    });

    useStore.setState(state => ({
      deliverables: state.deliverables.map(item => item.cycleId === cycleId ? { ...item, status: 'Delivered' } : item),
    }));
    expect(useStore.getState().setServiceCycleStatus(cycleId, 'Completed').ok).toBe(true);
    expect(useStore.getState().setServiceCycleStatus(cycleId, 'Draft')).toEqual({
      ok: false,
      error: 'This cycle status transition is not allowed.',
    });
    expect(useStore.getState().serviceCycles.find(item => item.id === cycleId)?.status).toBe('Completed');
  });

  it('does not return an active plan with a started cycle to Draft', () => {
    const created = useStore.getState().createClientWithPlan({
      clientName: 'Plan Guard Co', planName: 'Guarded plan', origin: 'custom',
      serviceItems: [{ id: 'plan-service', name: 'Design', platforms: [], unit: 'post', quantity: 1, unitPriceMinor: 10000 }],
      startDate: '2026-10-01', billingDay: 1, discountType: 'none', discountValue: 0, taxRateBps: 0,
    });
    const activation = useStore.getState().activateClientPlan(created.planId!);
    expect(useStore.getState().setServiceCycleStatus(activation.cycleId!, 'Published').ok).toBe(true);

    expect(useStore.getState().setClientPlanStatus(created.planId!, 'Draft')).toEqual({
      ok: false,
      error: 'Active plans with started cycles cannot return to Draft.',
    });
    expect(useStore.getState().clientPlans.find(item => item.id === created.planId)?.status).toBe('Active');
  });

  it('lets a Project Manager edit draft plan dates and active billing/contract dates', () => {
    const created = useStore.getState().createClientWithPlan({
      clientName: 'Dates Co', planName: 'Plan', origin: 'custom',
      serviceItems: [{ id: 'svc-dates', name: 'Design', platforms: [], unit: 'post', quantity: 1, unitPriceMinor: 10000 }],
      startDate: '2026-08-15', billingDay: 15, discountType: 'none', discountValue: 0, taxRateBps: 0,
    });
    const planId = created.planId!;

    const rejected = useStore.getState().updateDraftClientPlan(planId, { startDate: '2026-09-01', contractEndDate: '2025-01-01' });
    expect(rejected.ok).toBe(false);

    const draft = useStore.getState().updateDraftClientPlan(planId, { startDate: '2026-09-01', billingDay: 5, contractEndDate: '2027-09-01' });
    expect(draft.ok).toBe(true);
    expect(useStore.getState().clientPlans.find(plan => plan.id === planId)).toMatchObject({ startDate: '2026-09-01', billingDay: 5, contractEndDate: '2027-09-01' });

    expect(useStore.getState().activateClientPlan(planId).ok).toBe(true);
    const active = useStore.getState().updateActivePlanDates(planId, { billingDay: 20, contractEndDate: '2028-01-01' });
    expect(active.ok).toBe(true);
    expect(useStore.getState().clientPlans.find(plan => plan.id === planId)).toMatchObject({ startDate: '2026-09-01', billingDay: 20, contractEndDate: '2028-01-01' });
  });

  it('preserves the contract end date when a draft update omits it and clears it on empty', () => {
    const created = useStore.getState().createClientWithPlan({
      clientName: 'Preserve Co', planName: 'Plan', origin: 'custom',
      serviceItems: [{ id: 'svc-preserve', name: 'Design', platforms: [], unit: 'post', quantity: 1, unitPriceMinor: 10000 }],
      startDate: '2026-08-15', billingDay: 15, discountType: 'none', discountValue: 0, taxRateBps: 0,
    });
    const planId = created.planId!;
    expect(useStore.getState().updateDraftClientPlan(planId, { contractEndDate: '2027-08-15' }).ok).toBe(true);

    // A name-only update must not wipe the stored contract end date.
    expect(useStore.getState().updateDraftClientPlan(planId, { name: 'Renamed plan' }).ok).toBe(true);
    expect(useStore.getState().clientPlans.find(plan => plan.id === planId)).toMatchObject({
      name: 'Renamed plan',
      contractEndDate: '2027-08-15',
    });

    // Passing an empty string clears it.
    expect(useStore.getState().updateDraftClientPlan(planId, { contractEndDate: '' }).ok).toBe(true);
    expect(useStore.getState().clientPlans.find(plan => plan.id === planId)?.contractEndDate).toBeUndefined();
  });

  it('keeps commercial actions Project Manager-only', () => {
    useStore.setState({ currentUser: { ...admin, role: 'Staff', departments: ['Designer'], department: 'Designer' } });
    const result = useStore.getState().createClientWithPlan({
      clientName: 'Blocked', planName: 'Plan', origin: 'custom', serviceItems: [], startDate: '2026-08-15', billingDay: 15,
      discountType: 'none', discountValue: 0, taxRateBps: 0,
    });
    expect(result.ok).toBe(false);
    expect(useStore.getState().clients).toEqual([]);
  });

  it('creates a draft plan for an existing client without creating another client', () => {
    const client = { id: 'existing-client-plan', clientName: 'Existing Company', createdBy: admin.id, createdAt: '2026-09-10', updatedAt: '2026-09-10' };
    useStore.setState({ clients: [client] });

    const created = useStore.getState().createClientPlan(client.id, {
      planName: 'Growth',
      origin: 'custom',
      serviceItems: [{ id: 'existing-service', name: 'Design', platforms: [], unit: 'post', quantity: 1, unitPriceMinor: 10000 }],
      startDate: '2026-09-10',
      billingDay: 10,
      discountType: 'none',
      discountValue: 0,
      taxRateBps: 0,
    });

    expect(created.ok).toBe(true);
    expect(useStore.getState().clients).toEqual([client]);
    expect(useStore.getState().clientPlans[0]).toMatchObject({ clientId: client.id, clientName: client.clientName, name: 'Growth' });
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
    expect(useStore.getState().tasks.filter(task => task.deliverableId === deliverableId).every(task => task.startDate === '2026-08-15' && (!task.dueDate || task.startDate <= task.dueDate))).toBe(true);
    expect(first.ok).toBe(true);
    expect(second.taskIds).toEqual(first.taskIds);
    expect(useStore.getState().tasks).toHaveLength(10);
    expect(useStore.getState().tasks.every(task => task.assignedTo === '')).toBe(true);
    expect(useStore.getState().tasks.filter(task => task.visibility === 'client-visible')).toHaveLength(3);
    expect(useStore.getState().tasks[1].predecessorTaskIds).toEqual([useStore.getState().tasks[0].id]);

    const reviewer: User = { id: 'video-hod', name: 'Video HOD', role: 'HOD', departments: ['Operation', 'Video Shooting', 'Video Editor'] };
    const staff: User = { id: 'video-staff', name: 'Video Staff', role: 'Staff', departments: ['Operation', 'Video Shooting', 'Video Editor'] };
    useStore.setState({ users: [admin, reviewer, staff] });
    useStore.getState().tasks.forEach(task => {
      useStore.setState({ currentUser: admin });
      expect(useStore.getState().updateTaskAssignee(task.id, reviewer.id).ok).toBe(true);
      useStore.setState({ currentUser: reviewer });
      expect(useStore.getState().updateTaskAssignee(task.id, staff.id).ok).toBe(true);
      useStore.setState({ currentUser: admin });
      expect(useStore.getState().updateTaskAttachment(task.id, `https://example.com/output/${task.id}`).ok).toBe(true);
      useStore.setState({ currentUser: staff });
      expect(useStore.getState().updateTaskStatus(task.id, 'Waiting Approval').ok).toBe(true);
      useStore.setState({ currentUser: reviewer });
      expect(useStore.getState().updateTaskStatus(task.id, 'Approved').ok).toBe(true);
      useStore.setState({ currentUser: admin });
      expect(useStore.getState().updateTaskStatus(task.id, 'Completed').ok).toBe(true);
    });
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

  it('makes a single copied next-month plan when renewal is requested twice', () => {
    const created = useStore.getState().createClientWithPlan({
      clientName: 'Manual Renewal Client', planName: 'October Social Plan', origin: 'custom',
      serviceItems: [{ id: 'social-service', name: 'Social management', platforms: ['Instagram'], unit: 'month', quantity: 1, unitPriceMinor: 200000 }],
      startDate: '2026-09-30', billingDay: 30, discountType: 'none', discountValue: 0, taxRateBps: 0,
    });
    const activated = useStore.getState().activateClientPlan(created.planId!);
    const active = useStore.getState().clientPlans.find(plan => plan.id === created.planId)!;
    const existingCycle = structuredClone(useStore.getState().serviceCycles.find(cycle => cycle.id === activated.cycleId)!);

    const first = useStore.getState().createClientPlanRevision(active.id);
    const second = useStore.getState().createClientPlanRevision(active.id);

    expect(first).toMatchObject({ ok: true });
    expect(second).toEqual(first);
    const nextPlans = useStore.getState().clientPlans.filter(plan => plan.supersedesPlanId === active.id && plan.status === 'Draft');
    expect(nextPlans).toHaveLength(1);
    expect(nextPlans[0]).toMatchObject({
      effectiveFromCycleStart: '2026-10-30',
      billingDay: 30,
      serviceItems: active.serviceItems,
    });
    expect(useStore.getState().serviceCycles).toEqual([existingCycle]);
    expect(useStore.getState().servicePricingSnapshots.some(snapshot => snapshot.parentId === nextPlans[0].id)).toBe(true);
  });
});
