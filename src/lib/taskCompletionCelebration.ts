import { useStore } from '../store';
import { useToastStore } from '../store/useToastStore';
import { msg } from './messages';
import { getWorkWeekRange } from './workWeek';
import { isTaskCompleted } from './taskCompletion';

export const celebrateTaskCompletion = (taskId: string) => {
  const state = useStore.getState();
  const current = state.tasks.find(task => task.id === taskId);
  if (!state.currentUser || !current || current.assignedTo !== state.currentUser.id || !isTaskCompleted(current)) return;
  const { start, end } = getWorkWeekRange(new Date());
  const count = state.tasks.filter(task => task.assignedTo === state.currentUser!.id && isTaskCompleted(task)
    && task.completedAt && new Date(task.completedAt) >= start && new Date(task.completedAt) <= end).length;
  if (!count) return;
  const key = `aitask:completion-celebrated:${state.currentUser.id}`;
  try {
    if (window.sessionStorage.getItem(key) === '1') return;
    window.sessionStorage.setItem(key, '1');
  } catch { /* Personal feedback also works without browser storage. */ }
  useToastStore.getState().addToast(msg('task.completedThisWeek', { count }), 'success');
};
