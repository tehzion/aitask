import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { clearRecoveredDrafts, readRecoveredDraft, writeRecoveredDraft } from './draftRecovery';
beforeEach(() => {
  const items: Record<string, string> = {};
  vi.stubGlobal('localStorage', { getItem: (key: string) => items[key] ?? null, setItem: (key: string, value: string) => { items[key] = value; Object.defineProperty(localStorage, key, { value, configurable: true, enumerable: true }); }, removeItem: (key: string) => { delete items[key]; delete (localStorage as unknown as Record<string, unknown>)[key]; } });
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('account-scoped recovery', () => {
  it('retains both the draft and original baseline and isolates accounts', () => {
    writeRecoveredDraft('a', 'plan', { name: 'Base' }, { name: 'Draft' });
    expect(readRecoveredDraft('b', 'plan')).toBeNull();
    expect(readRecoveredDraft('a', 'plan')).toMatchObject({ baseline: { name: 'Base' }, value: { name: 'Draft' } });
    writeRecoveredDraft('b', 'plan', {}, { name: 'Other' });
    clearRecoveredDrafts('a');
    expect(readRecoveredDraft('a', 'plan')).toBeNull(); expect(readRecoveredDraft('b', 'plan')).not.toBeNull();
  });
  it('expires after 24 hours', () => {
    vi.useFakeTimers(); writeRecoveredDraft('a', 'plan', {}, { name: 'Draft' });
    vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1);
    expect(readRecoveredDraft('a', 'plan')).toBeNull();
  });
  it('handles disabled storage without blocking editing', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } });
    expect(writeRecoveredDraft('a', 'plan', {}, {})).toBe(false); expect(readRecoveredDraft('a', 'plan')).toBeNull();
  });
});
