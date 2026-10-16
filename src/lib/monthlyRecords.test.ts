import { describe, expect, it } from 'vitest';
import type { ServiceCycle } from '../types';
import { resolveMonthlyRecord } from './monthlyRecords';

const cycle = (overrides: Partial<ServiceCycle>): ServiceCycle => ({
  id: 'c1', clientId: 'client-1', clientName: 'Acme', planId: 'plan-1', planRevision: 1,
  periodStart: '2026-09-01', periodEnd: '2026-09-30', status: 'Published', currency: 'MYR',
  serviceItems: [], addonSnapshots: [], discountType: 'none', discountValue: 0, taxRateBps: 0,
  createdAt: '', updatedAt: '', ...overrides,
});

describe('resolveMonthlyRecord plan scoping', () => {
  it('hides cycles whose plan is outside the provided scope', () => {
    const cycles = [cycle({ id: 'a', planId: 'plan-1' }), cycle({ id: 'b', planId: 'foreign' })];
    const result = resolveMonthlyRecord(cycles, 'client-1', '2026-09-15', null, new Set(['plan-1']));
    expect(result.available.map(item => item.id)).toEqual(['a']);
  });

  it('keeps legacy cycles that do not carry a planId', () => {
    const cycles = [cycle({ id: 'legacy', planId: '' })];
    const result = resolveMonthlyRecord(cycles, 'client-1', '2026-09-15', null, new Set(['plan-1']));
    expect(result.available.map(item => item.id)).toEqual(['legacy']);
  });

  it('does not scope when the caller provides no plan ids', () => {
    const cycles = [cycle({ id: 'a', planId: 'plan-1' }), cycle({ id: 'b', planId: 'plan-2' })];
    expect(resolveMonthlyRecord(cycles, 'client-1', '2026-09-15').available.map(item => item.id)).toEqual(['a', 'b']);
  });
});
