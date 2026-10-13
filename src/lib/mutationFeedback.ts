import { useToastStore, type ToastMessage, type ToastType } from '../store/useToastStore';
import { onWorkspaceSessionInvalidated } from './workspaceSession';

let pending: { message: ToastMessage; type: ToastType; confirmed: boolean } | undefined;
export const clearMutationFeedback = () => { pending = undefined; };
onWorkspaceSessionInvalidated(clearMutationFeedback);

/** A batch gets one confirmation after all of its changes are acknowledged.
 * Local changes are already persisted by the store's browser storage adapter. */
export const stageMutationFeedback = (message: ToastMessage, remote: boolean, type: ToastType = 'success') => {
  if (remote) pending = { message, type, confirmed: false };
  else useToastStore.getState().addToast(message, type);
};

export const confirmMutationFeedback = () => { if (pending) pending.confirmed = true; };
export const acknowledgeMutationFeedback = () => {
  if (!pending?.confirmed) return;
  const confirmed = pending;
  clearMutationFeedback();
  useToastStore.getState().addToast(confirmed.message, confirmed.type);
};
