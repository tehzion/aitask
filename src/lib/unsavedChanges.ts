const sources = new Set<string>();
const listeners = new Set<() => void>();
let pendingWork = () => false;
export const configurePendingWork = (read: () => boolean) => { pendingWork = read; };
export const hasUnsavedChanges = () => sources.size > 0 || pendingWork();
export const setUnsavedSource = (key: string, dirty: boolean) => {
  const previous = sources.has(key);
  if (dirty) sources.add(key); else sources.delete(key);
  if (previous !== dirty) listeners.forEach(listener => listener());
};
export const subscribeUnsavedChanges = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
