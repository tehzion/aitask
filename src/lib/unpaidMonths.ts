import type { ServiceCycle, ServiceCyclePayment, ServicePricingSnapshot } from '../types';
import { cyclePaymentSummary } from './cyclePayments';

export interface UnpaidMonth {
  cycleId: string;
  clientId: string;
  clientName: string;
  periodStart: string;
  periodEnd: string;
  totalMinor: number;
  receivedMinor: number;
  remainingMinor: number;
  /** Whole days since the month ended; 0 while the month is still running. */
  daysPastEnd: number;
}

const DAY_MS = 86_400_000;
const dayNumber = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);

/**
 * Published or completed months that have started and still have money owed,
 * oldest month first. Drafts and cancelled months are not owed anything yet.
 */
export const getUnpaidMonths = (
  cycles: ServiceCycle[],
  snapshots: ServicePricingSnapshot[],
  payments: ServiceCyclePayment[],
  today: string,
): UnpaidMonth[] => cycles
  .filter(cycle => (cycle.status === 'Published' || cycle.status === 'Completed') && cycle.periodStart <= today)
  .map(cycle => {
    const summary = cyclePaymentSummary(cycle, snapshots, payments);
    return {
      cycleId: cycle.id, clientId: cycle.clientId, clientName: cycle.clientName,
      periodStart: cycle.periodStart, periodEnd: cycle.periodEnd,
      totalMinor: summary.total, receivedMinor: summary.received, remainingMinor: summary.remaining,
      daysPastEnd: Math.max(0, dayNumber(today) - dayNumber(cycle.periodEnd)),
    };
  })
  .filter(row => row.totalMinor > 0 && row.remainingMinor > 0)
  .sort((a, b) => a.periodStart.localeCompare(b.periodStart) || a.clientName.localeCompare(b.clientName));
