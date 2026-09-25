import { describe, expect, it } from 'vitest';
import { resolveClientAddedDate } from './clientDates';

describe('resolveClientAddedDate', () => {
  it('pins an explicit Client since date so older records cannot override it', () => {
    expect(resolveClientAddedDate('2024-01-01', '2020-06-01')).toEqual({ value: '2024-01-01', pinned: true });
  });

  it('falls back to the profile creation date when Client since is unset', () => {
    expect(resolveClientAddedDate('', '2020-06-01')).toEqual({ value: '2020-06-01', pinned: false });
    expect(resolveClientAddedDate(undefined, undefined)).toEqual({ value: undefined, pinned: false });
  });
});
