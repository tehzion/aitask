import { afterEach, describe, expect, it } from 'vitest';
import { configurePendingWork, hasBlockingUnsavedChanges, hasUnsavedChanges, setUnsavedSource, subscribeUnsavedChanges } from './unsavedChanges';
afterEach(() => { setUnsavedSource('draft-a', false); setUnsavedSource('draft-b', false); configurePendingWork(() => false); });
describe('update safety', () => {
  it('blocks navigation during an upload and allows explicit discard after a failure', () => {
    const states: boolean[] = [];
    const cleanup = subscribeUnsavedChanges(() => states.push(hasBlockingUnsavedChanges()));
    setUnsavedSource('draft-a', true, true);
    setUnsavedSource('draft-b', true, true);
    setUnsavedSource('draft-a', true, false);
    expect(hasBlockingUnsavedChanges()).toBe(true);
    setUnsavedSource('draft-b', false);
    expect(hasBlockingUnsavedChanges()).toBe(false);
    expect(hasUnsavedChanges()).toBe(true);
    setUnsavedSource('draft-a', false);
    expect(hasUnsavedChanges()).toBe(false);
    expect(states).toEqual([true, true, true, false, false]);
    cleanup();
  });
  it('remains dirty until all independent forms are clean', () => {
    let changes = 0;
    const cleanup = subscribeUnsavedChanges(() => { changes += 1; });
    setUnsavedSource('draft-a', true); setUnsavedSource('draft-b', true);
    setUnsavedSource('draft-a', false);
    expect(hasUnsavedChanges()).toBe(true);
    setUnsavedSource('draft-b', false);
    expect(hasUnsavedChanges()).toBe(false);
    expect(changes).toBe(4); cleanup();
  });
  it('protects in-flight and retained mutations with no open form', () => {
    configurePendingWork(() => true);
    expect(hasUnsavedChanges()).toBe(true);
    configurePendingWork(() => false);
    expect(hasUnsavedChanges()).toBe(false);
  });
});
