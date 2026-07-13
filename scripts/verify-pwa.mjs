import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../dist/${path}`, import.meta.url), 'utf8');

const [manifestSource, indexHtml, serviceWorker] = await Promise.all([
  read('manifest.webmanifest'),
  read('index.html'),
  read('sw.js'),
]);

const manifest = JSON.parse(manifestSource);
assert.equal(manifest.name, 'AiTask - Marketing Agency Task Management');
assert.equal(manifest.short_name, 'AiTask');
assert.equal(manifest.start_url, '/');
assert.equal(manifest.scope, '/');
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.theme_color, '#2563eb');
assert.equal(manifest.background_color, '#f6f7f9');

const iconContracts = new Set(manifest.icons.map(icon => `${icon.src}|${icon.sizes}|${icon.purpose}`));
assert(iconContracts.has('/pwa-192x192.png|192x192|any'));
assert(iconContracts.has('/pwa-512x512.png|512x512|any'));
assert(iconContracts.has('/pwa-maskable-512x512.png|512x512|maskable'));

assert.match(indexHtml, /<link rel="manifest" href="\/manifest[.]webmanifest"/);
assert.match(indexHtml, /<link rel="apple-touch-icon" href="\/apple-touch-icon[.]png"/);
assert.match(indexHtml, /<meta name="theme-color" content="#2563eb"/);
assert.match(indexHtml, /id="root"/);

for (const asset of [
  'pwa-192x192.png',
  'pwa-512x512.png',
  'pwa-maskable-512x512.png',
  'apple-touch-icon.png',
]) {
  assert(serviceWorker.includes(asset), `${asset} is missing from the service-worker precache.`);
}

assert(!/supabase[.]co|aitask_app_state/i.test(serviceWorker), 'Supabase data must not be cached by the service worker.');
assert(serviceWorker.includes('aitask-route-assets'), 'Lazy route scripts must be cached after first use.');
assert(!/Dashboard-[A-Za-z0-9_-]+[.]js/.test(serviceWorker), 'Dashboard route must not be in the install-time precache.');
assert(!/charts-[A-Za-z0-9_-]+[.]js/.test(serviceWorker), 'Charts must not be in the install-time precache.');
console.log('PWA verification passed: manifest, app shell, icons, and cache boundaries are valid.');
