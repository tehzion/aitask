import { create } from 'zustand';
import type { Task } from '../types';

/**
 * Which tasks the person changed in this tab (role UX, 10 Nov 2026). Drives the
 * quiet "Saving…/Saved" note next to a task, so people see their own change
 * save without watching the workspace status. Memory only: a reload starts
 * clean, and the workspace status still covers anything unsaved.
 */
export interface TaskSaveMark {
  /** The workspace's lastSavedAt when the change was made; a different value later means a save landed. */
  savedBefore?: string;
  /** Local time (ms) the landed save was first shown, so "Saved" fades on its own. */
  savedSeenAt?: number;
  /** Local time (ms) of the change, used only to keep the newest marks. */
  at: number;
  /**
   * Set when the save failed with no automatic retry (gap audit). `final` means
   * the change was discarded; otherwise a later landed save clears it.
   */
  failed?: { savedBefore?: string; final: boolean };
}

interface TaskSaveMarksState {
  marks: Record<string, TaskSaveMark>;
}

export const useTaskSaveMarks = create<TaskSaveMarksState>(() => ({ marks: {} }));

const MAX_MARKS = 50;

/** Ids of tasks that differ (by reference) between two task lists. */
export const changedTaskIds = (before: readonly Task[], after: readonly Task[]) => {
  if (before === after) return [];
  const previous = new Map(before.map(task => [task.id, task]));
  return after.filter(task => previous.get(task.id) !== task).map(task => task.id);
};

export const markTasksChanged = (ids: readonly string[], savedBefore: string | undefined, at = Date.now()) => {
  if (!ids.length) return;
  useTaskSaveMarks.setState(state => {
    const marks = { ...state.marks };
    for (const id of ids) marks[id] = { at, savedBefore };
    const entries = Object.entries(marks);
    if (entries.length <= MAX_MARKS) return { marks };
    return { marks: Object.fromEntries(entries.sort((left, right) => right[1].at - left[1].at).slice(0, MAX_MARKS)) };
  });
};

export const noteTaskSaveSeen = (id: string, at = Date.now()) => useTaskSaveMarks.setState(state => {
  const mark = state.marks[id];
  if (!mark || mark.savedSeenAt) return state;
  return { marks: { ...state.marks, [id]: { ...mark, savedSeenAt: at } } };
});

/** Mark every change that has not saved yet as failed. */
export const markTaskSavesFailed = (lastSavedAt: string | undefined, final: boolean) => useTaskSaveMarks.setState(state => {
  let changed = false;
  const marks = { ...state.marks };
  for (const [id, mark] of Object.entries(marks)) {
    // Only changes no save has covered yet; one already saved stays saved.
    if (mark.savedBefore !== lastSavedAt || mark.savedSeenAt) continue;
    if (mark.failed?.final && !final) continue;
    marks[id] = { ...mark, failed: { savedBefore: lastSavedAt, final } };
    changed = true;
  }
  return changed ? { marks } : state;
});

export const clearTaskSaveMarks = () => useTaskSaveMarks.setState({ marks: {} });

export type TaskSaveState = 'saving' | 'waiting' | 'saved' | 'failed' | null;

/** How long "Saved" stays visible once the save has landed. */
export const SAVED_VISIBLE_MS = 5_000;

export interface SaveBackendView {
  hasLocalChanges: boolean;
  pendingMutations: number;
  isSaving: boolean;
  status: string;
  lastSavedAt?: string;
}

const WAITING_STATUSES = ['offline', 'retry_required', 'conflict', 'refresh_required', 'upgrade_required'];

/**
 * The note for one task: "saving" while its change is unsaved, "waiting" when
 * the save cannot go through right now, "failed" when it did not save and will
 * not retry on its own, "saved" briefly once a save after the change has
 * landed, otherwise nothing.
 */
export const getTaskSaveState = (
  mark: TaskSaveMark | undefined,
  backend: SaveBackendView,
  options: { now?: number; offline?: boolean } = {},
): TaskSaveState => {
  if (!mark) return null;
  const unsaved = backend.hasLocalChanges || backend.pendingMutations > 0 || backend.isSaving;
  if (mark.failed) {
    // A discarded change never saves; a failed one shows "Not saved" until a later save lands.
    const landedSince = !unsaved && Boolean(backend.lastSavedAt) && backend.lastSavedAt !== mark.failed.savedBefore;
    if (mark.failed.final || !landedSince) return 'failed';
  }
  if (unsaved) return options.offline || WAITING_STATUSES.includes(backend.status) ? 'waiting' : 'saving';
  // A change discarded or reloaded without a save never shows "Saved".
  if (!backend.lastSavedAt || backend.lastSavedAt === mark.savedBefore) return null;
  if (!mark.savedSeenAt) return 'saved';
  return (options.now ?? Date.now()) - mark.savedSeenAt < SAVED_VISIBLE_MS ? 'saved' : null;
};
