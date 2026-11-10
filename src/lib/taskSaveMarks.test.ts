import { beforeEach, describe, expect, it } from 'vitest';
import type { Task } from '../types';
import { changedTaskIds, clearTaskSaveMarks, getTaskSaveState, markTasksChanged, noteTaskSaveSeen, SAVED_VISIBLE_MS, useTaskSaveMarks } from './taskSaveMarks';

const clean = { hasLocalChanges: false, pendingMutations: 0, isSaving: false, status: 'live', lastSavedAt: '2026-11-10T01:00:00Z' };
const unsaved = { ...clean, hasLocalChanges: true, pendingMutations: 1, status: 'saving' };

describe('per-task save note', () => {
  beforeEach(() => clearTaskSaveMarks());

  it('finds only the tasks whose objects changed', () => {
    const a = { id: 'a' } as Task;
    const b = { id: 'b' } as Task;
    expect(changedTaskIds([a, b], [a, { ...b }])).toEqual(['b']);
    expect(changedTaskIds([a], [a, b])).toEqual(['b']);
    const same = [a];
    expect(changedTaskIds(same, same)).toEqual([]);
  });

  it('shows Saving while unsaved and Waiting when offline or blocked', () => {
    const mark = { at: 1, savedBefore: clean.lastSavedAt };
    expect(getTaskSaveState(undefined, unsaved)).toBeNull();
    expect(getTaskSaveState(mark, unsaved)).toBe('saving');
    expect(getTaskSaveState(mark, unsaved, { offline: true })).toBe('waiting');
    expect(getTaskSaveState(mark, { ...unsaved, status: 'retry_required' })).toBe('waiting');
  });

  it('shows Saved only after a new save lands, then fades', () => {
    const mark = { at: 1, savedBefore: clean.lastSavedAt };
    // Discarded or reloaded: no new save, so nothing to show.
    expect(getTaskSaveState(mark, clean)).toBeNull();
    const saved = { ...clean, lastSavedAt: '2026-11-10T01:00:05Z' };
    expect(getTaskSaveState(mark, saved)).toBe('saved');
    const seen = { ...mark, savedSeenAt: 10_000 };
    expect(getTaskSaveState(seen, saved, { now: 10_000 + SAVED_VISIBLE_MS - 1 })).toBe('saved');
    expect(getTaskSaveState(seen, saved, { now: 10_000 + SAVED_VISIBLE_MS })).toBeNull();
  });

  it('records marks, notes the first sighting once and keeps the newest 50', () => {
    markTasksChanged(['t1'], 'before', 5);
    noteTaskSaveSeen('t1', 100);
    noteTaskSaveSeen('t1', 200);
    expect(useTaskSaveMarks.getState().marks.t1).toEqual({ at: 5, savedBefore: 'before', savedSeenAt: 100 });
    markTasksChanged(Array.from({ length: 60 }, (_, index) => `x${index}`), undefined, 10);
    expect(Object.keys(useTaskSaveMarks.getState().marks)).toHaveLength(50);
    expect(useTaskSaveMarks.getState().marks.t1).toBeUndefined();
  });
});
