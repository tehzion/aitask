import { useStore } from '../store';
import { useToastStore } from '../store/useToastStore';
import { msg } from './messages';
import { getWorkWeekRange } from './workWeek';
import { isTaskCompleted } from './taskCompletion';

// Called by UI submission/retry handlers after persistence acknowledgement.
export const announceTaskStatusSaved = (status: string) => {
  useToastStore.getState().addToast(msg('task.statusUpdated', { status }), 'success');
  const state = useStore.getState();
  if (status !== 'Completed' || !state.currentUser) return;
  const key = `aitask:completion-celebrated:${state.currentUser.id}`;
  try {
    if (window.sessionStorage.getItem(key) === '1') return;
    window.sessionStorage.setItem(key, '1');
  } catch { /* Completion feedback also works without browser storage. */ }
  const { start, end } = getWorkWeekRange(new Date());
  const count = state.tasks.filter(task => task.assignedTo === state.currentUser?.id && isTaskCompleted(task)
    && task.completedAt && new Date(task.completedAt) >= start && new Date(task.completedAt) <= end).length;
  useToastStore.getState().addToast(msg('task.completedThisWeek', { count }), 'success');
};
