import { recordDiagnostic } from '../lib/diagnostics';
import { useEffect } from 'react';
import { useBlocker, useLocation } from 'react-router-dom';
import { useStore } from '../store';
import { hasBlockingUnsavedChanges, hasUnsavedChanges } from '../lib/unsavedChanges';
import { useI18n } from './I18nProvider';

export default function NavigationGuard() {
  const { t } = useI18n();
  const location = useLocation();
  useEffect(() => {
    const start = performance.now();
    let frame = requestAnimationFrame(() => { frame = requestAnimationFrame(() => recordDiagnostic('route.ready', performance.now() - start)); });
    return () => cancelAnimationFrame(frame);
  }, [location.key]);
  // A navigation the app makes for the user (e.g. clearing a list filter that
  // would hide a record they just saved) marks itself and is not a leave.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => Boolean(useStore.getState().currentUser) && hasUnsavedChanges()
    && !(nextLocation.state as { skipUnsavedGuard?: boolean } | null)?.skipUnsavedGuard && (
    currentLocation.pathname !== nextLocation.pathname
    || currentLocation.search !== nextLocation.search
    || currentLocation.hash !== nextLocation.hash
  ));
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (hasBlockingUnsavedChanges()) { blocker.reset(); return; }
    if (window.confirm(t('feedback.leaveUnsaved'))) blocker.proceed();
    else blocker.reset();
  }, [blocker, t]);
  return null;
}
