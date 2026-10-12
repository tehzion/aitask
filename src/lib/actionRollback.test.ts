import { describe, expect, it } from 'vitest';
import { rollbackUnchangedRows } from './actionRollback';

describe('action rollback ownership', () => {
  const before = [{ id: 'updated', value: 1 }, { id: 'deleted', value: 1 }];
  const staged = [{ id: 'updated', value: 2 }, { id: 'inserted', value: 1 }];
  it('restores an untouched collection including a deletion', () => {
    expect(rollbackUnchangedRows(staged, before, staged)).toBe(before);
  });
  it('preserves newer rows and unrelated insertions while reverting owned rows', () => {
    const newer = { id: 'updated', value: 3 };
    const remote = { id: 'remote', value: 1 };
    expect(rollbackUnchangedRows([newer, staged[1], remote], before, staged)).toEqual([newer, remote]);
  });
  it('does not resurrect an absent row after the collection was refreshed', () => {
    expect(rollbackUnchangedRows([{ ...staged[0] }], before, staged)).toEqual([staged[0]]);
  });
});
