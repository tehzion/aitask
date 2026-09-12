export interface AccessRefreshState {
  hasCurrentUser: boolean;
  isPulling: boolean;
  isSaving: boolean;
}

export const createAccessRefreshCoordinator = (
  getState: () => AccessRefreshState,
  refresh: () => Promise<void>,
) => {
  let pending = false;
  let inFlight = false;

  const flush = () => {
    const state = getState();
    if (!pending || inFlight || !state.hasCurrentUser || state.isPulling || state.isSaving) return;

    pending = false;
    inFlight = true;
    void Promise.resolve()
      .then(refresh)
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
    onStateChange: (previousState: AccessRefreshState, state: AccessRefreshState) => {
      if (
        pending
        && (previousState.isSaving || previousState.isPulling)
        && !state.isSaving
        && !state.isPulling
      ) flush();
    },
    reset: () => {
      pending = false;
    },
  };
};
