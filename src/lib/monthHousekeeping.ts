import type { Deliverable, ServiceCycle } from '../types';

export type MonthHousekeeping =
  | { kind: 'never-published' }
  | { kind: 'ready-to-close'; total: number }
  | { kind: 'overdue'; notDone: number; total: number }
  | { kind: 'none' };

/**
 * What a PM should do with a month once its period is over (team feedback F3).
 * - Draft and ended: it was never published; publish it late or cancel it.
 * - Published and ended, every deliverable delivered: close it.
 * - Published and ended with work left: overdue (closing is refused by the
 *   server until every deliverable is delivered).
 * Months still running, closed or cancelled need nothing.
 */
export const getMonthHousekeeping = (
  cycle: Pick<ServiceCycle, 'id' | 'status' | 'periodEnd'>,
  deliverables: readonly Pick<Deliverable, 'cycleId' | 'status'>[],
  todayKey: string,
): MonthHousekeeping => {
  if (!cycle.periodEnd || cycle.periodEnd >= todayKey) return { kind: 'none' };
  if (cycle.status === 'Draft') return { kind: 'never-published' };
  if (cycle.status !== 'Published') return { kind: 'none' };
  const items = deliverables.filter(item => item.cycleId === cycle.id);
  const notDone = items.filter(item => item.status !== 'Delivered').length;
  if (items.length > 0 && notDone === 0) return { kind: 'ready-to-close', total: items.length };
  return { kind: 'overdue', notDone, total: items.length };
};

/** Ended months that still need a PM decision, for dashboard counts. */
export const getMonthsToTidy = (
  cycles: readonly ServiceCycle[],
  deliverables: readonly Pick<Deliverable, 'cycleId' | 'status'>[],
  todayKey: string,
) => cycles.filter(cycle => getMonthHousekeeping(cycle, deliverables, todayKey).kind !== 'none');
