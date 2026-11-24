import { describe, expect, it } from 'vitest';
import type { ServiceCycle, ServiceCyclePayment, ServicePricingSnapshot } from '../types';
import { getUnpaidMonths } from './unpaidMonths';

const cycle = (id: string, periodStart: string, periodEnd: string, status: ServiceCycle['status'] = 'Published'): ServiceCycle => ({
  id, clientId: 'c1', clientName: 'Acme', planId: 'p1', planRevision: 1, periodStart, periodEnd, status, currency: 'MYR',
  serviceItems: [{ id: 's', name: 'Ads', platforms: [], unit: 'month', quantity: 1, unitPriceMinor: 100000 }],
  discountType: 'none', discountValue: 0, taxRateBps: 0, createdAt: '', updatedAt: '',
});
const payment = (cycleId: string, amountMinor: number, voidedAt?: string): ServiceCyclePayment => ({
  id: `pay-${cycleId}-${amountMinor}`, cycleId, clientId: 'c1', amountMinor, paymentDate: '2026-11-01', voidedAt,
} as ServiceCyclePayment);
const none: ServicePricingSnapshot[] = [];

describe('getUnpaidMonths', () => {
  const cycles = [cycle('nov', '2026-11-01', '2026-11-30'), cycle('oct', '2026-10-01', '2026-10-31'), cycle('dec', '2026-12-01', '2026-12-31'), cycle('draft', '2026-09-01', '2026-09-30', 'Draft')];

  it('lists started, owed months oldest first and ignores future and draft months', () => {
    const rows = getUnpaidMonths(cycles, none, [], '2026-11-24');
    expect(rows.map(row => row.cycleId)).toEqual(['oct', 'nov']);
    expect(rows[0]).toMatchObject({ remainingMinor: 100000, daysPastEnd: 24 });
    expect(rows[1].daysPastEnd).toBe(0);
  });

  it('shows what is left on a part-paid month, drops paid ones, and counts voided receipts as unpaid', () => {
    const rows = getUnpaidMonths(cycles, none, [payment('oct', 100000), payment('nov', 40000), payment('nov', 60000, '2026-11-02')], '2026-11-24');
    expect(rows.map(row => row.cycleId)).toEqual(['nov']);
    expect(rows[0]).toMatchObject({ receivedMinor: 40000, remainingMinor: 60000 });
  });
});
