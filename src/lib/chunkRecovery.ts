/**
 * Recovery for failed dynamic route imports.
 *
 * Deploying a new build replaces the hashed `/assets/*` chunks. A tab still
 * running the previous build can then fail to lazy-load a route with
 * "Failed to fetch dynamically imported module". The workspace data is safe in
 * Supabase; the app just needs to load the new bundle. Vite emits a
 * `vite:preloadError` event for these failures, so we reload once (guarded
 * against a reload loop) after nudging the service worker to update.
 */

const RELOAD_GUARD_KEY = 'aitask:chunk-recovery-at';
const RELOAD_COOLDOWN_MS = 15 * 1000;

let isRecovering = false;

export const isChunkLoadError = (message: string | undefined | null): boolean => (
  typeof message === 'string'
  && /failed to fetch dynamically imported module|importing a module script failed|error loading dynamically imported module|loading chunk \d+ failed|chunkloaderror|dynamically imported module/i.test(message)
);

export const recoverFromChunkLoadError = (): boolean => {
  if (typeof window === 'undefined' || isRecovering) return false;

  const now = Date.now();
  let lastAttempt = 0;
  try {
    lastAttempt = Number(window.sessionStorage.getItem(RELOAD_GUARD_KEY) || '0');
  } catch {
    lastAttempt = 0;
  }
  if (now - lastAttempt < RELOAD_COOLDOWN_MS) return false;
  try {
    window.sessionStorage.setItem(RELOAD_GUARD_KEY, String(now));
  } catch {
    // Storage may be unavailable; the in-memory flag still prevents loops.
  }

  isRecovering = true;
  const reload = () => window.location.reload();

  try {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .getRegistration()
        .then(registration => registration?.update().catch(() => undefined))
        .catch(() => undefined)
        .finally(() => window.setTimeout(reload, 200));
      // Safety net in case the registration promise never settles.
      window.setTimeout(reload, 1500);
    } else {
      reload();
    }
  } catch {
    reload();
  }

  return true;
};

export const registerChunkRecovery = () => {
  if (typeof window === 'undefined') return;

  window.addEventListener('vite:preloadError', event => {
    if (recoverFromChunkLoadError()) event.preventDefault();
  });

  window.addEventListener('unhandledrejection', event => {
    const reason = (event as PromiseRejectionEvent).reason;
    const message = reason instanceof Error ? reason.message : String(reason ?? '');
    if (isChunkLoadError(message)) recoverFromChunkLoadError();
  });
};
