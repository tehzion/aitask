import { useStore } from '../store';
import { acknowledgeActionFeedback } from './actionFeedback';

// Store intent is confirmed once, including retries from outside the editor.
export const announceTaskStatusSaved = (status: string) => {
  if (!status) return;
  acknowledgeActionFeedback(useStore.getState());
};
