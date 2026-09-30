import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ registerSW: vi.fn() }));
vi.mock('virtual:pwa-register', () => ({ registerSW: mock.registerSW }));
import { PWA_UPDATE_READY_EVENT, registerPwaUpdates } from './pwaUpdates';
import { configurePendingWork, setUnsavedSource } from './unsavedChanges';
const reload = vi.fn();
const dispatch = vi.fn();
beforeEach(() => {
  reload.mockClear(); dispatch.mockClear(); mock.registerSW.mockClear();
  configurePendingWork(() => false);
  vi.stubGlobal('window', { location: { pathname: '/tasks', reload }, dispatchEvent: dispatch });
  vi.stubGlobal('document', { visibilityState: 'hidden' });
  vi.stubGlobal('navigator', { serviceWorker: { controller: {}, addEventListener: vi.fn() } });
});
afterEach(() => { setUnsavedSource('pwa-draft', false); configurePendingWork(() => false); vi.unstubAllGlobals(); });
const needReload = () => { registerPwaUpdates(); mock.registerSW.mock.calls[0][0].onNeedReload(); };
describe('PWA reload safety', () => {
  it('never reloads a hidden tab with an unsaved form', () => {
    setUnsavedSource('pwa-draft', true); needReload();
    expect(reload).not.toHaveBeenCalled();
    expect(dispatch.mock.calls[0][0].type).toBe(PWA_UPDATE_READY_EVENT);
  });
  it('protects a pending save without an open form', () => {
    configurePendingWork(() => true); needReload();
    expect(reload).not.toHaveBeenCalled();
  });
  it('automatically refreshes a pristine hidden tab', () => {
    needReload(); expect(reload).toHaveBeenCalledOnce();
  });
});
