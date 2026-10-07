import { describe, expect, it } from 'vitest';
import type { ServiceCycle } from '../types';
import { getContractDaysRemaining, getCurrentPlanCycle } from './dashboardData';

const now = new Date(2026, 9, 7, 14);
const plan = { id: 'active-plan', clientId: 'client-1' };
const cycle = (overrides: Partial<ServiceCycle> = {}): ServiceCycle => ({
  id: 'october', clientId: plan.clientId, clientName: 'Audit Company', planId: plan.id,
  planRevision: 1, periodStart: '2026-10-01', periodEnd: '2026-10-31', status: 'Published',
  currency: 'MYR', serviceItems: [], addonSnapshots: [], discountType: 'none',
  discountValue: 0, taxRateBps: 0, createdAt: '2026-10-01', updatedAt: '2026-10-01',
  ...overrides,
});

describe('dashboard calendar-day renewals', () => {
  it('keeps the 30-day limit independent of the time of day', () => {
    expect(getContractDaysRemaining('2026-11-06', now)).toBe(30);
    expect(getContractDaysRemaining('2026-11-07', now)).toBe(31);
    expect(getContractDaysRemaining('2026-11-06', new Date(2026, 9, 7, 23, 59))).toBe(30);
  });

  it('distinguishes today, expired contracts and invalid or absent dates', () => {
    expect(getContractDaysRemaining('2026-10-07', now)).toBe(0);
    expect(getContractDaysRemaining('2026-10-06', now)).toBe(-1);
    expect(getContractDaysRemaining(undefined, now)).toBeNull();
    expect(getContractDaysRemaining('invalid', now)).toBeNull();
  });
});

describe('current active-plan delivery cycle', () => {
  it('selects the current published cycle instead of a later future cycle', () => {
    const current = cycle();
    expect(getCurrentPlanCycle(plan, [
      cycle({ id: 'future', periodStart: '2026-11-01', periodEnd: '2026-11-30' }),
      current,
    ], now)).toBe(current);
  });

  it('returns no current cycle when only historical cycles exist', () => {
    expect(getCurrentPlanCycle(plan, [cycle({ periodStart: '2026-09-01', periodEnd: '2026-09-30', status: 'Completed' })], now)).toBeUndefined();
  });

  it('does not mix another plan, another client, drafts or cancelled cycles into progress', () => {
    expect(getCurrentPlanCycle(plan, [
      cycle({ planId: 'old-plan' }), cycle({ clientId: 'other-client' }),
      cycle({ status: 'Draft' }), cycle({ status: 'Cancelled' }),
    ], now)).toBeUndefined();
  });

  it('includes both boundary days and supports billing cycles spanning months', () => {
    const billing = cycle({ periodStart: '2026-09-15', periodEnd: '2026-10-14', status: 'Completed' });
    expect(getCurrentPlanCycle(plan, [billing], new Date(2026, 8, 15))).toBe(billing);
    expect(getCurrentPlanCycle(plan, [billing], new Date(2026, 9, 14, 23, 59))).toBe(billing);
    expect(getCurrentPlanCycle(plan, [billing], new Date(2026, 9, 15))).toBeUndefined();
  });

  it('ignores malformed or inverted periods', () => {
    expect(getCurrentPlanCycle(plan, [
      cycle({ periodStart: 'invalid' }), cycle({ periodEnd: '' }),
      cycle({ periodStart: '2026-10-31', periodEnd: '2026-10-01' }),
    ], now)).toBeUndefined();
  });
});
