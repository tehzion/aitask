import { describe, expect, it } from 'vitest';
import { getRevisionAllowance, normalizeIncludedRevisions } from './revisionAllowance';

const projects = [{ id: 'p1', includedRevisions: 2 }, { id: 'p2' }];

describe('revision allowance', () => {
  it('reports usage against the project allowance', () => {
    expect(getRevisionAllowance({ projectId: 'p1', revisionCount: 1 }, projects)).toEqual({ used: 1, included: 2, remaining: 1, over: false });
    expect(getRevisionAllowance({ projectId: 'p1', revisionCount: 2 }, projects)).toEqual({ used: 2, included: 2, remaining: 0, over: false });
    expect(getRevisionAllowance({ projectId: 'p1', revisionCount: 3 }, projects)).toEqual({ used: 3, included: 2, remaining: 0, over: true });
  });
  it('reports usage only without an allowance', () => {
    expect(getRevisionAllowance({ projectId: 'p2', revisionCount: 4 }, projects)).toEqual({ used: 4, over: false });
    expect(getRevisionAllowance({ revisionCount: 1 }, projects)).toEqual({ used: 1, over: false });
  });
  it('treats an allowance of zero as no included revisions', () => {
    expect(getRevisionAllowance({ projectId: 'z', revisionCount: 1 }, [{ id: 'z', includedRevisions: 0 }])).toMatchObject({ included: 0, over: true });
  });
  it('normalizes the allowance input', () => {
    expect(normalizeIncludedRevisions('3')).toBe(3);
    expect(normalizeIncludedRevisions(2.9)).toBe(2);
    expect(normalizeIncludedRevisions(99)).toBe(20);
    expect(normalizeIncludedRevisions(-1)).toBeUndefined();
    expect(normalizeIncludedRevisions('')).toBeUndefined();
    expect(normalizeIncludedRevisions('abc')).toBeUndefined();
  });
});
