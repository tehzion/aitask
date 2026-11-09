import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ pending: false, notify: vi.fn() }));
vi.mock('./unsavedChanges', () => ({ hasUnsavedChanges: () => state.pending }));
vi.mock('./pwaUpdates', () => ({ notifyPwaUpdateReady: state.notify }));

beforeEach(() => { vi.resetModules(); state.pending = false; state.notify.mockReset(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it('reloads an old tab after a hashed chunk failure only when there is no pending work', async () => {
  const listeners = new Map<string, (event: Event) => void>();
  const reload = vi.fn();
  vi.stubGlobal('window', { addEventListener: (type: string, handler: (event: Event) => void) => listeners.set(type, handler), sessionStorage: { getItem: () => null, setItem: vi.fn() }, location: { reload } });
  vi.stubGlobal('navigator', {});
  const { registerChunkRecovery } = await import('./chunkRecovery');
  registerChunkRecovery();
  const event = { preventDefault: vi.fn(), payload: new Error('Failed to fetch dynamically imported module: /assets/old-hash.js') } as unknown as Event;
  state.pending = true;
  listeners.get('vite:preloadError')!(event);
  expect(reload).not.toHaveBeenCalled();
  expect(state.notify).toHaveBeenCalledOnce();
  state.pending = false;
  listeners.get('vite:preloadError')!(event);
  expect(reload).toHaveBeenCalledOnce();
});

it('does not reload if work becomes pending while the service worker updates', async () => {
  vi.useFakeTimers();
  const reload = vi.fn();
  vi.stubGlobal('window', { sessionStorage: { getItem: () => null, setItem: vi.fn() }, location: { reload }, setTimeout });
  vi.stubGlobal('navigator', { serviceWorker: { getRegistration: async () => ({ update: async () => undefined }) } });
  const { recoverFromChunkLoadError } = await import('./chunkRecovery');
  expect(recoverFromChunkLoadError()).toBe(true);
  await Promise.resolve();
  state.pending = true;
  await vi.advanceTimersByTimeAsync(1600);
  expect(reload).not.toHaveBeenCalled();
  expect(state.notify).toHaveBeenCalled();
});
