// Retry only disposable stack startup. Validation and tests run exactly once.
export function startWithRetry({ start, cleanup, configure, wait, attempts = 3 }) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    configure(attempt);
    try {
      start();
      return;
    } catch (error) {
      if (attempt === attempts) throw error;
      console.warn(`[rollout] Stack start attempt ${attempt} failed; cleaning up before retry.`);
      cleanup();
      wait(attempt * 2000);
    }
  }
}
