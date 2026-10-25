// A response belongs to the authenticated session that started it.
const invalidationListeners = new Set<() => void>();
export const onWorkspaceSessionInvalidated = (listener: () => void) => { invalidationListeners.add(listener); return () => { invalidationListeners.delete(listener); }; };
let generation = 0;
let controller = new AbortController();
export const captureWorkspaceSession = () => ({ generation, signal: controller.signal });
export type WorkspaceSessionToken = ReturnType<typeof captureWorkspaceSession>;
export const isWorkspaceSessionCurrent = (token: WorkspaceSessionToken) => token.generation === generation && !token.signal.aborted;
export const invalidateWorkspaceSession = () => {
  controller.abort();
  controller = new AbortController();
  generation += 1;
  invalidationListeners.forEach(listener => listener());
};
export const assertWorkspaceSession = (token: WorkspaceSessionToken) => {
  if (!isWorkspaceSessionCurrent(token)) throw new DOMException('Workspace session changed.', 'AbortError');
};
