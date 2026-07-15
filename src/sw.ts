/// <reference lib="webworker" />

import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { clientsClaim } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import { enable as enableNavigationPreload } from 'workbox-navigation-preload';
import { cleanupOutdatedCaches, precacheAndRoute, PrecacheFallbackPlugin } from 'workbox-precaching';
import type { PrecacheEntry } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<PrecacheEntry | string>;
};

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
enableNavigationPreload();

// Register navigation first so an older worker checks production before using its cached shell.
registerRoute(
  ({ request }) => request.mode === 'navigate',
  new NetworkFirst({
    cacheName: 'aitask-navigation',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 20,
        maxAgeSeconds: 7 * 24 * 60 * 60,
      }),
      new PrecacheFallbackPlugin({ fallbackURL: '/index.html' }),
    ],
  }),
);

precacheAndRoute(self.__WB_MANIFEST);

registerRoute(
  ({ request, url }) => (
    request.destination === 'script'
    && url.origin === self.location.origin
    && url.pathname.startsWith('/assets/')
  ),
  new StaleWhileRevalidate({
    cacheName: 'aitask-route-assets',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 40,
        maxAgeSeconds: 30 * 24 * 60 * 60,
      }),
    ],
  }),
);
