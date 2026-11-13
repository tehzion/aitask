import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../../../app/store/workspaceStore';
import { defaultRolePermissions } from '../../../shared/authorization/access';
import type { ServiceCycle, User } from '../../../shared/types';
import { cyclePaymentSummary } from '../domain/cyclePayments';
import { makePricingSnapshot } from '../domain/serviceManagement';
const cycle: ServiceCycle = { id: 'cycle', clientId: 'client', clientName: 'Company', planId: 'plan', planRevision: 1, periodStart: '2026-01-01', periodEnd: '2026-01-31', currency: 'MYR', status: 'Completed', serviceItems: [{ id: 'item', name: 'Design', quantity: 1, unit: 'item', unitPriceMinor: 10000, platforms: [] }], addonSnapshots: [], discountType: 'percent', discountValue: 1000, taxRateBps: 600, createdAt: '', updatedAt: '' };
const actor = { id: 'pm', name: 'PM', role: 'Project Manager', isSuperAdmin: true } as User;
beforeEach(() => useStore.setState({ currentUser: actor, rolePermissions: [], clients: [{ id: 'client', clientName: 'Company', createdBy: 'pm', createdAt: '', updatedAt: '' }], serviceCycles: [structuredClone(cycle)], serviceCyclePayments: [], servicePricingSnapshots: [], backend: { ...useStore.getState().backend, mode: 'local', isSaving: false, hasLocalChanges: false, status: 'local', pendingMutations: 0 } }));
const summary = () => cyclePaymentSummary(cycle, useStore.getState().servicePricingSnapshots, useStore.getState().serviceCyclePayments);
describe('monthly receipts', () => {
  it('starts without invented payments and uses frozen tax and discount', () => {
    expect(summary()).toMatchObject({ total: 9540, received: 0, remaining: 9540, status: 'Not recorded' });
  });
  it('settles one payment independently of operational status', () => {
    expect(useStore.getState().recordServiceCyclePayment('cycle', 9540, '2026-01-10').ok).toBe(true);
    expect(summary()).toMatchObject({ status: 'Full payment', received: 9540, remaining: 0 });
    expect(useStore.getState().serviceCycles[0].status).toBe('Completed');
  });
  it.each([[4770, 4770], [2000, 7540]])('preserves instalments %s + %s', (first, second) => {
    const store = useStore.getState();
    expect(store.recordServiceCyclePayment('cycle', first, '2026-01-10').ok).toBe(true);
    expect(summary().status).toBe('Half payment');
    expect(store.recordServiceCyclePayment('cycle', second, '2026-01-15').ok).toBe(true);
    expect(summary()).toMatchObject({ status: 'Full payment', received: 9540 });
    expect(summary().receipts.map(item => item.amountMinor)).toEqual([first, second]);
  });
  it('voids and replaces while retaining provenance', () => {
    const store = useStore.getState();
    const receipt = store.recordServiceCyclePayment('cycle', 2000, '2026-01-10');
    expect(store.voidServiceCyclePayment(receipt.id!, '').ok).toBe(false);
    expect(store.voidServiceCyclePayment(receipt.id!, 'Wrong amount').ok).toBe(true);
    expect(store.voidServiceCyclePayment(receipt.id!, 'Again').ok).toBe(false);
    expect(summary().status).toBe('Not recorded');
    store.recordServiceCyclePayment('cycle', 3000, '2026-01-10');
    expect(summary()).toMatchObject({ received: 3000, remaining: 6540 });
    expect(summary().receipts[0]).toMatchObject({ voidedBy: 'pm', voidReason: 'Wrong amount' });
  });
  it.each([0, -1, NaN, Infinity, 1.2, 9541])('rejects invalid or excessive amounts %s', amount => {
    expect(useStore.getState().recordServiceCyclePayment('cycle', amount, '2026-01-10').ok).toBe(false);
  });
  it('rejects invalid and future dates', () => {
    for (const date of ['invalid', '2026-02-30', '2999-01-01']) expect(useStore.getState().recordServiceCyclePayment('cycle', 100, date).ok).toBe(false);
  });
  it('prefers only the cycle snapshot over live plan prices', () => {
    const pricing = makePricingSnapshot({ id: 'price', clientId: 'client', parentId: 'cycle', parentType: 'service_cycle', items: cycle.serviceItems, discountType: 'fixed', discountValue: 1000, taxRateBps: 1000, now: '' });
    useStore.setState({ servicePricingSnapshots: [pricing] });
    expect(summary().total).toBe(9900);
  });
  it('requires internal cycle management, prices and client scope', () => {
    for (const user of [null, { ...actor, isSuperAdmin: false, role: 'Client' }, { ...actor, id: 'outside-pm', isSuperAdmin: false, permissions: defaultRolePermissions['Project Manager'] }, { ...actor, isSuperAdmin: false, permissions: { ...defaultRolePermissions['Project Manager'], viewServicePrices: false } }, { ...actor, isSuperAdmin: false, permissions: { ...defaultRolePermissions['Project Manager'], manageServiceCycles: false } }]) {
      useStore.setState({ currentUser: user as User | null });
      expect(useStore.getState().recordServiceCyclePayment('cycle', 100, '2026-01-10').ok).toBe(false);
    }
  });
});
