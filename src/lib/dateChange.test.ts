import { describe, expect, it } from 'vitest';
import { nextDateChange } from './dateChange';

const at = '2026-11-19T10:00:00.000Z';

describe('nextDateChange', () => {
  it('records the old date, a trimmed reason and who moved it', () => {
    expect(nextDateChange({ dueDate: '2026-11-20' }, '2026-11-27', '  Client sent files late ', 'pm', at))
      .toEqual({ from: '2026-11-20', reason: 'Client sent files late', changedBy: 'pm', changedAt: at });
  });

  it('records a move without a reason', () => {
    expect(nextDateChange({ dueDate: '2026-11-20' }, '2026-11-18', '   ', 'pm', at)?.reason).toBeUndefined();
  });

  it('caps the reason length', () => {
    expect(nextDateChange({ dueDate: '2026-11-20' }, '2026-11-21', 'x'.repeat(500), 'pm', at)?.reason).toHaveLength(200);
  });

  it('ignores a first date, a cleared date and an unchanged date, keeping what was recorded', () => {
    const existing = { from: '2026-11-01', changedAt: at };
    expect(nextDateChange({ dueDate: '' }, '2026-11-20', 'x', 'pm', at)).toBeUndefined();
    expect(nextDateChange({ dueDate: '2026-11-20', dateChange: existing }, '', 'x', 'pm', at)).toBe(existing);
    expect(nextDateChange({ dueDate: '2026-11-20', dateChange: existing }, '2026-11-20', 'x', 'pm', at)).toBe(existing);
  });

  it('clears the notice when the date goes back to where it started', () => {
    expect(nextDateChange({ dueDate: '2026-11-27', dateChange: { from: '2026-11-20', changedAt: at } }, '2026-11-20', '', 'pm', at)).toBeUndefined();
  });
});
