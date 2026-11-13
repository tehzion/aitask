import type { ServiceCycle, ServiceCyclePayment, ServicePricingSnapshot } from '../../../shared/types';
import { applyPricingSnapshot, calculatePlanTotalMinor } from './serviceManagement';

// Never resolve through a plan: a cycle's own prices are its financial history.
export const cycleChargeMinor = (cycle: ServiceCycle, snapshots: ServicePricingSnapshot[]) => {
  const pricing = snapshots.find(item => item.parentType === 'service_cycle' && item.parentId === cycle.id && item.clientId === cycle.clientId);
  if (pricing && Number.isSafeInteger(pricing.totalMinor) && pricing.totalMinor >= 0) return pricing.totalMinor;
  const frozen = applyPricingSnapshot(cycle, pricing);
  return calculatePlanTotalMinor(frozen.serviceItems, frozen.discountType, frozen.discountValue, frozen.taxRateBps).total;
};
export const cyclePaymentSummary = (cycle: ServiceCycle, snapshots: ServicePricingSnapshot[], payments: ServiceCyclePayment[]) => {
  const receipts = payments.filter(item => item.cycleId === cycle.id && item.clientId === cycle.clientId);
  const total = cycleChargeMinor(cycle, snapshots);
  const active = receipts.filter(item => !item.voidedAt);
  const received = active.reduce((sum, item) => sum + item.amountMinor, 0);
  return { receipts, total, received, remaining: Math.max(0, total - received), status: !active.length ? 'Not recorded' : received >= total ? 'Full payment' : 'Half payment' };
};
