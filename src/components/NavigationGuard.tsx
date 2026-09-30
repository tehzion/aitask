import { recordDiagnostic } from '../lib/diagnostics';
import { useEffect } from 'react';
import { useBlocker, useLocation } from 'react-router-dom';
import { useStore } from '../store';
import { hasUnsavedChanges } from '../lib/unsavedChanges';
import { useI18n } from './I18nProvider';

export default function NavigationGuard() {
  const { t } = useI18n();
  const location = useLocation();
  useEffect(() => {
    const start = performance.now();
    let frame = requestAnimationFrame(() => { frame = requestAnimationFrame(() => recordDiagnostic('route.ready', performance.now() - start)); });
    return () => cancelAnimationFrame(frame);
  }, [location.key]);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => Boolean(useStore.getState().currentUser) && hasUnsavedChanges() && (
    currentLocation.pathname !== nextLocation.pathname || new URLSearchParams(currentLocation.search).get('taskId') !== new URLSearchParams(nextLocation.search).get('taskId')
  ));
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (window.confirm(t('Discard unsaved changes and leave this page?'))) blocker.proceed();
    else blocker.reset();
  }, [blocker, t]);
  return null;
}
