import { describe, expect, it } from 'vitest';
import { mergeDraft } from './draftMerge';
const base = { name: 'Plan', serviceItems: [{ id: 'a', name: 'Design', quantity: 1 }, { id: 'b', name: 'Video', quantity: 1 }] };
describe('three-way draft reconciliation', () => {
  it('preserves independent edits to different items and fields of the same item', () => {
    const local = structuredClone(base); local.serviceItems[0].name = 'Local';
    const remote = structuredClone(base); remote.serviceItems[0].quantity = 3; remote.serviceItems[1].name = 'Remote';
    const result = mergeDraft(base, local, remote);
    expect(result.conflicts).toEqual([]);
    expect(result.value.serviceItems).toEqual([{ id: 'a', name: 'Local', quantity: 3 }, { id: 'b', name: 'Remote', quantity: 1 }]);
  });
  it('requires an explicit choice for overlapping edits', () => {
    const local = { ...base, name: 'Local' }; const remote = { ...base, name: 'Remote' };
    expect(mergeDraft(base, local, remote).conflicts.map(item => item.path)).toEqual(['name']);
    expect(mergeDraft(base, local, remote, { name: 'remote' })).toEqual({ value: remote, conflicts: [] });
  });
  it('detects delete versus edit instead of resurrecting a deleted item silently', () => {
    const local = { ...base, serviceItems: base.serviceItems.slice(1) };
    const remote = structuredClone(base); remote.serviceItems[0].quantity = 2;
    expect(mergeDraft(base, local, remote).conflicts[0].path).toBe('serviceItems[a]');
    expect(mergeDraft(base, local, remote, { 'serviceItems[a]': 'local' }).value.serviceItems).toHaveLength(1);
  });
  it('preserves remote additions, local additions and remote order', () => {
    const local = structuredClone(base); local.serviceItems.push({ id: 'c', name: 'Local new', quantity: 1 });
    const remote = structuredClone(base); remote.serviceItems.reverse(); remote.serviceItems.push({ id: 'd', name: 'Remote new', quantity: 2 });
    const result = mergeDraft(base, local, remote);
    expect(result.conflicts).toEqual([]);
    expect(result.value.serviceItems.map(item => item.id)).toEqual(['b', 'a', 'd', 'c']);
  });
});
