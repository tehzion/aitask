import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { User } from '../types';
import { useStore } from './index';

const initial = useStore.getState();
const actor: User = { id: 'revision-date-pm', name: 'Revision PM', role: 'Project Manager', departments: ['Management'], isSuperAdmin: true };
beforeEach(() => useStore.setState({ ...initial, currentUser: actor, users: [actor], clients: [], projects: [], tasks: [],
  clientPlans: [], serviceCycles: [], deliverables: [], servicePricingSnapshots: [], addons: [], rolePermissions: [],
  backend: { ...initial.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 },
}, true));
afterEach(() => useStore.setState(initial, true));

const createRevision = () => {
  const created = useStore.getState().createClientWithPlan({ clientName: 'Revision Date Co', planName: 'RM2250 PACKAGE', origin: 'custom',
    serviceItems: [{ id: 'management', name: 'RM2250 PACKAGE', platforms: [], unit: 'month', quantity: 1, unitPriceMinor: 225000 }],
    startDate: '2026-09-30', billingDay: 30, discountType: 'none', discountValue: 0, taxRateBps: 800,
  });
  expect(created.ok).toBe(true);
  expect(useStore.getState().updateDraftClientPlan(created.planId!, { contractEndDate: '2026-10-03' }).ok).toBe(true);
  expect(useStore.getState().activateClientPlan(created.planId!).ok).toBe(true);
  const revision = useStore.getState().createClientPlanRevision(created.planId!);
  expect(revision.ok).toBe(true);
  return { originalId: created.planId!, revisionId: revision.planId! };
};

describe('contract reminders across plan revisions', () => {
  it('saves unrelated revision edits when the inherited reminder predates the revision start', () => {
    const { originalId, revisionId } = createRevision();
    const previousCycles = structuredClone(useStore.getState().serviceCycles);
    const previousDeliverables = structuredClone(useStore.getState().deliverables);
    const original = structuredClone(useStore.getState().clientPlans.find(plan => plan.id === originalId));
    expect(useStore.getState().clientPlans.find(plan => plan.id === revisionId)).toMatchObject({ startDate: '2026-10-30', contractEndDate: '2026-10-03' });
    expect(useStore.getState().updateDraftClientPlan(revisionId, { name: 'Revised RM2250 PACKAGE', taxRateBps: 600 })).toEqual({ ok: true });
    expect(useStore.getState().clientPlans.find(plan => plan.id === revisionId)).toMatchObject({ name: 'Revised RM2250 PACKAGE', taxRateBps: 600, contractEndDate: '2026-10-03', startDate: '2026-10-30' });
    expect(useStore.getState().clientPlans.find(plan => plan.id === originalId)).toEqual(original);
    expect(useStore.getState().serviceCycles).toEqual(previousCycles);
    expect(useStore.getState().deliverables).toEqual(previousDeliverables);
  });

  it('allows editing or clearing the reminder relative to the original contract start', () => {
    const { revisionId } = createRevision();
    expect(useStore.getState().updateDraftClientPlan(revisionId, { contractEndDate: '2026-10-10' }).ok).toBe(true);
    expect(useStore.getState().updateDraftClientPlan(revisionId, { contractEndDate: '' }).ok).toBe(true);
    expect(useStore.getState().clientPlans.find(plan => plan.id === revisionId)?.contractEndDate).toBeUndefined();
  });

  it('rejects reminders before the original start without changing saved data', () => {
    const { revisionId } = createRevision();
    const before = structuredClone(useStore.getState().clientPlans);
    expect(useStore.getState().updateDraftClientPlan(revisionId, { contractEndDate: '2026-09-29' }).ok).toBe(false);
    expect(useStore.getState().clientPlans).toEqual(before);
  });

  it('keeps the original contract boundary after multiple revisions and activation', () => {
    const { originalId, revisionId } = createRevision();
    useStore.setState(state => ({ clientPlans: state.clientPlans.map(plan => plan.id === originalId ? { ...plan, status: 'Ended' } : { ...plan, status: 'Active', nextCycleStart: '2026-11-30' }) }));
    const next = useStore.getState().createClientPlanRevision(revisionId);
    expect(next.ok).toBe(true);
    expect(useStore.getState().updateDraftClientPlan(next.planId!, { contractEndDate: '2026-10-10' }).ok).toBe(true);
    expect(useStore.getState().updateActivePlanDates(revisionId, { billingDay: 15, contractEndDate: '2026-10-03' }).ok).toBe(true);
    expect(useStore.getState().updateActivePlanDates(revisionId, { contractEndDate: '2026-09-29' }).ok).toBe(false);
  });
});
