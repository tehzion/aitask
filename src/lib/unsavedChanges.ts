const sources = new Set<string>();
const blockingSources = new Set<string>();
const listeners = new Set<() => void>();
let pendingWork = () => false;
export const configurePendingWork = (read: () => boolean) => { pendingWork = read; };
export const hasBlockingUnsavedChanges = () => blockingSources.size > 0;
export const hasUnsavedChanges = () => sources.size > 0 || pendingWork();
export const setUnsavedSource = (key: string, dirty: boolean, blockNavigation = false) => {
  const previous = sources.has(key);
  const wasBlocking = blockingSources.has(key);
  if (dirty) sources.add(key); else sources.delete(key);
  if (dirty && blockNavigation) blockingSources.add(key); else blockingSources.delete(key);
  if (previous !== dirty || wasBlocking !== blockingSources.has(key)) listeners.forEach(listener => listener());
};
export const subscribeUnsavedChanges = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
