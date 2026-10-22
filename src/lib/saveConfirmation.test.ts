import { expect, it } from 'vitest';
import { planSaveSnapshot, sameSavedValue } from './saveConfirmation';
import type { ClientServicePlan } from '../types';

it('compares JSONB values independent of key order and omitted optional properties', () => {
  expect(sameSavedValue({ scope: [{ name: 'Design', price: 500, optional: undefined }], tax: 0 },
    { tax: 0, scope: [{ price: 500, name: 'Design' }] })).toBe(true);
  expect(sameSavedValue(['A', 'B'], ['B', 'A'])).toBe(false);
  expect(sameSavedValue(undefined, {})).toBe(false);
});

it('requires the submitted identity, scope, pricing and activation state, not audit metadata', () => {
  const plan = { id: 'plan', clientId: 'company', name: 'Monthly', status: 'Draft', startDate: '2026-10-30', billingDay: 30,
    serviceItems: [{ id: 'scope', name: 'Design', quantity: 1, unitPriceMinor: 500 }], discountType: 'none', discountValue: 0, taxRateBps: 0 } as ClientServicePlan;
  const snapshot = planSaveSnapshot(plan);
  expect(sameSavedValue(snapshot, planSaveSnapshot({ ...plan, updatedAt: 'server-time' }))).toBe(true);
  for (const change of [{ id: 'other' }, { clientId: 'other' }, { status: 'Active' as const }, { taxRateBps: 600 },
    { serviceItems: plan.serviceItems.map(item => ({ ...item, unitPriceMinor: 900 })) },
    { serviceItems: plan.serviceItems.map(item => ({ ...item, name: 'Changed scope' })) }]) {
    expect(sameSavedValue(snapshot, planSaveSnapshot({ ...plan, ...change }))).toBe(false);
  }
});
