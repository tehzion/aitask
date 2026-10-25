export interface AccessRefreshState {
  hasCurrentUser: boolean;
  isPulling: boolean;
  isSaving: boolean;
  hasPendingChange?: boolean;
}

export const createAccessRefreshCoordinator = (
  getState: () => AccessRefreshState,
  refresh: () => Promise<void>,
) => {
  let pending = false;
  let inFlight = false;
  let generation = 0;

  const canRefresh = () => {
    const state = getState();
    return state.hasCurrentUser && !state.isPulling && !state.isSaving && !state.hasPendingChange;
  };

  const flush = () => {
    if (!pending || inFlight || !canRefresh()) return;

    pending = false;
    inFlight = true;
    const scheduledGeneration = generation;
    void Promise.resolve()
      .then(() => {
        if (scheduledGeneration !== generation) return;
        if (!canRefresh()) { pending = true; return; }
        return refresh();
      })
      .catch(() => undefined)
      .finally(() => {
        inFlight = false;
        if (pending) queueMicrotask(flush);
      });
  };

  return {
    request: () => {
      pending = true;
      flush();
    },
    onStateChange: flush,
    reset: () => {
      generation += 1;
      pending = false;
    },
  };
};
