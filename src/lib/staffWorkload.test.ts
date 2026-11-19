import { describe, expect, it } from 'vitest';
import { assigneeLabelWithLoad, parseWorkloadRows } from './staffWorkload';

const row = { id: 's1', name: 'Sam', departments: ['Designer'], open: 3, overdue: 1, dueThisWeek: 2 };

describe('staff workload', () => {
  it('accepts a well-formed reply', () => {
    expect(parseWorkloadRows({ ok: true, members: [row] })).toEqual([row]);
  });

  it.each([
    null, 'x', { ok: false, code: 'FORBIDDEN' }, { ok: true }, { ok: true, members: 'no' },
    { ok: true, members: [{ ...row, open: -1 }] }, { ok: true, members: [{ ...row, id: 5 }] },
    { ok: true, members: [{ ...row, departments: [1] }] }, { ok: true, members: [{ ...row, overdue: 1.5 }] },
  ])('rejects a malformed reply %#', value => {
    expect(parseWorkloadRows(value)).toBeNull();
  });

  it('labels an assignee with load, and falls back to the name', () => {
    const open = (n: number) => `${n} open`;
    const late = (n: number) => `${n} overdue`;
    expect(assigneeLabelWithLoad('Sam', { open: 3, overdue: 0 }, open, late)).toBe('Sam · 3 open');
    expect(assigneeLabelWithLoad('Sam', { open: 3, overdue: 2 }, open, late)).toBe('Sam · 3 open · 2 overdue');
    expect(assigneeLabelWithLoad('Sam', undefined, open, late)).toBe('Sam');
  });
});
