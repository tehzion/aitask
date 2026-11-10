import React from 'react';
import { AlertCircle, Check, CloudOff, Loader2 } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../store';
import { getTaskSaveState, noteTaskSaveSeen, SAVED_VISIBLE_MS, useTaskSaveMarks } from '../lib/taskSaveMarks';
import { cn } from '../lib/utils';
import { useI18n } from './I18nProvider';

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

/**
 * Quiet save note next to a task the person just changed (role UX, 10 Nov 2026):
 * "Saving…" while it is unsaved, "Waiting to save" when it cannot go through
 * yet, "Not saved" when it failed and will not retry on its own, then "Saved"
 * for a few seconds. Renders nothing for untouched tasks.
 */
const TaskSaveNote = ({ taskId, className }: { taskId: string; className?: string }) => {
  const { t } = useI18n();
  const mark = useTaskSaveMarks(state => state.marks[taskId]);
  const backend = useStore(useShallow(store => ({
    hasLocalChanges: store.backend.hasLocalChanges,
    pendingMutations: store.backend.pendingMutations,
    isSaving: store.backend.isSaving,
    status: store.backend.status,
    lastSavedAt: store.backend.lastSavedAt,
  })));
  const [, setTick] = React.useState(0);
  const state = getTaskSaveState(mark, backend, { offline: isOffline() });

  React.useEffect(() => {
    if (state !== 'saved') return undefined;
    if (!mark?.savedSeenAt) noteTaskSaveSeen(taskId);
    const remaining = mark?.savedSeenAt ? Math.max(0, SAVED_VISIBLE_MS - (Date.now() - mark.savedSeenAt)) : SAVED_VISIBLE_MS;
    const timer = window.setTimeout(() => setTick(value => value + 1), remaining + 50);
    return () => window.clearTimeout(timer);
  }, [mark?.savedSeenAt, state, taskId]);

  React.useEffect(() => {
    if (state !== 'saving' && state !== 'waiting') return undefined;
    const update = () => setTick(value => value + 1);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, [state]);

  if (!state) return null;
  const Icon = state === 'saved' ? Check : state === 'failed' ? AlertCircle : state === 'waiting' ? CloudOff : Loader2;
  const label = state === 'saved' ? t('Saved') : state === 'failed' ? t('Not saved') : state === 'waiting' ? t('Waiting to save') : t('Saving…');
  return <span
    role="status"
    data-task-save-note={state}
    className={cn(
      'inline-flex items-center gap-1 text-xs font-medium',
      state === 'saved' ? 'text-emerald-700 dark:text-emerald-300' : state === 'failed' ? 'text-red-700 dark:text-red-300' : state === 'waiting' ? 'text-amber-700 dark:text-amber-300' : 'text-muted',
      className,
    )}
  >
    <Icon className={cn('h-3.5 w-3.5 shrink-0', state === 'saving' && 'motion-safe:animate-spin')} aria-hidden="true" />
    {label}
  </span>;
};

export default TaskSaveNote;
