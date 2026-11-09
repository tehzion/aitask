import { describe, expect, it } from 'vitest';
import type { Deliverable, ServiceCycle } from '../types';
import { getMonthHousekeeping, getMonthsToTidy } from './monthHousekeeping';

const cycle = (id: string, status: ServiceCycle['status'], periodEnd: string) => ({ id, status, periodEnd, periodStart: '2026-10-01', clientId: 'c1' } as ServiceCycle);
const item = (cycleId: string, status: Deliverable['status']) => ({ cycleId, status } as Deliverable);
const today = '2026-11-09';

describe('team feedback F3: month housekeeping', () => {
  it('flags an ended draft month as never published', () => {
    expect(getMonthHousekeeping(cycle('oct', 'Draft', '2026-10-31'), [], today)).toEqual({ kind: 'never-published' });
  });

  it('offers close when every deliverable of an ended published month is delivered', () => {
    const items = [item('oct', 'Delivered'), item('oct', 'Delivered'), item('nov', 'Planned')];
    expect(getMonthHousekeeping(cycle('oct', 'Published', '2026-10-31'), items, today)).toEqual({ kind: 'ready-to-close', total: 2 });
  });

  it('counts what is not done in an ended published month', () => {
    const items = [item('oct', 'Delivered'), item('oct', 'Ready'), item('oct', 'Planned')];
    expect(getMonthHousekeeping(cycle('oct', 'Published', '2026-10-31'), items, today)).toEqual({ kind: 'overdue', notDone: 2, total: 3 });
    expect(getMonthHousekeeping(cycle('oct', 'Published', '2026-10-31'), [], today)).toEqual({ kind: 'overdue', notDone: 0, total: 0 });
  });

  it('leaves running, closed and cancelled months alone', () => {
    expect(getMonthHousekeeping(cycle('nov', 'Draft', '2026-11-30'), [], today).kind).toBe('none');
    expect(getMonthHousekeeping(cycle('nov', 'Published', '2026-11-09'), [], today).kind).toBe('none');
    expect(getMonthHousekeeping(cycle('sep', 'Completed', '2026-09-30'), [], today).kind).toBe('none');
    expect(getMonthHousekeeping(cycle('aug', 'Cancelled', '2026-08-31'), [], today).kind).toBe('none');
  });

  it('lists only months that need a decision', () => {
    const cycles = [cycle('a', 'Draft', '2026-10-31'), cycle('b', 'Published', '2026-10-31'), cycle('c', 'Completed', '2026-10-31'), cycle('d', 'Draft', '2026-11-30')];
    expect(getMonthsToTidy(cycles, [], today).map(entry => entry.id)).toEqual(['a', 'b']);
  });
});
