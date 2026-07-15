import { registerSW } from 'virtual:pwa-register';

export const PWA_UPDATE_READY_EVENT = 'aitask:pwa-update-ready';

const UPDATE_INTERVAL_MS = 60 * 60 * 1000;
const MIN_UPDATE_CHECK_GAP_MS = 60 * 1000;

let updateReady = false;

export const isPwaUpdateReady = () => updateReady;

export const registerPwaUpdates = () => {
  const hadControllerAtStartup = 'serviceWorker' in navigator && Boolean(navigator.serviceWorker.controller);
  let isReloading = false;

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadControllerAtStartup || isReloading) return;

      updateReady = true;
      if (window.location.pathname === '/login' || document.visibilityState === 'hidden') {
        isReloading = true;
        window.location.reload();
        return;
      }

      window.dispatchEvent(new Event(PWA_UPDATE_READY_EVENT));
    });
  }

  registerSW({
    immediate: true,
    onRegisteredSW(swUrl, registration) {
      if (!registration) return;

      let lastCheckedAt = 0;
      const checkForUpdate = async () => {
        if (registration.installing || !navigator.onLine) return;
        if (Date.now() - lastCheckedAt < MIN_UPDATE_CHECK_GAP_MS) return;
        lastCheckedAt = Date.now();

        try {
          const response = await fetch(swUrl, {
            cache: 'no-store',
            headers: {
              'cache': 'no-store',
              'cache-control': 'no-cache',
            },
          });
          if (response.ok) await registration.update();
        } catch {
          // Connectivity UI already reports offline state; retry on focus or the next interval.
        }
      };

      const checkWhenVisible = () => {
        if (document.visibilityState === 'visible') void checkForUpdate();
      };

      window.addEventListener('focus', checkWhenVisible);
      document.addEventListener('visibilitychange', checkWhenVisible);
      window.setInterval(() => void checkForUpdate(), UPDATE_INTERVAL_MS);
    },
    onRegisterError(error) {
      console.error('AiTask service worker registration failed:', error);
    },
  });
};
