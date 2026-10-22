import type { ClientServicePlan } from '../types';

// JSONB key order and omitted optional fields must not change confirmation.
export const sameSavedValue = (left: unknown, right: unknown): boolean => {
  const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value)
      .filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : value;
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
};

export const planSaveSnapshot = (plan: ClientServicePlan) => ({
  id: plan.id, clientId: plan.clientId, name: plan.name, status: plan.status,
  startDate: plan.startDate, billingDay: plan.billingDay, contractEndDate: plan.contractEndDate || '',
  serviceItems: plan.serviceItems, discountType: plan.discountType, discountValue: plan.discountValue, taxRateBps: plan.taxRateBps,
  effectiveFromCycleStart: plan.effectiveFromCycleStart || '', revisionScheduleStatus: plan.revisionScheduleStatus || 'draft',
  supersedesPlanId: plan.supersedesPlanId || '',
});

export const PLAN_SUBMISSION_MISSING = 'The submitted plan change is no longer available. Your draft has been kept. Review and save again.';
