import { describe, expect, it } from 'vitest';
import { halfPaymentMinor } from './cyclePayments';

describe('halfPaymentMinor', () => {
  it('prefills half of the monthly total when nothing has been received', () => {
    expect(halfPaymentMinor({ total: 100001, remaining: 100001 })).toBe(50001);
  });

  it('never prefills more than the remaining balance', () => {
    expect(halfPaymentMinor({ total: 100000, remaining: 30000 })).toBe(30000);
    expect(halfPaymentMinor({ total: 100000, remaining: 50000 })).toBe(50000);
  });
});
